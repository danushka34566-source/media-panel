import AnimateItems from '@/components/AnimateItems';
import Note from '@/components/Note';
import AppGrid from '@/components/AppGrid';
import MediaGrid from '@/media/MediaGrid';
import { getMediaMetaCached, getMediaNoStore } from '@/media/cache';
import { absolutePathForTag } from '@/app/path';
import { TAG_PRIVATE, descriptionForTaggedMedia, titleForTag } from '@/tag';
import PrivateHeader from '@/tag/PrivateHeader';
import { Metadata } from 'next';
import { cache } from 'react';
import { getAppText } from '@/i18n/state/server';

const getMediaHiddenMetaCached = cache(() =>
  getMediaMetaCached({ hidden: 'only' }));

export async function generateMetadata(): Promise<Metadata> {
  const { count, dateRange } = await getMediaHiddenMetaCached();

  if (count === 0) { return {}; }

  const appText = await getAppText();
  
  const title = titleForTag(TAG_PRIVATE, undefined, appText, count);

  const description = descriptionForTaggedMedia(
    undefined,
    appText,
    undefined,
    count,
    dateRange,
  );
  const url = absolutePathForTag(TAG_PRIVATE);

  return {
    title,
    openGraph: {
      title,
      description,
      url,
    },
    twitter: {
      description,
      card: 'summary_large_image',
    },
    description,
  };
}

export default async function PrivateTagPage() {
  const [
    photos,
    { count, dateRange },
  ] = await Promise.all([
    getMediaNoStore({ hidden: 'only' }),
    getMediaHiddenMetaCached(),
  ]);

  return (
    <AppGrid
      contentMain={<div className="space-y-4 mt-4">
        <AnimateItems
          type="bottom"
          items={[<PrivateHeader
            key="PrivateHeader"
            {...{ photos, count, dateRange }}
          />]}
          animateOnFirstLoadOnly
        />
        <div className="space-y-6">
          <Note animate>
            Visible only to admins (uploads only secure via obscurity)
          </Note>
          <MediaGrid {...{ photos }} />
        </div>
      </div>}
    />
  );
}
