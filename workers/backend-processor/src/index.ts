import os from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createWriteStream, existsSync, promises as fs } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import {
  getEmbeddedSubtitleTracks,
  type EmbeddedSubtitleTrack,
} from './subtitles.js';
import {
  MOBILE_COMPATIBILITY_ENCODING,
  getCanonicalMp4Strategy,
  getCompatibilityStreamStrategy,
  needsCompatibilityStream,
} from './compatibility-stream.js';
import { uploadStreamDerivative } from './multipart-upload.js';
import {
  getFfmpegProgressPercent,
  type FfmpegProgress,
} from './progress.js';

const BACKEND_ORCHESTRATOR_BASE_URL =
  process.env.BACKEND_ORCHESTRATOR_BASE_URL ?? '';
const BACKEND_PROCESSOR_SHARED_SECRET =
  process.env.BACKEND_PROCESSOR_SHARED_SECRET ?? '';
let POLL_INTERVAL_MS = 15_000;
let IDLE_INTERVAL_MS = 30_000;
let CLAIM_LIMIT = 1;
const RUN_ONCE = process.env.RUN_ONCE === '1';
let HEARTBEAT_INTERVAL_MS = 5_000;
const BACKEND_PROCESSOR_ID = process.env.BACKEND_PROCESSOR_ID ||
  `${os.hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
const DOWNLOAD_IDLE_TIMEOUT_MS = 60_000;
const DOWNLOAD_ATTEMPTS = 3;

const PREVIEW_DURATION_SECONDS = 10;
const PREVIEW_MAX_DURATION_RATIO = 0.3;
const PREVIEW_MAX_WIDTH = 720;

type VideoJob = {
  photoId: string
  sourceUrl: string
  fileNameBase: string
  extension: string
  processingReason?: string
  sourceKey?: string
  canonicalOutputKey?: string
};

type ClaimResponse = {
  jobs?: VideoJob[]
};

type VideoMetadata = {
  durationSeconds?: number
  frameRate?: number
  mediaWidth?: number
  mediaHeight?: number
  videoCodec?: string
  audioCodec?: string
};

type FfmpegProgressCallback = (progress: FfmpegProgress) => void;

type SubtitleFile = EmbeddedSubtitleTrack & {
  fileName: string
  buffer: Buffer
};

const log = (
  event: string,
  details?: Record<string, unknown>,
) => {
  const timestamp = new Date().toISOString();
  if (!details || Object.keys(details).length === 0) {
    console.log(`[${timestamp}] ${event}`);
    return;
  }
  console.log(`[${timestamp}] ${event}`, details);
};

const ffmpegPath = typeof ffmpegStatic === 'string'
  ? ffmpegStatic
  : null;

if (ffmpegPath && existsSync(ffmpegPath)) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}
const ffprobePath = typeof ffprobeStatic === 'string'
  ? ffprobeStatic
  : ffprobeStatic.path;
if (ffprobePath && existsSync(ffprobePath)) {
  ffmpeg.setFfprobePath(ffprobePath);
}

const sleep = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

const normalizeBaseUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(
      'Missing BACKEND_ORCHESTRATOR_BASE_URL in backend processor env',
    );
  }

  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    throw new Error(
      `Invalid BACKEND_ORCHESTRATOR_BASE_URL: "${trimmed}". ` +
      'Expected a full URL like https://your-worker.workers.dev',
    );
  }
};

const BACKEND_ORCHESTRATOR_BASE_URL_NORMALIZED = normalizeBaseUrl(
  BACKEND_ORCHESTRATOR_BASE_URL,
);

const toArrayBuffer = (buffer: Buffer) =>
  buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;

const orchestratorRequest = async (
  pathname: string,
  init?: RequestInit,
) => {
  const response = await fetch(
    `${BACKEND_ORCHESTRATOR_BASE_URL_NORMALIZED}${pathname}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${BACKEND_PROCESSOR_SHARED_SECRET}`,
        ...(init?.headers ?? {}),
      },
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Orchestrator request failed: ${pathname}`);
  }
  return response;
};

const claimJobs = async () =>
  orchestratorRequest(`/jobs/claim?limit=${CLAIM_LIMIT}`)
    .then(res => res.json() as Promise<ClaimResponse>)
    .then(data => data.jobs ?? []);

