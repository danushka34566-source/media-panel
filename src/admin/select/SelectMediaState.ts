import { createContext, Dispatch, SetStateAction, use } from 'react';

export type SelectMediaState = {
  canCurrentPageSelectMedia?: boolean
  isSelectingMedia?: boolean;
  startSelectingMedia?: () => void
  stopSelectingMedia?: () => void
  selectedMediaIds?: string[]
  setSelectedMediaIds?: (photoIds: string[]) => void
  selectableMediaIds?: string[]
  selectAllMedia?: () => void
  clearSelectedMedia?: () => void
  isPerformingSelectEdit?: boolean
  setIsPerformingSelectEdit?: Dispatch<SetStateAction<boolean>>
};

export const SelectMediaContext = createContext<SelectMediaState>({});

export const useSelectMediaState = () => use(SelectMediaContext);
