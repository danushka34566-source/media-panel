import { NextRequest, NextResponse } from 'next/server';
import { isSessionAuthorized } from '@/auth/api';
import { isUploadPathnameValid } from '@/media/storage';
import {
  CURRENT_STORAGE,
  HAS_DRIVE_STORAGE,
  HAS_CLOUDFLARE_R2_STORAGE,
} from '@/app/config';
import { driveCreatePresignedUpload, driveFinalizeUpload } from '@/platforms/storage/drive-gateway';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  cloudflareR2Client,
  cloudflareR2PutObjectCommandForKey,
} from '@/platforms/storage/cloudflare-r2';

const PRESIGNED_URL_TTL_SECONDS = 60 * 60 * 4;
export const runtime = 'nodejs';

const createSignedUrlForKey = (key: string) => {
  switch (CURRENT_STORAGE) {
    case 'cloudflare-r2':
      if (!HAS_CLOUDFLARE_R2_STORAGE) {
        throw new Error('Cloudflare R2 storage is not configured');
      }
      return getSignedUrl(
        cloudflareR2Client(),
        cloudflareR2PutObjectCommandForKey(key),
        { expiresIn: PRESIGNED_URL_TTL_SECONDS },
      );
    case 'drive':
      if (!HAS_DRIVE_STORAGE) {
        throw new Error('Drive storage is not configured');
      }
      return driveCreatePresignedUpload(key).then(data => data.url);
  }
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ key: string }> },
) {
  if (!await isSessionAuthorized('upload')) {
    return NextResponse.json({ error: 'Unauthorized upload request' }, { status: 401 });
  }

  const { key: rawKey } = await context.params;
  const key = rawKey ? decodeURIComponent(rawKey) : '';
  if (!key || !isUploadPathnameValid(key)) {
    return NextResponse.json({ error: 'Invalid upload key' }, { status: 400 });
  }

  try {
    const signedUrl = await createSignedUrlForKey(key);
    return new NextResponse(signedUrl, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Failed to generate presigned upload URL', error);
    return NextResponse.json(
      {
        error: error instanceof Error && error.message
          ? error.message
          : 'Unable to generate upload URL',
      },
      { status: 500 },
    );
  }
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ key: string }> },
) {
  if (CURRENT_STORAGE !== 'drive') {
    return NextResponse.json({ error: 'Finalize is only required for Drive storage' }, { status: 400 });
  }

  if (!await isSessionAuthorized('upload')) {
    return NextResponse.json({ error: 'Unauthorized upload finalize request' }, { status: 401 });
  }

  const { key: rawKey } = await context.params;
  const key = rawKey ? decodeURIComponent(rawKey) : '';
  if (!key || !isUploadPathnameValid(key)) {
    return NextResponse.json({ error: 'Invalid upload key' }, { status: 400 });
  }

  try {
    const data = await driveFinalizeUpload(key);
    return NextResponse.json(data, { status: 200, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('Failed to finalize Drive upload', error);
    return NextResponse.json({
      error: error instanceof Error && error.message
        ? error.message
        : 'Unable to finalize upload',
    }, { status: 500 });
  }
}