const loadRuntimeConfig = async () => {
  try {
    const config = await orchestratorRequest('/jobs/config')
      .then(response => response.json() as Promise<Record<string, unknown>>);
    const number = (key: string, fallback: number) => {
      const parsed = Number(config[key]);
      return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
    };
    POLL_INTERVAL_MS = number('pollIntervalMs', POLL_INTERVAL_MS);
    IDLE_INTERVAL_MS = number('idleIntervalMs', IDLE_INTERVAL_MS);
    HEARTBEAT_INTERVAL_MS = number(
      'heartbeatIntervalMs',
      HEARTBEAT_INTERVAL_MS,
    );
    CLAIM_LIMIT = number('claimLimit', CLAIM_LIMIT);
  } catch (error) {
    log('config:fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const sendProcessorPresence = () => orchestratorRequest(
  '/processors/heartbeat',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      processorId: BACKEND_PROCESSOR_ID,
      platform: `${process.platform}/${process.arch}`,
      state: activeJobForShutdown ? 'processing' : 'idle',
    }),
  },
).then(() => undefined);

const getPreviewWindow = (durationSeconds?: number) => {
  const safeDuration = (
    typeof durationSeconds === 'number' &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0
  ) ? durationSeconds : 0;
  const desiredStart = 60;
  const desiredEnd = 300;
  const windowStart = safeDuration >= desiredStart
    ? desiredStart
    : Math.max(safeDuration * 0.5, 0);
  const windowEnd = safeDuration >= desiredEnd
    ? desiredEnd
    : Math.max(windowStart, safeDuration);
  const midpoint = Math.max(
    windowStart + (windowEnd - windowStart) / 2,
    0,
  );
  const previewDuration = safeDuration > 0
    ? Math.min(
      PREVIEW_DURATION_SECONDS,
      Math.max(1, safeDuration * PREVIEW_MAX_DURATION_RATIO),
    )
    : PREVIEW_DURATION_SECONDS;
  const previewSeek = Math.min(
    Math.max(midpoint - previewDuration / 2, 0),
    Math.max(safeDuration - previewDuration, 0),
  );

  return {
    midpoint,
    previewSeek,
    previewDuration,
  };
};

const probeVideo = async (inputPath: string): Promise<{
  metadata: VideoMetadata
  subtitleTracks: EmbeddedSubtitleTrack[]
}> =>
  new Promise((resolve, reject) => {
    ffmpeg(inputPath).ffprobe((error, data) => {
      if (error) {
        reject(error);
        return;
      }
      const videoStream = data.streams?.find(stream => stream.codec_type === 'video');
      const audioStream = data.streams?.find(stream => stream.codec_type === 'audio');
      const parseMaybeNumber = (v: unknown): number | undefined => {
        if (typeof v === 'number') { return Number.isFinite(v) ? v : undefined; }
        if (typeof v === 'string') {
          const n = parseFloat(v);
          return Number.isFinite(n) ? n : undefined;
        }
        return undefined;
      };
      const durationSeconds =
        parseMaybeNumber((videoStream as any)?.duration) ??
        parseMaybeNumber((data as any)?.format?.duration);
      const frameRateRaw = videoStream?.avg_frame_rate;
      let frameRate: number | undefined;
      if (frameRateRaw && frameRateRaw !== '0/0') {
        const [numerator, denominator] = frameRateRaw.split('/');
        const numeratorNumber = Number(numerator);
        const denominatorNumber = Number(denominator);
        frameRate = denominatorNumber !== 0
          ? numeratorNumber / denominatorNumber
          : undefined;
      }
      resolve({
        metadata: {
          durationSeconds,
          frameRate,
          mediaWidth: videoStream?.width,
          mediaHeight: videoStream?.height,
          videoCodec: videoStream?.codec_name,
          audioCodec: audioStream?.codec_name,
        },
        subtitleTracks: getEmbeddedSubtitleTracks(data.streams as any[]),
      });
    });
  });

const generateDerivatives = async (
  inputPath: string,
  fileNameBase: string,
  durationSeconds?: number,
  onPreviewProgress?: FfmpegProgressCallback,
) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'processor-'));
  const posterPath = path.join(tempDir, `${fileNameBase}-poster.jpg`);
  const previewPath = path.join(tempDir, `${fileNameBase}-preview.mp4`);
  const {
    midpoint,
    previewSeek,
    previewDuration,
  } = getPreviewWindow(durationSeconds);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput(midpoint)
      .frames(1)
      .outputOptions(['-qscale:v 2'])
      .output(posterPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput(previewSeek)
      .duration(previewDuration)
      .videoCodec('libx264')
      .noAudio()
      .outputOptions([
        '-movflags', 'faststart',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-vf',
        `scale='min(${PREVIEW_MAX_WIDTH},iw)':-2`,
      ])
      .output(previewPath)
      .on('progress', progress => onPreviewProgress?.(progress))
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });

  const [posterBuffer, previewBuffer] = await Promise.all([
    fs.readFile(posterPath),
    fs.readFile(previewPath),
  ]);
  await fs.rm(tempDir, { recursive: true, force: true });
  return { posterBuffer, previewBuffer };
};

