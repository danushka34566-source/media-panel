'use client';

import { clsx } from 'clsx/lite';
import {
  Media,
  MediaDateRangePostgres,
  formattedDateRangeForMedia,
  isVideoMedia,
  titleForMedia,
} from '.';
import { MediaSetCategory } from '../category';
import ShareButton from '@/share/ShareButton';
import AnimateItems from '@/components/AnimateItems';
import { Fragment, type ReactNode } from 'react';
import DivDebugBaselineGrid from '@/components/DivDebugBaselineGrid';
import MediaPrevNextActions from './MediaPrevNextActions';
import MediaLink from './MediaLink';
import ResponsiveText from '@/components/primitives/ResponsiveText';
import { useAppState } from '@/app/AppState';
import { GRID_GAP_CLASSNAME } from '@/components';
import { useAppText } from '@/i18n/state/client';

export default function MediaHeader({
  photos,
  selectedMedia,
  entity,
  entityVerb: _entityVerb,
  entityDescription,
  entitySubhead,
  indexNumber,
  count,
  dateRange,
  richContent,
  hasAiTextGeneration,
  includeShareButton,
  ...categories
}: {
  photos: Media[]
  selectedMedia?: Media
  entity?: ReactNode
  entityVerb?: string
  entityDescription?: string
  entitySubhead?: string
  indexNumber?: number
  count?: number
  dateRange?: MediaDateRangePostgres
  richContent?: ReactNode
  hasAiTextGeneration: boolean
  includeShareButton?: boolean
} & MediaSetCategory) {
  const { isGridHighDensity } = useAppState();

  const appText = useAppText();
  const entityVerb = _entityVerb ?? appText.photo.photo.toLocaleUpperCase();

  const { start, end } = formattedDateRangeForMedia(photos, dateRange);

  const selectedMediaIndex = selectedMedia
    ? photos.findIndex(photo => photo.id === selectedMedia.id)
    : undefined;

  const paginationIndex = indexNumber || (selectedMediaIndex ?? 0 + 1);
  const paginationCount = count ?? photos.length;

  const headerType = selectedMediaIndex === undefined
    ? 'photo-set'
    : entity
      ? 'photo-detail-with-entity'
      : 'photo-detail';

  const renderPrevNext =
    <MediaPrevNextActions {...{
      photo: selectedMedia,
      photos,
      hasAiTextGeneration,
      ...categories,
    }} />;

  const renderDateRange =
    <span className="text-dim uppercase text-right">
      {start === end
        ? start
        : <>{end}<br />&ndash; {start}</>}
    </span>;

  const renderContentA = entity
    ? <div>
      <div>{entity}</div>
      {entitySubhead &&
        <div className="text-dim whitespace-normal">
          {entitySubhead}
        </div>}
    </div>
    : (
      selectedMedia !== undefined &&
        <MediaLink
          photo={selectedMedia}
          // The detail title is not the originating grid card. Keeping this
          // navigation out of scroll-anchor persistence prevents a later
          // title click from replacing the card position used by Back.
          replace
          className="uppercase font-bold break-all whitespace-normal"
        >
          {titleForMedia(selectedMedia, true)}
        </MediaLink>);

  const renderBlock = (content: ReactNode) =>
    <DivDebugBaselineGrid
      className={clsx(
        'grid',
        GRID_GAP_CLASSNAME,
        'items-start',
        'grid-cols-4',
        isGridHighDensity
          ? 'lg:grid-cols-6'
          : 'md:grid-cols-3 lg:grid-cols-4',
      )}
    >
      {content}
    </DivDebugBaselineGrid>;

  return (
    <div>
      <AnimateItems
      type="bottom"
      distanceOffset={10}
      animateOnFirstLoadOnly
      items={[<Fragment key="MediaHeader">
        {renderBlock(<>
          {/* Content A: Filter Set or Media Title */}
          <div className={clsx(
            'inline-flex uppercase',
            headerType === 'photo-set'
              ? isGridHighDensity
                ? 'col-span-2 lg:col-span-3'
                : 'col-span-2 md:col-span-1 lg:col-span-2'
              : headerType === 'photo-detail-with-entity'
                ? isGridHighDensity
                  ? 'col-span-2 lg:col-span-3'
                  : 'col-span-2 md:col-span-1 lg:col-span-2'
                : isGridHighDensity
                  ? 'col-span-3 sm:col-span-3 lg:col-span-5 w-[110%] xl:w-full'
                  : 'col-span-3 md:col-span-2 lg:col-span-3 w-[110%] xl:w-full',
          )}>
            {headerType === 'photo-detail-with-entity'
              ? renderContentA
              // Necessary for title truncation
              : <h1 className={clsx(
                'w-full break-all whitespace-normal',
                headerType !== 'photo-detail' && 'pr-1 sm:pr-2',
              )}>
                {renderContentA}
              </h1>}
          </div>
          {/* Content B: Filter Set Meta or Media Pagination */}
          <div className={clsx(
            'inline-flex gap-1 self-start',
            'uppercase text-dim',
            headerType === 'photo-set'
              ? isGridHighDensity
                ? 'col-span-2 sm:col-span-1 lg:col-span-2'
                : 'col-span-2 sm:col-span-1'
              : headerType === 'photo-detail-with-entity'
                ? isGridHighDensity
                  ? 'col-span-1 lg:col-span-2'
                  : 'col-span-1'
                : 'hidden!',
          )}>
            {entity && <>
              {headerType === 'photo-set'
                ? <>
                  {entityDescription}
                  {includeShareButton &&
                    <ShareButton {...{
                      photos,
                      ...categories,
                      count,
                      dateRange,
                      className: 'translate-x-[1px] translate-y-[1.5px] w-4',
                      prefetch: true,
                      dim: true,
                    }} />}
                </>
                : <ResponsiveText
                  shortText={appText.utility.paginate(
                    paginationIndex,
                    paginationCount,
                  )}
                >
                  {appText.utility.paginateAction(
                    paginationIndex,
                    paginationCount,
                    entityVerb)}
                </ResponsiveText>}
            </>}
          </div>
          {/* Content C: Nav */}
          <div className={clsx(
            headerType === 'photo-set'
              ? 'hidden sm:flex'
              : 'flex',
            'justify-end',
            // Make full height for prev/next symbols
            'max-sm:h-full',
          )}>
            {selectedMedia
              ? renderPrevNext
              : renderDateRange}
          </div>
        </>)}
        {richContent && renderBlock(
          <div className={clsx(
            // Use 2/3 or 3/4 grid on larger screens
            'col-span-4',
            isGridHighDensity
              ? 'lg:col-span-4'
              : 'lg:col-span-3',
            'mt-12',
          )}>
            {richContent}
          </div>,
        )}
      </Fragment>]}
      />
    </div>
  );
}
