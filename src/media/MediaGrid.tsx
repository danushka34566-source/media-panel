'use client';

import { Media } from '.';
import { MediaSetCategory } from '../category';
import MediaMedium from './MediaMedium';
import { clsx } from 'clsx/lite';
import AnimateItems from '@/components/AnimateItems';
import { GRID_ASPECT_RATIO } from '@/app/config';
import { useAppState } from '@/app/AppState';
import SelectTileOverlay from '@/components/SelectTileOverlay';
import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { GRID_GAP_CLASSNAME } from '@/components';
import { useSelectMediaState } from '@/admin/select/SelectMediaState';
import { DATA_KEY_MEDIA_GRID } from '@/admin/select/SelectMediaProvider';
import {
  getSmartPreviewIds,
  shouldAutoplayGridPreview,
  shouldPreloadGridPreview,
  shouldSuspendDetailSmartPreviews,
} from './smart-preview-rows';
import {
  DETAIL_MAIN_VIDEO_PLAYBACK_EVENT,
  type DetailMainVideoPlayback,
} from './detail-video-playback';
import PersonalFavoriteButton from './PersonalFavoriteButton';

const WIDE_GRID_ASPECT_RATIO = 16 / 9;
const SMART_PREVIEW_ACTIVATION_EVENT = 'media-grid-smart-preview-activation';

type SmartPreviewActivationDetail = {
  activeIds: string[]
}

const getDocumentLayoutTop = (card: HTMLElement) => {
  let element = card.parentElement;
  let top = 0;
  while (element) {
    top += element.offsetTop;
    element = element.offsetParent as HTMLElement | null;
  }
  return top;
};

