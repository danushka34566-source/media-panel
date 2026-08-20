import { NextRequest, NextResponse } from 'next/server';
import { isSessionAuthorized } from '@/auth/api';
import {
  DRIVE_STORAGE_OBJECT_BASE_URL,
  driveCreatePresignedDownload,
  driveKeyFromUrl,
  isUrlFromDrive,
} from '@/platforms/storage/drive-gateway';
import {
  getSubtitleProxyManifestUrl,
  parseSubtitleManifest,
} from '@/media/subtitle-manifest';

export const runtime = 'nodejs';

const CACHE_HEADERS = {
  'cache-control': 'no-store',
};

const isMediaIdValid = (value: string) => /^[a-zA-Z0-9_-]+$/.test(value);

const fetchManifest = async (mediaId: string) => {
  if (!DRIVE_STORAGE_OBJECT_BASE_URL) { return undefined; }
  const url = [
    DRIVE_STORAGE_OBJECT_BASE_URL,
    `${mediaId}-subtitles.json`,
  ].join('/');
  const signed = await driveCreatePresignedDownload(driveKeyFromUrl(url));
  const response = await fetch(signed.url, { cache: 'no-store' });
  if (!response.ok) { return undefined; }
  return parseSubtitleManifest(await response.json().catch(() => null));
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ mediaId: string }> },
) {
  if (!await isSessionAuthorized('view')) {
    return NextResponse.json(
      { error: 'Unauthorized subtitle request' },
      { status: 401, headers: CACHE_HEADERS },
    );
  }
  const { mediaId: rawMediaId } = await context.params;
  const mediaId = decodeURIComponent(rawMediaId || '');
  if (!isMediaIdValid(mediaId)) {
    return NextResponse.json(
      { error: 'Invalid media ID' },
      { status: 400, headers: CACHE_HEADERS },
    );
  }

  try {
    const tracks = await fetchManifest(mediaId);
    if (!tracks || tracks.length === 0) {
      return NextResponse.json(
        { error: 'Subtitles not found' },
        { status: 404, headers: CACHE_HEADERS },
      );
    }

    const trackParam = request.nextUrl.searchParams.get('track');
    if (trackParam === null) {
      const proxyBase = getSubtitleProxyManifestUrl(mediaId);
      return NextResponse.json({
        tracks: tracks.map((track, index) => ({
          ...track,
          src: `${proxyBase}?track=${index}`,
        })),
      }, { headers: CACHE_HEADERS });
    }

    const trackIndex = Number.parseInt(trackParam, 10);
    const track = Number.isInteger(trackIndex)
      ? tracks[trackIndex]
      : undefined;
    if (!track) {
      return NextResponse.json(
        { error: 'Subtitle track not found' },
        { status: 404, headers: CACHE_HEADERS },
      );
    }

    if (!isUrlFromDrive(track.src)) {
      return NextResponse.json(
        { error: 'Invalid subtitle track URL' },
        { status: 400, headers: CACHE_HEADERS },
      );
    }
    const signed = await driveCreatePresignedDownload(driveKeyFromUrl(track.src));
    const response = await fetch(signed.url, { cache: 'no-store' });
    if (!response.ok || !response.body) {
      return NextResponse.json(
        { error: 'Subtitle track unavailable' },
        { status: 502, headers: CACHE_HEADERS },
      );
    }
    return new NextResponse(response.body, {
      headers: {
        ...CACHE_HEADERS,
        'content-type': 'text/vtt; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Unable to load subtitle track', error);
    return NextResponse.json(
      { error: 'Unable to load subtitles' },
      { status: 502, headers: CACHE_HEADERS },
    );
  }
}
