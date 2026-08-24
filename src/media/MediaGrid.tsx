'use client';

import { Media } from '.';
import { MediaSetCategory } from '../category';
import MediaMedium from './MediaMedium';
import { clsx } from 'clsx/lite';
import AnimateItems from '@/components/AnimateItems';
import { GRID_ASPECT_RATIO } from '@/app/config';
import { useAppState } from '@/app/AppState';
import SelectTileOverlay from '@/components/SelectTileOverlay';
import { ReactNode, useEffect, useRef, useState } from 'react';
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
import { DETAIL_HERO_READY_EVENT } from './MediaDetailHeroTransition';

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
  deferInitialRender = false,
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
  onLastMediaVisible,
  onAnimationComplete,
  ...categories
}: {
  photos: Media[]
  selectedMedia?: Media
  prioritizeInitialMedia?: boolean
  // Detail navigation should animate the primary media before mounting the
  // related-card tree. Mounting all card images in the same commit can steal
  // the first animation frames and make the hero appear to pause.
  deferInitialRender?: boolean
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
  const [releasedDeferKey, setReleasedDeferKey] = useState<string>();
  const deferKey = selectedMedia?.id ?? photos[0]?.id;
  const shouldRenderRelated = !deferInitialRender || releasedDeferKey === deferKey;
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
    if (!deferInitialRender || !deferKey) { return; }

    // Keep the first route transition frames dedicated to the hero. Release
    // related cards at the actual hero boundary rather than racing a fixed
    // timer against slower mobile decoders and server transitions.
    const release = () => {
      setReleasedDeferKey(deferKey);
    };
    const onHeroReady = (event: Event) => {
      const mediaId = (event as CustomEvent<{ mediaId?: string }>).detail?.mediaId;
      if (mediaId === deferKey) { release(); }
    };
    window.addEventListener(DETAIL_HERO_READY_EVENT, onHeroReady);
    // Reduced-motion mode and a cancelled transition may not emit a Framer
    // completion callback. Keep a bounded fallback so related content never
    // remains deferred indefinitely.
    const timer = window.setTimeout(release, 650);
    return () => {
      window.removeEventListener(DETAIL_HERO_READY_EVENT, onHeroReady);
      window.clearTimeout(timer);
    };
  }, [deferInitialRender, deferKey]);
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
    if (!cardId || activeSmartCardIdRef.current === cardId) { return; }
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
      }), activeId, !supportsHover)];
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
  // Animate the first visible batch only. Replaying a 48-card entrance on
  // every infinite-scroll append is a major source of scroll jank.
  const animateFirstLoadOnly = animateOnFirstLoadOnly ?? true;

  return (
    <div
      {...{ [DATA_KEY_MEDIA_GRID]: selectable, className }}
    >
      <AnimateItems
        // Keep one motion tree while layout preferences hydrate. Remounting
        // on the initial density/width update replayed the hidden scale
        // variant and made loaded cards visibly shrink away before returning.
        onPointerDown={event => activateSmartRows(
          event.target,
          event.currentTarget,
          event.pointerType,
        )}
        onPointerMove={event => activateSmartRows(
          event.pointerType === 'touch'
            ? document.elementFromPoint(event.clientX, event.clientY)
            : event.target,
          event.currentTarget,
          event.pointerType,
        )}
        onPointerLeave={event => {
          if (supportsHover && event.pointerType === 'mouse') {
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
          'grid',
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
        // Keep the original scale entrance, while AnimateItems prevents
        // late-inserted cards from inheriting its hidden variant.
        type={animate === false ? 'none' : undefined}
        canStart={canStart}
        // Match the original v80-v90 grid entrance: cards rise from a
        // slightly smaller scale with a calm, readable stagger. The stable
        // motion tree and explicit child initial state prevent this animation
        // from reversing when the mobile/desktop layout hydrates.
        duration={0.7}
        staggerDelay={0.04}
        distanceOffset={40}
        // Keep the original scale entrance, but do not blank cold cards if a
        // mobile compositor or image request interrupts the first frame.
        fade={false}
        animateOnFirstLoadOnly={animateFirstLoadOnly}
        staggerOnFirstLoadOnly={staggerOnFirstLoadOnly}
        onAnimationComplete={onAnimationComplete}
        items={(shouldRenderRelated ? photos : []).map((photo, index) => {
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
                // Limit route prefetching to the first viewport. Prefetching
                // every detail route in a large grid saturates the connection.
                prefetch: index < 6,
                selected: photo.id === selectedMedia?.id,
                // The detail hero owns the browser's high-priority image
                // slot. Related cards still mount immediately, but their
                // requests stay normal priority so they cannot delay the
                // hero poster or the first frame during navigation.
                priority: undefined,
                initiallyLoadPreviewImage:
                  prioritizeInitialMedia && index < 2,
                preloadVideoPreview: !areSmartPreviewsSuspended &&
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
                // Smart mode is coordinated at grid level: a desktop hover
                // activates the complete row and mobile activates three rows.
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
        itemKeys={(shouldRenderRelated ? photos : []).map(photo => photo.id)
          .concat(additionalTile ? ['more'] : [])}
      />
    </div>
  );
};