export default function MediaGrid({
  photos,
  selectedMedia,
  prioritizeInitialMedia,
  className,
  classNameMedia,
  animate = true,
  canStart,
  animateOnFirstLoadOnly,
  staggerOnFirstLoadOnly = true,
  additionalTile,
  small,
  selectable = true,
  autoplaySmartPreviews = false,
  suspendSmartPreviewsOnMainPlayback = false,
  mountPreviewsOnlyWhenVisible = false,
  prefetchInitialMediaLinks = true,
  sequenceVideoPreviewStartup = true,
  enableVideoPreviews = true,
  onLastMediaVisible,
  onAnimationComplete,
  ...categories
}: {
  photos: Media[]
  selectedMedia?: Media
  prioritizeInitialMedia?: boolean
  className?: string
  classNameMedia?: string
  animate?: boolean
  canStart?: boolean
  animateOnFirstLoadOnly?: boolean
  staggerOnFirstLoadOnly?: boolean
  additionalTile?: ReactNode
  small?: boolean
  selectable?: boolean
  autoplaySmartPreviews?: boolean
  suspendSmartPreviewsOnMainPlayback?: boolean
  mountPreviewsOnlyWhenVisible?: boolean
  prefetchInitialMediaLinks?: boolean
  sequenceVideoPreviewStartup?: boolean
  enableVideoPreviews?: boolean
  onLastMediaVisible?: () => void
  onAnimationComplete?: () => void
} & MediaSetCategory) {
  const {
    isGridHighDensity,
    isWideGrid,
    videoPreviewMode = 'smart',
    supportsHover,
  } = useAppState();
  const [smartPreviewIds, setSmartPreviewIds] = useState<Set<string>>(new Set());
  const [isMainVideoPlaying, setIsMainVideoPlaying] = useState(false);
  const [focusedPreviewId, setFocusedPreviewId] = useState<string>();
  const previewGroupId = useId();
  const smartActivationFrameRef = useRef<number | undefined>(undefined);
  const pendingSmartCardIdRef = useRef<string | undefined>(undefined);
  const activeSmartCardIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!suspendSmartPreviewsOnMainPlayback) { return; }
    const syncMainVideoPlayback = (event: Event) => {
      const { playing } = (
        event as CustomEvent<DetailMainVideoPlayback>
      ).detail;
      setIsMainVideoPlaying(playing);
    };
    window.addEventListener(
      DETAIL_MAIN_VIDEO_PLAYBACK_EVENT,
      syncMainVideoPlayback,
    );
    return () => window.removeEventListener(
      DETAIL_MAIN_VIDEO_PLAYBACK_EVENT,
      syncMainVideoPlayback,
    );
  }, [suspendSmartPreviewsOnMainPlayback]);
  const areSmartPreviewsSuspended = shouldSuspendDetailSmartPreviews(
    videoPreviewMode,
    suspendSmartPreviewsOnMainPlayback,
    isMainVideoPlaying,
  );
  useEffect(() => {
    const syncActivePreviews = (event: Event) => {
      const { activeIds } = (
        event as CustomEvent<SmartPreviewActivationDetail>
      ).detail;
      const activeIdSet = new Set(activeIds);
      const nextIds = new Set(photos
        .map(photo => photo.id)
        .filter(id => activeIdSet.has(id)));
      setSmartPreviewIds(current => (
        current.size === nextIds.size &&
        [...current].every(id => nextIds.has(id))
      ) ? current : nextIds);
    };
    window.addEventListener(SMART_PREVIEW_ACTIVATION_EVENT, syncActivePreviews);
    return () => window.removeEventListener(
      SMART_PREVIEW_ACTIVATION_EVENT,
      syncActivePreviews,
    );
  }, [photos]);
  const activateSmartRows = (
    target: EventTarget | null,
    grid: HTMLDivElement,
    pointerType: string,
  ) => {
    if (videoPreviewMode !== 'smart' || autoplaySmartPreviews) { return; }
    if (supportsHover ? pointerType !== 'mouse' : pointerType !== 'touch') {
      return;
    }
    const card = (target as HTMLElement | null)?.closest<HTMLElement>('[data-preview-id]');
    if (!card || !grid.contains(card)) { return; }
    const cardId = card.dataset.previewId;
    if (!cardId) { return; }
    setFocusedPreviewId(current => current === cardId ? current : cardId);
    if (activeSmartCardIdRef.current === cardId) { return; }
    pendingSmartCardIdRef.current = cardId;
    if (smartActivationFrameRef.current !== undefined) { return; }
    smartActivationFrameRef.current = requestAnimationFrame(() => {
      smartActivationFrameRef.current = undefined;
      const activeId = pendingSmartCardIdRef.current;
      pendingSmartCardIdRef.current = undefined;
      if (!activeId || activeSmartCardIdRef.current === activeId) { return; }
      activeSmartCardIdRef.current = activeId;
      const cards = Array.from(grid.querySelectorAll<HTMLElement>(
        '[data-media-smart-preview-card]',
      ));
      // Framer Motion transforms each wrapper during entrance animations, so
      // viewport coordinates can temporarily split one visual row. offsetTop
      // on the direct grid child is stable because transforms do not affect
      // layout. Scope the scan to this grid to avoid remeasuring every loaded
      // infinite-scroll page on each touch move.
      const activeIds = [...getSmartPreviewIds(cards.flatMap(item => {
        const id = item.dataset.previewId;
        return id ? [{ id, layoutTop: getDocumentLayoutTop(item) }] : [];
      }), activeId, true)];
      window.dispatchEvent(new CustomEvent<SmartPreviewActivationDetail>(
        SMART_PREVIEW_ACTIVATION_EVENT,
        { detail: { activeIds } },
      ));
    });
  };

  const {
    isSelectingMedia,
    selectedMediaIds,
    setSelectedMediaIds,
  } = useSelectMediaState();
  return (
    <div
      {...{ [DATA_KEY_MEDIA_GRID]: selectable, className }}
    >
      <AnimateItems
        // Preserve the actual card/image/video nodes while grid contents grow.
        // The mode switch animates only visible surfaces, outside Framer's
        // all-item projection, so long feeds remain cheap to scroll.
        onPointerDown={event => {
          const card = (event.target as HTMLElement | null)
            ?.closest<HTMLElement>('[data-preview-id]');
          if (card?.dataset.previewId) {
            setFocusedPreviewId(card.dataset.previewId);
          }
          activateSmartRows(
            event.target,
            event.currentTarget,
            event.pointerType,
          );
        }}
        onPointerMove={event => activateSmartRows(
          event.pointerType === 'touch'
            ? document.elementFromPoint(event.clientX, event.clientY)
            : event.target,
          event.currentTarget,
          event.pointerType,
        )}
        onPointerLeave={event => {
          if (supportsHover && event.pointerType === 'mouse') {
            setFocusedPreviewId(undefined);
            activeSmartCardIdRef.current = undefined;
            pendingSmartCardIdRef.current = undefined;
            if (smartActivationFrameRef.current !== undefined) {
              cancelAnimationFrame(smartActivationFrameRef.current);
              smartActivationFrameRef.current = undefined;
            }
            window.dispatchEvent(new CustomEvent<SmartPreviewActivationDetail>(
              SMART_PREVIEW_ACTIVATION_EVENT,
              { detail: { activeIds: [] } },
            ));
          }
        }}
        className={clsx(
          'grid grid-flow-row-dense',
          GRID_GAP_CLASSNAME,
          small
            ? 'grid-cols-3 xs:grid-cols-6'
            : isWideGrid
              ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
              : isGridHighDensity
                ? 'grid-cols-2 xs:grid-cols-4 lg:grid-cols-6'
                : 'grid-cols-2 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4',
          'items-center',
        )}
        type={animate === false ? 'none' : undefined}
        canStart={canStart}
        duration={0.7}
        staggerDelay={0.04}
        distanceOffset={40}
        animateOnFirstLoadOnly={animateOnFirstLoadOnly}
        staggerOnFirstLoadOnly={staggerOnFirstLoadOnly}
        onAnimationComplete={onAnimationComplete}
        items={photos.map((photo, index) => {
          const isSelected = selectedMediaIds?.includes(photo.id) ?? false;
          return <div
            key={photo.id}
            data-preview-id={photo.id}
            data-media-smart-preview-card
            className={clsx(
              'flex relative overflow-hidden',
              'group',
            )}
            style={{
              ...(
                (isWideGrid ? WIDE_GRID_ASPECT_RATIO : GRID_ASPECT_RATIO) !== 0
              ) && {
                aspectRatio: isWideGrid
                  ? WIDE_GRID_ASPECT_RATIO
                  : GRID_ASPECT_RATIO,
                },
              // Keep the card renderable ahead of the viewport. Mobile
              // browsers can defer image painting behind content-visibility,
              // which makes an already-mounted image appear to mount only
              // when it reaches the screen.
            }}
          >
            <MediaMedium
              className={clsx(
                'flex w-full h-full',
                // Prevent photo navigation when selecting
                isSelectingMedia && 'pointer-events-none',
                classNameMedia,
              )}
              {...{
                photo,
                ...categories,
                enableVideoPreview: enableVideoPreviews,
                // Limit route prefetching to the first viewport. Prefetching
                // every detail route in a large grid saturates the connection.
                prefetch: prefetchInitialMediaLinks && index < 6,
                selected: photo.id === selectedMedia?.id,
                // The detail hero owns the browser's high-priority image
                // slot. Related cards still mount immediately, but their
                // requests stay normal priority so they cannot delay the
                // hero poster or the first frame during navigation.
                priority: undefined,
                initiallyLoadPreviewImage:
                  prioritizeInitialMedia && index < 2,
                preloadVideoPreview: !areSmartPreviewsSuspended &&
                  !mountPreviewsOnlyWhenVisible &&
                  shouldPreloadGridPreview(
                    videoPreviewMode,
                    autoplaySmartPreviews,
                    supportsHover,
                  ),
                onVisible: index === photos.length - 1
                  ? onLastMediaVisible
                  : undefined,
                autoPreviewEnabled: !areSmartPreviewsSuspended &&
                  shouldAutoplayGridPreview(
                    videoPreviewMode,
                    autoplaySmartPreviews,
                    smartPreviewIds.has(photo.id),
                  ),
                mountPreviewOnlyWhenVisible: mountPreviewsOnlyWhenVisible,
                previewGroupId,
                sequencePreviewStartup: sequenceVideoPreviewStartup,
                previewStartupPriority: focusedPreviewId === photo.id,
                // Smart mode is coordinated at grid level: interaction
                // activates the complete row plus the rows above and below.
                // Their videos enter the shared five-slot decode queue.
                hoverPreviewEnabled: videoPreviewMode === 'off',
              }}
            />
            {!isSelectingMedia &&
              <PersonalFavoriteButton
                mediaId={photo.id}
                readOnly
                className="pointer-events-none right-2 top-2"
              />}
            {isSelectingMedia &&
              <SelectTileOverlay
                isSelected={isSelected}
                onSelectChange={() => setSelectedMediaIds?.(isSelected
                  ? (selectedMediaIds ?? []).filter(id => id !== photo.id)
                  : (selectedMediaIds ?? []).concat(photo.id),
                )}
              />}
          </div>;
        }).concat(additionalTile ? <>{additionalTile}</> : [])}
        itemKeys={photos.map(photo => photo.id)
          .concat(additionalTile ? ['more'] : [])}
      />
    </div>
  );
};
