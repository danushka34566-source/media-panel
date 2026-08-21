import { NextRequest, NextResponse } from 'next/server';
import { isSessionAuthorized } from '@/auth/api';
import {
  DRIVE_STORAGE_BASE_URL,
  driveCreatePresignedDownload,
  driveKeyFromUrl,
  isUrlFromDrive,
} from '@/platforms/storage/drive-gateway';
import {
  isHlsManifestUrl,
  rewriteDriveHlsManifest,
} from '@/media/full-video-bridge';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = {
  'cache-control': 'no-store, private',
  'x-content-type-options': 'nosniff',
};
const SIGNED_URL_TTL_MS = 14 * 60 * 1000;
const signedDownloads = new Map<string, {
  expiresAt: number
  value: Promise<{ url: string }>
}>();

const getSignedDownload = (key: string) => {
  const cached = signedDownloads.get(key);
  if (cached && cached.expiresAt > Date.now()) { return cached.value; }
  const value = driveCreatePresignedDownload(key);
  signedDownloads.set(key, {
    value,
    expiresAt: Date.now() + SIGNED_URL_TTL_MS,
  });
  void value.catch(() => {
    if (signedDownloads.get(key)?.value === value) {
      signedDownloads.delete(key);
    }
  });
  return value;
};

const requestUrl = (request: NextRequest) => {
  const raw = request.nextUrl.searchParams.get('url');
  if (!raw) { return undefined; }
  try {
    return new URL(raw, DRIVE_STORAGE_BASE_URL || request.nextUrl.origin);
  } catch { return undefined; }
};

export async function GET(request: NextRequest) {
  if (!await isSessionAuthorized('view')) {
    return NextResponse.json({ error: 'Unauthorized media request' }, {
      status: 401,
      headers: NO_STORE_HEADERS,
    });
  }

  const sourceUrl = requestUrl(request);
  if (!sourceUrl || !isUrlFromDrive(sourceUrl.toString())) {
    return NextResponse.json({ error: 'Invalid Drive media URL' }, {
      status: 400,
      headers: NO_STORE_HEADERS,
    });
  }

  try {
    const key = driveKeyFromUrl(sourceUrl.toString());
    const signed = await getSignedDownload(key);
    if (!isHlsManifestUrl(sourceUrl.toString())) {
      return NextResponse.redirect(signed.url, {
        status: 302,
        headers: NO_STORE_HEADERS,
      });
    }

    const upstream = await fetch(signed.url, { cache: 'no-store' });
    if (!upstream.ok) {
      return NextResponse.json({ error: 'Drive media manifest unavailable' }, {
        status: upstream.status === 404 ? 404 : 502,
        headers: NO_STORE_HEADERS,
      });
    }
    const manifest = await upstream.text();
    return new NextResponse(
      rewriteDriveHlsManifest(manifest, sourceUrl.toString()),
      {
        status: 200,
        headers: {
          ...NO_STORE_HEADERS,
          'content-type': 'application/vnd.apple.mpegurl; charset=utf-8',
        },
      },
    );
  } catch (error) {
    console.error('Unable to proxy Drive full-video media', error);
    return NextResponse.json({ error: 'Unable to load Drive media' }, {
      status: 502,
      headers: NO_STORE_HEADERS,
    });
  }
}

// Warm the signed URL without transferring video bytes. GET still performs
// authorization on every playback request before returning the redirect.
export async function HEAD(request: NextRequest) {
  if (!await isSessionAuthorized('view')) {
    return new NextResponse(null, { status: 401, headers: NO_STORE_HEADERS });
  }
  const sourceUrl = requestUrl(request);
  if (!sourceUrl || !isUrlFromDrive(sourceUrl.toString())) {
    return new NextResponse(null, { status: 400, headers: NO_STORE_HEADERS });
  }
  try {
    await getSignedDownload(driveKeyFromUrl(sourceUrl.toString()));
    return new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Unable to warm Drive full-video media', error);
    return new NextResponse(null, { status: 502, headers: NO_STORE_HEADERS });
  }
}