const generateCompatibilityStream = async (
  inputPath: string,
  outputPath: string,
  metadata: VideoMetadata,
  onProgress?: FfmpegProgressCallback,
) => {
  const strategy = getCompatibilityStreamStrategy(metadata);
  return new Promise<void>((resolve, reject) => {
    const command = ffmpeg(inputPath)
      .videoCodec(strategy === 'remux' ? 'copy' : 'libx264')
      .audioCodec(strategy === 'remux' ? 'copy' : 'aac');
    const commonOptions = [
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-sn',
      '-movflags', '+faststart',
      '-max_muxing_queue_size', '1024',
    ];
    const codecOptions = strategy === 'remux'
      ? [
        '-tag:v', metadata.videoCodec?.toLowerCase() === 'hevc'
          ? 'hvc1'
          : 'avc1',
      ]
      : [
        '-preset', MOBILE_COMPATIBILITY_ENCODING.preset,
        '-crf', MOBILE_COMPATIBILITY_ENCODING.crf,
        '-pix_fmt', 'yuv420p',
        '-profile:v', 'high',
        '-tag:v', 'avc1',
        '-profile:a', 'aac_low',
        '-b:a', MOBILE_COMPATIBILITY_ENCODING.audioBitrate,
      ];
    command
      .outputOptions([...commonOptions, ...codecOptions])
      .output(outputPath)
      .on('progress', progress => onProgress?.(progress))
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
};

const generateCanonicalMp4 = async (
  inputPath: string,
  outputPath: string,
  metadata: VideoMetadata,
  onProgress?: FfmpegProgressCallback,
) => new Promise<void>((resolve, reject) => {
  const strategy = getCanonicalMp4Strategy(metadata);
  const command = ffmpeg(inputPath);
  if (strategy === 'remux') {
    command.videoCodec('copy').audioCodec('copy').outputOptions([
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-sn',
      '-movflags', '+faststart',
      '-tag:v', metadata.videoCodec?.toLowerCase() === 'hevc' ? 'hvc1' : 'avc1',
    ]);
  } else {
    command.videoCodec('libx264').audioCodec('alac').outputOptions([
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-sn',
      '-movflags', '+faststart',
      '-qp', '0',
      '-preset', 'veryfast',
    ]);
  }
  command
    .output(outputPath)
    .on('progress', progress => onProgress?.(progress))
    .on('end', () => resolve())
    .on('error', reject)
    .run();
});

const streamDerivativeExists = async (key: string) =>
  orchestratorRequest(
    `/jobs/storage/status?key=${encodeURIComponent(key)}`,
  )
    .then(response => response.json() as Promise<{ exists?: boolean }>)
    .then(data => Boolean(data.exists));

const extractEmbeddedSubtitles = async (
  inputPath: string,
  fileNameBase: string,
  tracks: EmbeddedSubtitleTrack[],
) => {
  if (tracks.length === 0) { return [] as SubtitleFile[]; }
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'processor-subs-'));
  const extracted: SubtitleFile[] = [];

  try {
    for (const track of tracks) {
      const fileName = `${fileNameBase}-subtitles.${track.token}.vtt`;
      const outputPath = path.join(tempDir, fileName);
      try {
        await new Promise<void>((resolve, reject) => {
          ffmpeg(inputPath)
            .outputOptions([
              '-map', `0:${track.streamIndex}`,
              '-c:s', 'webvtt',
              '-f', 'webvtt',
            ])
            .output(outputPath)
            .on('end', () => resolve())
            .on('error', reject)
            .run();
        });
        extracted.push({
          ...track,
          fileName,
          buffer: await fs.readFile(outputPath),
        });
      } catch (error) {
        log('job:subtitle-skipped', {
          streamIndex: track.streamIndex,
          codecName: track.codecName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return extracted;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

const completeJob = async (
  job: VideoJob,
  metadata: VideoMetadata,
  posterBuffer: Buffer,
  previewBuffer: Buffer,
  subtitleFiles: SubtitleFile[],
) => {
  const formData = new FormData();
  formData.set('photoId', job.photoId);
  formData.set('fileNameBase', job.fileNameBase);
  formData.set('metadata', JSON.stringify(metadata));
  formData.set(
    'poster',
    new File([toArrayBuffer(posterBuffer)], `${job.fileNameBase}-poster.jpg`, {
      type: 'image/jpeg',
    }),
  );
  formData.set('subtitleTracks', JSON.stringify(subtitleFiles.map(track => ({
    fileName: track.fileName,
    lang: track.language,
    label: track.label,
  }))));
  subtitleFiles.forEach(track => {
    formData.append(
      'subtitles',
      new File([toArrayBuffer(track.buffer)], track.fileName, {
        type: 'text/vtt',
      }),
    );
  });
  formData.set(
    'preview',
    new File([toArrayBuffer(previewBuffer)], `${job.fileNameBase}-preview.mp4`, {
      type: 'video/mp4',
    }),
  );

  await orchestratorRequest('/jobs/complete', {
    method: 'POST',
    body: formData,
  });
};

const failJob = async (job: VideoJob, error: unknown) => {
  await orchestratorRequest('/jobs/fail', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      photoId: job.photoId,
      transcodeError: error instanceof Error ? error.message : 'Processing failed',
    }),
  }).catch(() => undefined);
};

let activeJobForShutdown: VideoJob | undefined;
let shutdownStarted = false;

const handleProcessorShutdown = async (signal: string) => {
  if (shutdownStarted) { return; }
  shutdownStarted = true;
  log('processor:interrupted', {
    signal,
    photoId: activeJobForShutdown?.photoId,
  });
  if (activeJobForShutdown) {
    await failJob(
      activeJobForShutdown,
      new Error(`Processor interrupted by ${signal}`),
    );
  }
  process.exit(0);
};

process.once('SIGINT', () => { void handleProcessorShutdown('SIGINT'); });
process.once('SIGTERM', () => { void handleProcessorShutdown('SIGTERM'); });

const heartbeatJob = async (job: VideoJob, note: string) =>
  orchestratorRequest('/jobs/heartbeat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      photoId: job.photoId,
      note,
    }),
  }).catch(() => undefined);

