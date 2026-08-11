'use client';

import Modal from '@/components/Modal';
import { useAppState } from '@/app/AppState';
import MediaRecipeOverlay from './MediaRecipeOverlay';

export default function ShareModals() {
  const {
    recipeModalProps,
    setRecipeModalProps,
  } = useAppState();

  if (recipeModalProps) {
    return <Modal
      onClose={() => setRecipeModalProps?.(undefined)}
      container={false}
    >
      <MediaRecipeOverlay {...{
        ...recipeModalProps,
        onClose: () => setRecipeModalProps?.(undefined),
        isOnMedia: false,
      }}/>
    </Modal>;
  }
}
