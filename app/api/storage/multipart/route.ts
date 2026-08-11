import { NextRequest, NextResponse } from 'next/server';
import { CURRENT_STORAGE } from '@/app/config';
import { isSessionAuthorized } from '@/auth/api';

const DRIVE_BASE_URL = (process.env.DRIVE_STORAGE_BASE_URL || '').replace(/\/+$/, '');
const DRIVE_API_BASE_URL = (() => {
  if (!DRIVE_BASE_URL) {
    return '';
  }
  try {
    return new URL(DRIVE_BASE_URL).origin;
  } catch {
    return '';
  }
})();

export const runtime = 'nodejs';

const driveHeaders = () => ({
  Authorization: `Bearer ${process.env.DRIVE_STORAGE_API_KEY || ''}`,
  'X-Drive-Project': process.env.NEXT_PUBLIC_DRIVE_STORAGE_PROJECT_ID || '',
  'X-Drive-Bucket': process.env.NEXT_PUBLIC_DRIVE_STORAGE_BUCKET || '',
  'Content-Type': 'application/json',
});

export async function POST(request: NextRequest) {
  if (CURRENT_STORAGE !== 'drive') {
    return NextResponse.json({ error: 'Multipart upload bridge is only available for Drive storage' }, { status: 400 });
  }

  if (!await isSessionAuthorized('upload')) {
    return NextResponse.json({ error: 'Unauthorized multipart upload request' }, { status: 401 });
  }

  if (!DRIVE_API_BASE_URL) {
    return NextResponse.json({ error: 'Drive storage base URL is not configured' }, { status: 500 });
  }

  const body = await request.text();

  try {
    const response = await fetch(`${DRIVE_API_BASE_URL}/api/v1/storage/multipart`, {
      method: 'POST',
      headers: driveHeaders(),
      body,
      cache: 'no-store',
    });
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error && error.message
        ? error.message
        : 'Unable to reach Drive multipart upload service',
    }, { status: 500 });
  }
}
