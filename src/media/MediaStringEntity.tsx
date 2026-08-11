import MediaHeader from './MediaHeader';
import MediaGridContainer from './MediaGridContainer';
import { Media, MediaDateRangePostgres, descriptionForMediaSet, photoQuantityText } from '.';
import { capitalizeWords } from '@/utility/string';
import { getAppText } from '@/i18n/state/server';
import Link from 'next/link';
import { ReactNode } from 'react';
import { AI_CONTENT_GENERATION_ENABLED } from '@/app/config';

export type MediaStringEntityKind =
  'category' |
  'studio' |
  'performer' |
  'content type';

const ENTITY_VERBS: Record<MediaStringEntityKind, string> = {
  category: 'categorized',
  studio: 'from studio',
  performer: 'with performer',
  'content type': 'with content type',
};

export const formatMediaStringEntity = (value: string) =>
  capitalizeWords(value.replaceAll('-', ' '));

export const titleForMediaStringEntity = async (
  kind: MediaStringEntityKind,
  value: string,
  photos: Media[] = [],
  explicitCount?: number,
) => {
  const appText = await getAppText();
  return [
    formatMediaStringEntity(value),
    photoQuantityText(explicitCount ?? photos.length, appText),
  ].join(' ');
};

export const descriptionForMediaStringEntity = async (
  kind: MediaStringEntityKind,
  value: string,
  photos: Media[] = [],
  explicitCount?: number,
  explicitDateRange?: MediaDateRangePostgres,
) => {
  const appText = await getAppText();
  return descriptionForMediaSet(
    photos,
    appText,
    `${kind} media`,
    true,
    explicitCount,
    explicitDateRange,
  );
};

export async function MediaStringEntityHeader({
  kind,
  value,
  path,
  photos,
  selectedMedia,
  indexNumber,
  count,
  dateRange,
  includeShareButton,
  categoryProps,
}: {
  kind: MediaStringEntityKind
  value: string
  path: string
  photos: Media[]
  selectedMedia?: Media
  indexNumber?: number
  count?: number
  dateRange?: MediaDateRangePostgres
  includeShareButton?: boolean
  categoryProps?: Record<string, unknown>
}) {
  const appText = await getAppText();
  const label = formatMediaStringEntity(value);

  return (
    <MediaHeader
      entity={
        <Link href={path} className="hover:underline">
          {label}
        </Link>
      }
      entityVerb={ENTITY_VERBS[kind]}
      entitySubhead={kind.toUpperCase()}
      entityDescription={descriptionForMediaSet(
        photos,
        appText,
        `${kind} media`,
        false,
        count,
        dateRange,
      )}
      photos={photos}
      selectedMedia={selectedMedia}
      indexNumber={indexNumber}
      count={count}
      dateRange={dateRange}
      hasAiTextGeneration={AI_CONTENT_GENERATION_ENABLED}
      includeShareButton={includeShareButton}
      {...(categoryProps ?? {})}
    />
  );
}

export function MediaStringEntityOverview({
  cacheKey,
  header,
  photos,
  count,
  categoryProps,
}: {
  cacheKey: string
  header: ReactNode
  photos: Media[]
  count: number
  categoryProps?: Record<string, unknown>
}) {
  return (
    <MediaGridContainer
      cacheKey={cacheKey}
      photos={photos}
      count={count}
      header={header}
      {...(categoryProps ?? {})}
    />
  );
}
