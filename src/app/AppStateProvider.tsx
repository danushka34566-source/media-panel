'use client';

import {
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
} from 'react';
import { AppStateContext } from '../app/AppState';
import { AnimationConfig } from '@/components/AnimateItems';
import {
  getAuthAction,
  getWideGridPreferenceAction,
  setWideGridPreferenceAction,
  getVideoPreviewPreferenceAction,
  setVideoPreviewPreferenceAction,
} from '@/auth/actions';
import type { VideoPreviewMode } from '@/auth/users';
import { hasCapability, isUserRole } from '@/auth/permissions';
import type { Session } from 'next-auth';
import useSWR, { useSWRConfig } from 'swr';
import {
  HIGH_DENSITY_GRID,
  IS_DEVELOPMENT,
  MATTE_MEDIA,
  SHOW_ZOOM_CONTROLS,
} from '@/app/config';
import { ShareModalProps } from '@/share';
import { storeTimezoneCookie } from '@/utility/timezone';
import { AdminData, getAdminDataAction } from '@/admin/actions';
import {
  storeAuthEmailCookie,
  clearAuthEmailCookie,
  getAuthEmailCookie,
} from '@/auth';
import { useRouter, usePathname } from 'next/navigation';
import { isPathProtected, isPathSignIn, PATH_ROOT } from '@/app/path';
import {
  INITIAL_UPLOAD_STATE,
  shouldPruneWorkerQueuedClientUpload,
  UploadState,
} from '@/admin/upload';
import { RecipeProps } from '@/recipe';
import { nanoid } from 'nanoid';
import { toastSuccess } from '@/toast';
import { getCountsForCategoriesCachedAction } from '@/category/actions';
import {
  canKeyBePurged,
  canKeyBePurgedAndRevalidated,
  SWR_KEYS,
  SWRKey,
} from '@/swr';
import useSupportsHover from '@/utility/useSupportsHover';
import ConfirmModal from '@/components/ConfirmModal';
import { ConfirmDialogOptions } from './AppState';

const WIDE_GRID_STORAGE_KEY = 'app:wide-grid';
const VIDEO_PREVIEW_MODE_STORAGE_KEY = 'app:video-preview-mode';
const getInitialUploadState = (): UploadState => INITIAL_UPLOAD_STATE;