const createFfmpegProgressReporter = ({
  job,
  stage,
  durationSeconds,
  updateHeartbeat,
}: {
  job: VideoJob
  stage: string
  durationSeconds?: number
  updateHeartbeat: (note: string) => Promise<unknown>
}): FfmpegProgressCallback => {
  let lastPercent = -1;
  let lastUpdateAt = 0;
  return progress => {
    const rawPercent = getFfmpegProgressPercent(progress, durationSeconds);
    if (rawPercent === undefined) { return; }
    const percent = Math.min(99, Math.max(0, Math.floor(rawPercent)));
    const now = Date.now();
    if (percent === lastPercent || (
      percent < lastPercent + 2 && now - lastUpdateAt < 5_000
    )) {
      return;
    }
    lastPercent = percent;
    lastUpdateAt = now;
    const note = `${stage}: ${percent}%`;
    log('job:progress', { photoId: job.photoId, stage, percent });
    void updateHeartbeat(note);
  };
};

const processJob = async (job: VideoJob) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-job-'));
  const inputPath = path.join(tempDir, `${job.fileNameBase}.${job.extension || 'mp4'}`);
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let heartbeatNote = 'Starting video processing';
  const updateHeartbeat = (note: string) => {
    heartbeatNote = note;
    return heartbeatJob(job, note);
  };

  try {
    activeJobForShutdown = job;
    log('job:start', {
      photoId: job.photoId,
      fileNameBase: job.fileNameBase,
    });
    await updateHeartbeat('Downloading source video: 0%');
    heartbeat = setInterval(() => {
      void heartbeatJob(job, heartbeatNote);
    }, HEARTBEAT_INTERVAL_MS);
    for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      const resetIdleTimer = () => {
        if (idleTimer) { clearTimeout(idleTimer); }
        idleTimer = setTimeout(() => controller.abort(), DOWNLOAD_IDLE_TIMEOUT_MS);
      };
      try {
        const response = await fetch(job.sourceUrl, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Failed to download source video (${response.status})`);
        }
        if (!response.body) {
          throw new Error('Source video download returned no response body');
        }
        const contentLength = Number(response.headers.get('content-length'));
        let downloadedBytes = 0;
        let lastDownloadPercent = -1;
        log('job:download-started', {
          photoId: job.photoId,
          attempt,
          contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
        });
        resetIdleTimer();
        const progress = new Transform({
          transform(chunk, _encoding, callback) {
            resetIdleTimer();
            downloadedBytes += chunk.length;
            if (Number.isFinite(contentLength) && contentLength > 0) {
              const percent = Math.min(
                99,
                Math.floor(downloadedBytes / contentLength * 100),
              );
              if (percent >= lastDownloadPercent + 5) {
                lastDownloadPercent = percent;
                log('job:progress', {
                  photoId: job.photoId,
                  stage: 'Downloading source video',
                  percent,
                });
                void updateHeartbeat(`Downloading source video: ${percent}%`);
              }
            }
            callback(null, chunk);
          },
        });
        await pipeline(
          Readable.fromWeb(response.body as never),
          progress,
          createWriteStream(inputPath),
        );
        break;
      } catch (error) {
        if (attempt >= DOWNLOAD_ATTEMPTS) {
          if (controller.signal.aborted) {
            throw new Error('Source download stalled with no byte progress');
          }
          throw error;
        }
        log('job:download-retry', {
          photoId: job.photoId,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (idleTimer) { clearTimeout(idleTimer); }
      }
    }
    log('job:downloaded', {
      photoId: job.photoId,
      inputPath,
    });
    await updateHeartbeat('Probing source video');
    const { metadata, subtitleTracks } = await probeVideo(inputPath);
    log('job:metadata', {
      photoId: job.photoId,
      ...metadata,
    });
    if (job.canonicalOutputKey) {
      await updateHeartbeat('Creating canonical MP4: 0%');
      const canonicalPath = path.join(tempDir, `${job.fileNameBase}.mp4`);
      await generateCanonicalMp4(
        inputPath,
        canonicalPath,
        metadata,
        createFfmpegProgressReporter({
          job,
          stage: 'Creating canonical MP4',
          durationSeconds: metadata.durationSeconds,
          updateHeartbeat,
        }),
      );
      const canonicalSize = (await fs.stat(canonicalPath)).size;
      await updateHeartbeat('Uploading canonical MP4: 0%');
      let lastCanonicalUploadPercent = -1;
      await uploadStreamDerivative({
        request: orchestratorRequest,
        filePath: canonicalPath,
        key: job.canonicalOutputKey,
        photoId: job.photoId,
        contentType: 'video/mp4',
        onProgress: (completed, total) => {
          const percent = total > 0
            ? Math.floor(completed / total * 10) * 10
            : 100;
          if (percent !== lastCanonicalUploadPercent) {
            lastCanonicalUploadPercent = percent;
            log('job:progress', {
              photoId: job.photoId,
              stage: 'Uploading canonical MP4',
              percent,
            });
            void updateHeartbeat(`Uploading canonical MP4: ${percent}%`);
          }
        },
      });
      await orchestratorRequest('/jobs/canonical/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoId: job.photoId,
          key: job.canonicalOutputKey,
          size: canonicalSize,
        }),
      });
      log('job:canonical-mp4-committed', {
        photoId: job.photoId,
        key: job.canonicalOutputKey,
        bytes: canonicalSize,
      });
    }
    const streamKey = `${job.fileNameBase}-stream.mp4`;
    const compatibilityStrategy = getCompatibilityStreamStrategy(metadata);
    const compatibilityRequired = job.canonicalOutputKey
      ? compatibilityStrategy === 'transcode'
      : needsCompatibilityStream(job.extension, metadata);
    const rebuildCompatibilityStream =
      job.processingReason?.toLowerCase().includes('compatibility stream') ??
      false;
    if (
      compatibilityRequired &&
      (rebuildCompatibilityStream || !await streamDerivativeExists(streamKey))
    ) {
      const streamStrategy = getCompatibilityStreamStrategy(metadata);
      await updateHeartbeat(
        streamStrategy === 'remux'
          ? 'Remuxing original-quality compatibility stream'
          : 'Generating mobile-compatible video stream',
      );
      const streamPath = path.join(tempDir, streamKey);
      await generateCompatibilityStream(
        inputPath,
        streamPath,
        metadata,
        createFfmpegProgressReporter({
          job,
          stage: streamStrategy === 'remux'
            ? 'Remuxing compatibility stream'
            : 'Generating mobile-compatible stream',
          durationSeconds: metadata.durationSeconds,
          updateHeartbeat,
        }),
      );
      const streamBytes = (await fs.stat(streamPath)).size;
      log('job:stream-ready', {
        photoId: job.photoId,
        streamKey,
        streamBytes,
        streamStrategy,
      });
      await updateHeartbeat('Uploading mobile-compatible stream: 0%');
      let lastProgressPercent = -1;
      await uploadStreamDerivative({
        request: orchestratorRequest,
        filePath: streamPath,
        key: streamKey,
        photoId: job.photoId,
        contentType: 'video/mp4',
        onProgress: (completed, total) => {
          const percent = total > 0 ? Math.floor(completed / total * 10) * 10 : 100;
          if (percent !== lastProgressPercent) {
            lastProgressPercent = percent;
            log('job:stream-upload-progress', {
              photoId: job.photoId,
              percent,
            });
            void updateHeartbeat(
              `Uploading mobile-compatible stream: ${percent}%`,
            );
          }
        },
      });
      log('job:stream-uploaded', {
        photoId: job.photoId,
        streamKey,
        streamBytes,
      });
    }
    await updateHeartbeat('Generating poster and preview: 0%');
    const { posterBuffer, previewBuffer } = await generateDerivatives(
      inputPath,
      job.fileNameBase,
      metadata.durationSeconds,
      createFfmpegProgressReporter({
        job,
        stage: 'Generating preview',
        durationSeconds: Math.min(
          PREVIEW_DURATION_SECONDS,
          Math.max(1, (metadata.durationSeconds || 0) *
            PREVIEW_MAX_DURATION_RATIO),
        ),
        updateHeartbeat,
      }),
    );
    await updateHeartbeat('Extracting embedded subtitles');
    const subtitleFiles = await extractEmbeddedSubtitles(
      inputPath,
      job.fileNameBase,
      subtitleTracks,
    );
    log('job:derivatives-ready', {
      photoId: job.photoId,
      posterBytes: posterBuffer.byteLength,
      previewBytes: previewBuffer.byteLength,
      subtitleTracks: subtitleFiles.map(track => ({
        fileName: track.fileName,
        language: track.language,
        label: track.label,
      })),
    });
    await updateHeartbeat('Uploading processed files');
    await completeJob(
      job,
      metadata,
      posterBuffer,
      previewBuffer,
      subtitleFiles,
    );
    log('job:complete', {
      photoId: job.photoId,
    });
  } catch (error) {
    log('job:failed', {
      photoId: job.photoId,
      error: error instanceof Error ? error.message : String(error),
    });
    await failJob(job, error);
    throw error;
  } finally {
    if (activeJobForShutdown?.photoId === job.photoId) {
      activeJobForShutdown = undefined;
    }
    if (heartbeat) {
      clearInterval(heartbeat);
    }
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
};

const runOnce = async () => {
  const jobs = await claimJobs();
  log('poll:claimed', {
    count: jobs.length,
    photoIds: jobs.map(job => job.photoId),
  });
  let processed = 0;
  for (const job of jobs) {
    await processJob(job);
    processed += 1;
  }
  return processed;
};

const main = async () => {
  await loadRuntimeConfig();
  await sendProcessorPresence().catch(() => undefined);
  const presence = setInterval(() => {
    void sendProcessorPresence().catch(error => log('presence:error', {
      error: error instanceof Error ? error.message : String(error),
    }));
  }, Math.max(HEARTBEAT_INTERVAL_MS, 5_000));
  presence.unref();
  log('processor:start', {
    processorId: BACKEND_PROCESSOR_ID,
    orchestrator: BACKEND_ORCHESTRATOR_BASE_URL_NORMALIZED,
    pollIntervalMs: POLL_INTERVAL_MS,
    idleIntervalMs: IDLE_INTERVAL_MS,
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    claimLimit: CLAIM_LIMIT,
    runOnce: RUN_ONCE,
    ffmpegPath,
    ffprobePath,
  });
  if (RUN_ONCE) {
    await runOnce();
    return;
  }
  while (true) {
    try {
      const processed = await runOnce();
      if (processed === 0) {
        log('poll:idle');
      }
      await sleep(processed > 0 ? POLL_INTERVAL_MS : IDLE_INTERVAL_MS);
    } catch (error) {
      log('processor:error', {
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(IDLE_INTERVAL_MS);
    }
  }
};

void main();
