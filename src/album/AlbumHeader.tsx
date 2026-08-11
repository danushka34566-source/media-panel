import { Media, MediaDateRangePostgres } from '@/media';
import MediaHeader from '@/media/MediaHeader';
import {
  AI_CONTENT_GENERATION_ENABLED,
  SHOW_CATEGORY_IMAGE_HOVERS,
} from '@/app/config';
import { getAppText } from '@/i18n/state/server';
import { Album, albumHasMeta, descriptionForAlbumMedia } from '.';
import { safelyParseFormattedHtml } from '@/utility/html';
import MediaAlbum from './MediaAlbum';
import MediaTag from '@/tag/MediaTag';
import IconTag from '@/components/icons/IconTag';
import MaskedScroll from '@/components/MaskedScroll';
import PlaceEntity from '@/place/PlaceEntity';

export default async function AlbumHeader({
  album,
  photos,
  tags = [],
  selectedMedia,
  indexNumber,
  count,
  dateRange,
  showAlbumMeta,
}: {
  album: Album
  photos: Media[]
  tags?: string[]
  selectedMedia?: Media
  indexNumber?: number
  count?: number
  dateRange?: MediaDateRangePostgres
  showAlbumMeta?: boolean
}) {
  const appText = await getAppText();
  return (
    <MediaHeader
      album={album}
      entity={<MediaAlbum
        album={album}
        contrast="high"
        hoverType="none"
        showAdminMenu
      />}
      entityDescription={descriptionForAlbumMedia(
        photos,
        appText,
        undefined,
        count,
      )}
      photos={photos}
      selectedMedia={selectedMedia}
      indexNumber={indexNumber}
      count={count}
      dateRange={dateRange}
      richContent={showAlbumMeta && (albumHasMeta(album) || tags.length > 0)
        ? <div className="space-y-2">
          {album.subhead &&
            <div className="text-medium mb-6 uppercase font-medium">
              {album.subhead}
            </div>}
          {(album.location || tags.length > 0) &&
            <MaskedScroll
              className="whitespace-nowrap space-x-1.5"
              direction="horizontal"
            >
              {album.location &&
                <PlaceEntity
                  place={album.location}
                  className="translate-x-[-2px] mr-1.5!"
                />}
              {tags.length > 0 && <>
                <IconTag
                  className="inline-block text-dim translate-y-[-0.5px]"
                />
                {tags.map(tag => (
                  <MediaTag
                    key={tag}
                    tag={tag}
                    badged
                    type="text-only"
                    contrast="low"
                    hoverType={SHOW_CATEGORY_IMAGE_HOVERS ? 'image' : 'none'}
                    prefetch={false}
                  />
                ))}
              </>}
            </MaskedScroll>}
          {album.description &&
            <div
              className="text-medium [&>a]:underline"
              dangerouslySetInnerHTML={{
                __html: safelyParseFormattedHtml(album.description),
              }}
            />}
        </div>
        : undefined}
      hasAiTextGeneration={AI_CONTENT_GENERATION_ENABLED}
      includeShareButton
    />
  );
}
