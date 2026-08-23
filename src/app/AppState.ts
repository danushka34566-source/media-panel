'use client';

import {
  Dispatch,
  SetStateAction,
  createContext,
  use,
  RefObject,
} from 'react';
import { AnimationConfig } from '@/components/AnimateItems';
import { ShareModalProps } from '@/share';
import { InsightsIndicatorStatus } from '@/admin/insights';
import { INITIAL_UPLOAD_STATE, UploadState } from '@/admin/upload';
import { AdminData } from '@/admin/actions';
import { RecipeProps } from '@/recipe';
import { getCountsForCategoriesCachedAction } from '@/category/actions';
import { SWRKey } from '@/swr';
import type { VideoPreviewMode } from '@/auth/users';
import type { UserRole } from '@/auth/users';

export type ConfirmDialogOptions = {
  title?: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
}

export type AppStateContextType = {
  // CORE
  hasLoadedWithAnimations?: boolean
  invalidateSwr?: (key?: SWRKey, revalidate?: boolean) => void
  nextMediaAnimation?: AnimationConfig
  setNextMediaAnimation?: (animationConfig?: AnimationConfig) => void
  getNextMediaAnimationId?: () => string
  clearNextMediaAnimation?: (id?: string) => void
  shouldRespondToKeyboardCommands?: boolean
  setShouldRespondToKeyboardCommands?: Dispatch<SetStateAction<boolean>>
  categoriesWithCounts?: Awaited<ReturnType<
    typeof getCountsForCategoriesCachedAction
  >>
  // ENVIRONMENT
  timezone?: string
  supportsHover?: boolean
  videoPreviewMode?: VideoPreviewMode
  setVideoPreviewMode?: Dispatch<SetStateAction<VideoPreviewMode>>
  // MODAL
  isCommandKOpen?: boolean
  setIsCommandKOpen?: Dispatch<SetStateAction<boolean>>
  shareModalProps?: ShareModalProps
  setShareModalProps?: Dispatch<SetStateAction<ShareModalProps | undefined>>
  recipeModalProps?: RecipeProps
  setRecipeModalProps?: Dispatch<SetStateAction<RecipeProps | undefined>>
  confirmDialog?: (options: string | ConfirmDialogOptions) => Promise<boolean>
  // AUTH
  userEmail?: string
  userEmailEager?: string
  userName?: string
  userProfileImageUrl?: string
  setUserEmail?: Dispatch<SetStateAction<string | undefined>>
  isUserSignedIn?: boolean
  isUserSignedInEager?: boolean
  userRole?: UserRole
  canEdit?: boolean
  canUpload?: boolean
  canDelete?: boolean
  canManageUsers?: boolean
  canManageConfiguration?: boolean
  clearAuthStateAndRedirectIfNecessary?: () => void
  // ADMIN
  isCheckingAuth?: boolean
  adminUpdateTimes?: Date[]
  registerAdminUpdate?: () => void
  hasAdminData?: boolean
  isLoadingAdminData?: boolean
  setShouldLoadAdminData?: Dispatch<SetStateAction<boolean>>
  refreshAdminData?: () => void
  updateAdminData?: (updatedData: Partial<AdminData>) => void
  insightsIndicatorStatus?: InsightsIndicatorStatus
  // UPLOAD
  startUpload?: () => Promise<boolean>
  uploadInputRef?: RefObject<HTMLInputElement | null>
  uploadState: UploadState
  setUploadState?: (
    uploadState:
      Partial<UploadState> |
      ((uploadState: UploadState) => Partial<UploadState>)
  ) => void
  resetUploadState?: () => void
  // DEBUG
  areAdminDebugToolsEnabled?: boolean
  isGridHighDensity?: boolean
  setIsGridHighDensity?: Dispatch<SetStateAction<boolean>>
  isWideGrid?: boolean
  setIsWideGrid?: Dispatch<SetStateAction<boolean>>
  areZoomControlsShown?: boolean
  setAreZoomControlsShown?: Dispatch<SetStateAction<boolean>>
  areMediaMatted?: boolean
  setAreMediaMatted?: Dispatch<SetStateAction<boolean>>
  shouldDebugImageFallbacks?: boolean
  setShouldDebugImageFallbacks?: Dispatch<SetStateAction<boolean>>
  shouldShowBaselineGrid?: boolean
  setShouldShowBaselineGrid?: Dispatch<SetStateAction<boolean>>
  shouldDebugInsights?: boolean
  setShouldDebugInsights?: Dispatch<SetStateAction<boolean>>
  shouldDebugRecipeOverlays?: boolean
  setShouldDebugRecipeOverlays?: Dispatch<SetStateAction<boolean>>
} & Partial<AdminData>

export const AppStateContext = createContext<AppStateContextType>({
  uploadState: INITIAL_UPLOAD_STATE,
});

export const useAppState = () => use(AppStateContext);
