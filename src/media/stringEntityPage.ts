import { INFINITE_SCROLL_GRID_INITIAL, Media } from '.';
import {
  absolutePathForCategory,
  absolutePathForCategoryImage,
  absolutePathForContentType,
  absolutePathForContentTypeImage,
  absolutePathForPerformer,
  absolutePathForPerformerImage,
  absolutePathForStudio,
  absolutePathForStudioImage,
  pathForCategory,
  pathForContentType,
  pathForPerformer,
  pathForStudio,
} from '@/app/path';
import { getMediaCached, getMediaMetaCached, getMediaNearIdCached } from './cache';
import { cache } from 'react';
import { RELATED_GRID_MEDIA_TO_SHOW } from './index';
import { MediaStringEntityKind, descriptionForMediaStringEntity, formatMediaStringEntity, titleForMediaStringEntity } from './MediaStringEntity';

export type StringEntityRouteKey =
  'category' |
  'studio' |
  'performer' |
  'contentType';

const KIND_BY_KEY: Record<StringEntityRouteKey, MediaStringEntityKind> = {
  category: 'category',
  studio: 'studio',
  performer: 'performer',
  contentType: 'content type',
};

export const getStringEntityKind = (key: StringEntityRouteKey) => KIND_BY_KEY[key];

export const getStringEntityOptions = (
  key: StringEntityRouteKey,
  value: string,
) => ({ [key]: value });

export const getStringEntityPath = (
  key: StringEntityRouteKey,
  value: string,
) => {
  switch (key) {
    case 'category': return pathForCategory(value);
    case 'studio': return pathForStudio(value);
    case 'performer': return pathForPerformer(value);
    case 'contentType': return pathForContentType(value);
  }
};

const getStringEntityAbsolutePath = (
  key: StringEntityRouteKey,
  value: string,
) => {
  switch (key) {
    case 'category': return absolutePathForCategory(value);
    case 'studio': return absolutePathForStudio(value);
    case 'performer': return absolutePathForPerformer(value);
    case 'contentType': return absolutePathForContentType(value);
  }
};

const getStringEntityAbsoluteImagePath = (
  key: StringEntityRouteKey,
  value: string,
) => {
  switch (key) {
    case 'category': return absolutePathForCategoryImage(value);
    case 'studio': return absolutePathForStudioImage(value);
    case 'performer': return absolutePathForPerformerImage(value);
    case 'contentType': return absolutePathForContentTypeImage(value);
  }
};

export const getStringEntityOverviewDataCached = cache((
  key: StringEntityRouteKey,
  value: string,
) => Promise.all([
  getMediaCached({
    ...getStringEntityOptions(key, value),
    limit: INFINITE_SCROLL_GRID_INITIAL,
  }),
  getMediaMetaCached(getStringEntityOptions(key, value)),
]));

export const getStringEntityMediaNearIdCached = cache((
  photoId: string,
  key: StringEntityRouteKey,
  value: string,
) => getMediaNearIdCached(
  photoId,
  { ...getStringEntityOptions(key, value), limit: (RELATED_GRID_MEDIA_TO_SHOW * 2) + 1 },
));

export const generateMetadataForStringEntity = async (
  key: StringEntityRouteKey,
  value: string,
  photos: Media[],
  count?: number,
  dateRange?: { start: string, end: string },
) => {
  const kind = getStringEntityKind(key);
  const title = await titleForMediaStringEntity(kind, value, photos, count);
  const description = await descriptionForMediaStringEntity(
    kind,
    value,
    photos,
    count,
    dateRange,
  );

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: getStringEntityAbsoluteImagePath(key, value),
      url: getStringEntityAbsolutePath(key, value),
    },
    twitter: {
      title,
      description,
      images: getStringEntityAbsoluteImagePath(key, value),
      card: 'summary_large_image' as const,
    },
  };
};

export const getStringEntityCacheKey = (
  key: StringEntityRouteKey,
  value: string,
) => `${key}-${value}`;

export const getStringEntityLabel = (value: string) =>
  formatMediaStringEntity(value);