const getInitialWideGridState = () => {
  if (typeof window === 'undefined') { return false; }
  try {
    return window.localStorage.getItem(WIDE_GRID_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};
const getInitialVideoPreviewMode = (): VideoPreviewMode => {
  if (typeof window === 'undefined') { return 'smart'; }
  try {
    const value = window.localStorage.getItem(VIDEO_PREVIEW_MODE_STORAGE_KEY);
    return value === 'off' || value === 'all' ? value : 'smart';
  } catch { return 'smart'; }
};

export default function AppStateProvider({
  children,
  areAdminDebugToolsEnabled,
  initialAuth,
}: {
  children: ReactNode
  areAdminDebugToolsEnabled?: boolean
  initialAuth?: Session | null
}) {
  const router = useRouter();

  const pathname = usePathname();

  // CORE
  const [hasLoadedWithAnimations, setHasLoadedWithAnimations] =
    useState(false);
  const [nextMediaAnimation, _setNextMediaAnimation] =
    useState<AnimationConfig>();
  const [nextMediaAnimationId, setNextMediaAnimationId] =
    useState<string>();
  const setNextMediaAnimation = useCallback((animation?: AnimationConfig) => {
    _setNextMediaAnimation(animation);
    setNextMediaAnimationId(undefined);
  }, []);
  const getNextMediaAnimationId = useCallback(() => {
    const id = nanoid();
    setNextMediaAnimationId(id);
    return id;
  }, []);
  const clearNextMediaAnimation = useCallback((id?: string) => {
    if (id === nextMediaAnimationId) {
      setNextMediaAnimation(undefined);
      setNextMediaAnimationId(undefined);
    }
  }, [nextMediaAnimationId, setNextMediaAnimation]);
  const [shouldRespondToKeyboardCommands, setShouldRespondToKeyboardCommands] =
    useState(true);
  // ENVIRONMENT
  const [timezone, setTimezone] = useState<string>();
  const supportsHover = useSupportsHover();
  const [videoPreviewMode, setVideoPreviewMode] =
    useState<VideoPreviewMode>(getInitialVideoPreviewMode);
  const videoPreviewModeRef = useRef(videoPreviewMode);
  const videoPreviewOwnerRef = useRef<string | undefined>(undefined);
  const videoPreviewRequestRef = useRef(0);
  // MODAL
  const [isCommandKOpen, setIsCommandKOpen] =
    useState(false);
  const [shareModalProps, setShareModalProps] =
    useState<ShareModalProps>();
  const [recipeModalProps, setRecipeModalProps] =
    useState<RecipeProps>();
  const [confirmDialogState, setConfirmDialogState] = useState<{
    options: ConfirmDialogOptions
    resolve: (result: boolean) => void
  }>();
  // AUTH
  const [userEmail, setUserEmail] =
    useState<string | undefined>(initialAuth?.user?.status === 'active'
      ? initialAuth.user.email ?? undefined
      : undefined);
  const [userEmailEager, setUserEmailEager] =
    useState<string | undefined>(initialAuth?.user?.status === 'active'
      ? initialAuth.user.email ?? undefined
      : undefined);
  const isUserSignedIn = Boolean(userEmail);
  const isUserSignedInEager = Boolean(userEmailEager);
  // ADMIN
  const [adminUpdateTimes, setAdminUpdateTimes] =
    useState<Date[]>([]);
  const [shouldLoadAdminData, setShouldLoadAdminData] = useState(false);
  // UPLOAD
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, _setUploadState] = useState(getInitialUploadState);
  // DEBUG
  const [isGridHighDensity, setIsGridHighDensity] =
    useState(HIGH_DENSITY_GRID);
  const [isWideGrid, setIsWideGrid] = useState(getInitialWideGridState);
  const wideGridRef = useRef(isWideGrid);
  const gridPreferenceOwnerRef = useRef<string | undefined>(undefined);
  const gridPreferenceRequestRef = useRef(0);
  const [areZoomControlsShown, setAreZoomControlsShown] =
    useState(SHOW_ZOOM_CONTROLS);
  const [areMediaMatted, setAreMediaMatted] =
    useState(MATTE_MEDIA);
  const [shouldDebugImageFallbacks, setShouldDebugImageFallbacks] =
    useState(false);
  const [shouldShowBaselineGrid, setShouldShowBaselineGrid] =
    useState(false);
  const [shouldDebugInsights, setShouldDebugInsights] =
    useState(IS_DEVELOPMENT);
  const [shouldDebugRecipeOverlays, setShouldDebugRecipeOverlays] =
    useState(false);

  useEffect(() => {
    storeTimezoneCookie();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUserEmailEager(getAuthEmailCookie());
    // Capture backup timezone on client
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const timeout = setTimeout(() => {
      setHasLoadedWithAnimations(true);
    }, 1000);
    return () => {
      clearTimeout(timeout);
    };
  }, []);

  const { mutate } = useSWRConfig();
  const invalidateSwr = useCallback((key?: SWRKey, revalidate?: boolean) => {
    if (key) {
      // Mutate specific key
      mutate((k: string) => k?.startsWith(key), undefined, { revalidate });
    } else {
      // Mutate all keys that can be purged
      mutate(canKeyBePurged, undefined, { revalidate: false });
      mutate(canKeyBePurgedAndRevalidated, undefined, { revalidate: true });
    }
  }, [mutate]);

  const { data: categoriesWithCounts } = useSWR(
    hasLoadedWithAnimations ? SWR_KEYS.GET_COUNTS_FOR_CATEGORIES : null,
    getCountsForCategoriesCachedAction,
  );

  const {
    data: auth,
    error: authError,
    isLoading: isCheckingAuth,
  } = useSWR(SWR_KEYS.GET_AUTH, getAuthAction, {
    fallbackData: initialAuth,
    revalidateOnMount: initialAuth === undefined,
  });
  const previousPathnameRef = useRef(pathname);
  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;
    if (!isPathSignIn(previousPathname) || isPathSignIn(pathname)) {
      return;
    }

    // Auth.js sets the session cookie during the sign-in server action, but
    // App Router can preserve this root layout across the redirect. Revalidate
    // the client auth state and refresh the layout once so admin controls do
    // not remain hidden until the user manually reloads the page.
    void mutate(SWR_KEYS.GET_AUTH).then(currentAuth => {
      if (currentAuth?.user?.status === 'active') {
        router.refresh();
      }
    });
  }, [mutate, pathname, router]);
  const userRole = auth?.user?.status === 'active' &&
      isUserRole(auth.user.role)
    ? auth.user.role
    : undefined;
  useEffect(() => {
    if (auth === null || authError) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserEmail(undefined);
      setUserEmailEager(undefined);
      clearAuthEmailCookie();
    } else {
      setUserEmail(auth?.user?.email ?? undefined);
    }
  }, [auth, authError]);

  const {
    data: adminData,
    mutate: refreshAdminData,
    isLoading: isLoadingAdminData,
  } = useSWR(
    isUserSignedIn && shouldLoadAdminData ? SWR_KEYS.GET_ADMIN_DATA : null,
    getAdminDataAction,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60_000,
      keepPreviousData: true,
    },
  );
  const updateAdminData = useCallback(
    (updatedData: Partial<AdminData>) => {
      if (adminData) {
        refreshAdminData({
          ...adminData,
          ...updatedData,
        });
      }
    }, [adminData, refreshAdminData]);

  useEffect(() => {
    if (userEmail) {
      storeAuthEmailCookie(userEmail);
    }
  }, [userEmail]);

  const registerAdminUpdate = useCallback(() => {
    setShouldLoadAdminData(true);
    setAdminUpdateTimes(updates => [...updates, new Date()]);
    void refreshAdminData();
  }, [refreshAdminData]);

  const clearAuthStateAndRedirectIfNecessary = useCallback(() => {
    setUserEmail(undefined);
    setUserEmailEager(undefined);
    clearAuthEmailCookie();
    void mutate(SWR_KEYS.GET_AUTH, null, { revalidate: false });
    void mutate(SWR_KEYS.GET_ADMIN_DATA, undefined, { revalidate: false });
    if (isPathProtected(pathname)) {
      router.replace(PATH_ROOT);
    } else {
      toastSuccess('Signed out');
      router.refresh();
    }
  }, [mutate, router, pathname]);

  const closeConfirmDialog = useCallback((result: boolean) => {
    setConfirmDialogState(current => {
      current?.resolve(result);
      return undefined;
    });
  }, []);

  const confirmDialog = useCallback((
    options: string | ConfirmDialogOptions,
  ) => new Promise<boolean>(resolve => {
    setConfirmDialogState(current => {
      current?.resolve(false);
      return {
        options: typeof options === 'string'
          ? { description: options, tone: 'danger' }
          : options,
        resolve,
      };
    });
  }), []);

  // Returns false when upload is cancelled
  const startUpload = useCallback(() => new Promise<boolean>(resolve => {
    if (uploadInputRef.current) {
      uploadInputRef.current.value = '';
      uploadInputRef.current.oninput = () => resolve(true);
      uploadInputRef.current.oncancel = () => resolve(false);
      uploadInputRef.current.click();
    } else {
      resolve(false);
    }
  })
  , []);
  const setUploadState = useCallback((
    uploadState:
      Partial<UploadState> |
      ((uploadState: UploadState) => Partial<UploadState>),
  ) => {
    _setUploadState(prev => ({
      ...prev,
      ...(typeof uploadState === 'function'
        ? uploadState(prev)
        : uploadState),
    }));
  }, []);
  const resetUploadState = useCallback(() => {
    _setUploadState(INITIAL_UPLOAD_STATE);
  }, []);

  useEffect(() => {
    wideGridRef.current = isWideGrid;
    try {
      if (isWideGrid) {
        window.localStorage.setItem(WIDE_GRID_STORAGE_KEY, '1');
      } else {
        window.localStorage.removeItem(WIDE_GRID_STORAGE_KEY);
      }
    } catch {}

    if (gridPreferenceOwnerRef.current) {
      void setWideGridPreferenceAction(isWideGrid).catch(() => undefined);
    }
  }, [isWideGrid]);

  useEffect(() => {
    videoPreviewModeRef.current = videoPreviewMode;
    try { window.localStorage.setItem(VIDEO_PREVIEW_MODE_STORAGE_KEY, videoPreviewMode); } catch {}
    if (videoPreviewOwnerRef.current) {
      void setVideoPreviewPreferenceAction(videoPreviewMode).catch(() => undefined);
    }
  }, [videoPreviewMode]);

  useEffect(() => {
    const userId = auth?.user?.id;
    const requestId = ++videoPreviewRequestRef.current;
    videoPreviewOwnerRef.current = undefined;
    if (!userId) { return; }
    const localAtRequest = videoPreviewModeRef.current;
    void getVideoPreviewPreferenceAction().then(preference => {
      if (videoPreviewRequestRef.current !== requestId) { return; }
      videoPreviewOwnerRef.current = userId;
      if (videoPreviewModeRef.current !== localAtRequest || preference === null) {
        return setVideoPreviewPreferenceAction(videoPreviewModeRef.current);
      }
      setVideoPreviewMode(preference);
    }).catch(() => undefined);
  }, [auth?.user?.id]);

  useEffect(() => {
    const userId = auth?.user?.id;
    const requestId = ++gridPreferenceRequestRef.current;
    gridPreferenceOwnerRef.current = undefined;

    if (!userId) { return; }

    const preferenceAtRequest = wideGridRef.current;
    void getWideGridPreferenceAction()
      .then(preference => {
        if (gridPreferenceRequestRef.current !== requestId) { return; }
        gridPreferenceOwnerRef.current = userId;
        if (wideGridRef.current !== preferenceAtRequest) {
          return setWideGridPreferenceAction(wideGridRef.current);
        }
        if (preference === null) {
          return setWideGridPreferenceAction(wideGridRef.current);
        }
        setIsWideGrid(preference);
      })
      .catch(() => undefined);
  }, [auth?.user?.id]);

  useEffect(() => {
    const pruneFinishedWorkerQueuedUploads = () => {
      _setUploadState(current => {
        const prunedUploads = current.clientUploads.filter(upload =>
          !shouldPruneWorkerQueuedClientUpload(upload),
        );
        if (prunedUploads.length === current.clientUploads.length) {
          return current;
        }

        const prunedUrls = new Set(
          current.clientUploads
            .filter(upload => shouldPruneWorkerQueuedClientUpload(upload))
            .map(upload => upload.uploadedUrl)
            .filter((url): url is string => Boolean(url)),
        );
        const nextMetadata = { ...current.uploadMetadataByUrl };
        prunedUrls.forEach(url => {
          delete nextMetadata[url];
        });

        return {
          ...current,
          clientUploads: prunedUploads,
          uploadMetadataByUrl: nextMetadata,
          isUploading: prunedUploads.some(upload =>
            upload.status === 'queued' ||
            upload.status === 'uploading' ||
            upload.status === 'processing'),
        };
      });
    };

    pruneFinishedWorkerQueuedUploads();
    const interval = window.setInterval(
      pruneFinishedWorkerQueuedUploads,
      60_000,
    );
    return () => window.clearInterval(interval);
  }, []);

  return (
    <AppStateContext.Provider
      value={{
        // CORE
        hasLoadedWithAnimations,
        invalidateSwr,
        nextMediaAnimation,
        setNextMediaAnimation,
        getNextMediaAnimationId,
        clearNextMediaAnimation,
        shouldRespondToKeyboardCommands,
        setShouldRespondToKeyboardCommands,
        categoriesWithCounts,
        // ENVIRONMENT
        timezone,
        supportsHover,
        videoPreviewMode,
        setVideoPreviewMode,
        // MODAL
        isCommandKOpen,
        setIsCommandKOpen,
        shareModalProps,
        setShareModalProps,
        recipeModalProps,
        setRecipeModalProps,
        confirmDialog,
        // AUTH
        isCheckingAuth,
        userEmail,
        userEmailEager,
        setUserEmail,
        isUserSignedIn,
        isUserSignedInEager,
        userRole,
        canEdit: hasCapability(userRole, 'edit'),
        canUpload: hasCapability(userRole, 'upload'),
        canDelete: hasCapability(userRole, 'delete'),
        canManageUsers: hasCapability(userRole, 'manage-users'),
        canManageConfiguration: hasCapability(
          userRole,
          'manage-configuration',
        ),
        clearAuthStateAndRedirectIfNecessary,
        // ADMIN
        adminUpdateTimes,
        registerAdminUpdate,
        ...adminData,
        hasAdminData: Boolean(adminData),
        isLoadingAdminData,
        setShouldLoadAdminData,
        refreshAdminData,
        updateAdminData,
        // UPLOAD
        uploadInputRef,
        startUpload,
        uploadState,
        setUploadState,
        resetUploadState,
        // DEBUG
        areAdminDebugToolsEnabled,
        isGridHighDensity,
        setIsGridHighDensity,
        isWideGrid,
        setIsWideGrid,
        areZoomControlsShown,
        setAreZoomControlsShown,
        areMediaMatted,
        setAreMediaMatted,
        shouldDebugImageFallbacks,
        setShouldDebugImageFallbacks,
        shouldShowBaselineGrid,
        setShouldShowBaselineGrid,
        shouldDebugInsights,
        setShouldDebugInsights,
        shouldDebugRecipeOverlays,
        setShouldDebugRecipeOverlays,
      }}
    >
      {children}
      {confirmDialogState &&
        <ConfirmModal
          options={confirmDialogState.options}
          onCancel={() => closeConfirmDialog(false)}
          onConfirm={() => closeConfirmDialog(true)}
        />}
    </AppStateContext.Provider>
  );
};
