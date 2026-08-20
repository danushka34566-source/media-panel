import { promises as fs } from 'node:fs';
import path from 'node:path';
import ffmpeg from 'fluent-ffmpeg';
import type { FfmpegProgress } from './progress.js';

export type HlsArtifact = { key: string, filePath: string, contentType: string, size: number };
export type HlsRendition = { name: 'high' | '720p', manifest: HlsArtifact, artifacts: HlsArtifact[], width: number, height: number, bandwidth: number };
export type HlsBundle = { directory: string, manifest: HlsArtifact, renditions: HlsRendition[], artifacts: HlsArtifact[] };
const SEGMENT_SECONDS = 6;

const ffmpegErrorWithDiagnostics = (
  error: Error,
  stderr?: string,
  command?: string,
) => {
  const diagnosticLines = stderr?.trim().split(/\r?\n/).slice(-16).join('\n');
  const details = [
    command ? `command: ${command}` : undefined,
    diagnosticLines,
  ].filter(Boolean).join('\n');
  return details ? new Error(`${error.message}\n${details}`) : error;
};

export const getHlsArtifactKeys = (base: string, rendition = '') => {
  const suffix = rendition ? `-${rendition}` : '';
  return { prefix: `${base}-hls${suffix}`, manifest: `${base}-hls${suffix}.m3u8`, init: `${base}-hls${suffix}-init.mp4` };
};
export const isHlsArtifactKey = (key: string) => /^[a-zA-Z0-9._@-]+-hls(?:-(?:high|720p))?(?:\.m3u8|-init\.mp4|-[0-9]{5}\.m4s)$/i.test(key);
export const parseHlsUris = (manifest: string) => {
  const uris: string[] = [];
  for (const m of manifest.matchAll(/#EXT-X-MAP:.*?URI="([^"]+)"/gi)) if (m[1]) uris.push(m[1]);
  for (const line of manifest.split(/\r?\n/)) { const value = line.trim(); if (value && !value.startsWith('#')) uris.push(value); }
  return Array.from(new Set(uris));
};
export const validateHlsVodManifest = (manifest: string, { allowAbsoluteUrls = false } = {}) => {
  if (!manifest.includes('#EXTM3U') || !/#EXT-X-PLAYLIST-TYPE:VOD/i.test(manifest) || !/#EXT-X-MAP:/i.test(manifest) || !/#EXT-X-ENDLIST/i.test(manifest)) throw new Error('HLS manifest is not a complete fMP4 VOD playlist');
  const uris = parseHlsUris(manifest);
  if (uris.length < 2 || (!allowAbsoluteUrls && uris.some(uri => uri.includes('://') || uri.startsWith('/')))) throw new Error('HLS manifest contains invalid artifact URLs');
  return uris;
};
export const validateHlsMasterManifest = (manifest: string, { allowAbsoluteUrls = false } = {}) => {
  if (!manifest.includes('#EXTM3U') || !/#EXT-X-STREAM-INF:/i.test(manifest)) throw new Error('HLS master manifest is incomplete');
  const uris = manifest.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#'));
  if (uris.length < 1 || (!allowAbsoluteUrls && uris.some(uri => uri.includes('://') || uri.startsWith('/')))) throw new Error('HLS master contains invalid rendition URLs');
  return uris;
};
export const rewriteHlsManifestForStableUrls = (manifest: string, { initUrl, segmentUrlPrefix }: { initUrl: string, segmentUrlPrefix: string }) => manifest
  .replace(/(URI=")init\.mp4(")/g, `$1${initUrl}$2`)
  .replace(/(^|\r?\n)segment-(\d{5})(\.m4s)(?=\r?\n|$)/g, (_match, prefix, index, extension) => `${prefix}${segmentUrlPrefix}${index}${extension}`);
export const buildHlsMasterManifest = (renditions: Array<{ manifestUrl: string, width: number, height: number, bandwidth: number }>) => [
  '#EXTM3U', '#EXT-X-VERSION:7', ...renditions.flatMap(r => [
    `#EXT-X-STREAM-INF:BANDWIDTH=${Math.max(1, Math.round(r.bandwidth))},AVERAGE-BANDWIDTH=${Math.max(1, Math.round(r.bandwidth * 0.9))},CODECS="avc1.640028,mp4a.40.2",RESOLUTION=${r.width}x${r.height}`,
    r.manifestUrl,
  ]), '',
].join('\n');

export const get720pDimensions = (sourceWidth: number, sourceHeight: number) => {
  const width = Math.max(2, Math.floor(sourceWidth));
  const height = Math.max(2, Math.floor(sourceHeight));
  const scale = Math.min(1, 1280 / width, 720 / height);
  return {
    width: Math.max(2, Math.floor(width * scale / 2) * 2),
    height: Math.max(2, Math.floor(height * scale / 2) * 2),
  };
};

const generateRendition = async (inputPath: string, base: string, name: 'high' | '720p', width: number, height: number, outputDirectory: string, durationSeconds?: number, onProgress?: (progress: FfmpegProgress) => void): Promise<HlsRendition> => {
  await fs.mkdir(outputDirectory, { recursive: true });
  const manifestPath = path.join(outputDirectory, 'index.m3u8');
  const initPath = path.join(outputDirectory, 'init.mp4');
  const segmentPattern = path.join(outputDirectory, 'segment-%05d.m4s');
  const scale = name === '720p'
    ? 'scale=w=min(iw\\,1280):h=min(ih\\,720):force_original_aspect_ratio=decrease:force_divisible_by=2'
    : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  await new Promise<void>((resolve, reject) => {
    let commandLine: string | undefined;
    // The HLS muxer treats its fMP4 init filename as relative. Give ffmpeg
    // the rendition directory as its process cwd so this remains portable:
    // Linux otherwise prefixes an absolute filename a second time, while
    // Windows otherwise writes a relative filename at the worker root.
    ffmpeg(inputPath, { cwd: outputDirectory }).outputOptions(['-map', '0:v:0', '-map', '0:a:0?', '-sn', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', name === '720p' ? '24' : '22', '-pix_fmt', 'yuv420p', '-vf', scale, '-c:a', 'aac', '-b:a', '128k', '-f', 'hls', '-hls_time', String(SEGMENT_SECONDS), '-hls_playlist_type', 'vod', '-hls_segment_type', 'fmp4', '-hls_fmp4_init_filename', 'init.mp4', '-hls_segment_filename', segmentPattern, '-hls_flags', 'independent_segments', '-force_key_frames', `expr:gte(t,n_forced*${SEGMENT_SECONDS})`]).output(manifestPath).on('start', command => { commandLine = command; }).on('progress', p => onProgress?.(p)).on('end', () => resolve()).on('error', (error, _stdout, stderr) => reject(ffmpegErrorWithDiagnostics(error, stderr ?? undefined, commandLine))).run();
  });
  const manifestText = (await fs.readFile(manifestPath, 'utf8'))
    .replace(/(#EXT-X-MAP:.*?URI=")[^"]+(")/i, '$1init.mp4$2');
  await fs.writeFile(manifestPath, manifestText);
  const uris = validateHlsVodManifest(manifestText);
  const keys = getHlsArtifactKeys(base, name);
  const artifacts: HlsArtifact[] = [];
  for (const relativePath of ['init.mp4', ...uris.filter(uri => uri !== 'init.mp4')]) {
    if (!/^segment-\d{5}\.m4s$/i.test(relativePath) && relativePath !== 'init.mp4') throw new Error(`Unexpected HLS artifact: ${relativePath}`);
    const filePath = path.join(outputDirectory, relativePath); const size = (await fs.stat(filePath)).size;
    artifacts.push({ key: relativePath === 'init.mp4' ? keys.init : `${keys.prefix}-${relativePath.replace(/^segment-/, '')}`, filePath, contentType: relativePath === 'init.mp4' ? 'video/mp4' : 'video/iso.segment', size });
  }
  const totalBytes = artifacts.reduce((sum, item) => sum + item.size, 0);
  const bandwidth = durationSeconds && durationSeconds > 0 ? totalBytes * 8 / durationSeconds * 1.1 : totalBytes * 8;
  return { name, manifest: { key: keys.manifest, filePath: manifestPath, contentType: 'application/vnd.apple.mpegurl', size: (await fs.stat(manifestPath)).size }, artifacts, width, height, bandwidth };
};

export const generateHlsVod = async (inputPath: string, base: string, outputDirectory: string, metadata: { mediaWidth?: number, mediaHeight?: number, durationSeconds?: number }, onProgress?: (progress: FfmpegProgress) => void): Promise<HlsBundle> => {
  const sourceWidth = Math.max(2, Math.floor(metadata.mediaWidth || 720)); const sourceHeight = Math.max(2, Math.floor(metadata.mediaHeight || 404));
  const renditions: HlsRendition[] = [await generateRendition(inputPath, base, 'high', sourceWidth - sourceWidth % 2, sourceHeight - sourceHeight % 2, path.join(outputDirectory, 'high'), metadata.durationSeconds, onProgress)];
  const dimensions720p = get720pDimensions(sourceWidth, sourceHeight);
  if (dimensions720p.width < sourceWidth || dimensions720p.height < sourceHeight) {
    renditions.push(await generateRendition(inputPath, base, '720p', dimensions720p.width, dimensions720p.height, path.join(outputDirectory, '720p'), metadata.durationSeconds, onProgress));
  }
  const masterPath = path.join(outputDirectory, 'index.m3u8'); await fs.mkdir(outputDirectory, { recursive: true }); await fs.writeFile(masterPath, '#EXTM3U\n');
  const master: HlsArtifact = { key: getHlsArtifactKeys(base).manifest, filePath: masterPath, contentType: 'application/vnd.apple.mpegurl', size: (await fs.stat(masterPath)).size };
  return { directory: outputDirectory, manifest: master, renditions, artifacts: renditions.flatMap(r => [r.manifest, ...r.artifacts]) };
};
