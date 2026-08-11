import { NextRequest, NextResponse } from 'next/server';
import { isAutomationApiAuthorized } from '@/auth/api';
import {
  findProcessedUploadMedia,
  registerUploadForAutomation,
} from '@/media/actions';
import {
  generateLocalNaivePostgresString,
  generateLocalPostgresString,
} from '@/utility/date';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!await isAutomationApiAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    url?: string
    title?: string
    originalFileName?: string
  };
  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  const title = body.title?.trim() || undefined;
  const originalFileName = body.originalFileName?.trim() || undefined;

  await registerUploadForAutomation({
    url,
    title,
    originalFileName,
    takenAtLocal: generateLocalPostgresString(),
    takenAtNaiveLocal: generateLocalNaivePostgresString(),
  });

  const media = await findProcessedUploadMedia(url, originalFileName);
  if (!media) {
    return NextResponse.json({
      error: 'Upload registration completed but media lookup failed',
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    media: {
      id: media.id,
      url: media.url,
      posterUrl: media.posterUrl ?? null,
      previewUrl: media.previewUrl ?? null,
      mediaType: media.mediaType,
      extension: media.extension,
      title: media.title ?? null,
    },
  });
}
