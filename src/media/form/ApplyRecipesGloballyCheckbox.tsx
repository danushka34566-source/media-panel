import FieldsetWithStatus from '@/components/FieldsetWithStatus';
import { ComponentProps, useEffect, useState } from 'react';
import { getMediaNeedingRecipeTitleCountAction } from '../actions';

export default function ApplyRecipeTitleGloballyCheckbox({
  photoId,
  recipeTitle,
  hasRecipeTitleChanged,
  recipeData,
  film,
  onMatchResults,
  ...props
}: ComponentProps<typeof FieldsetWithStatus> & {
  photoId?: string
  recipeTitle?: string
  hasRecipeTitleChanged?: boolean
  recipeData?: string
  film?: string
  onMatchResults: (didFindMatchingMedia: boolean) => void
}) {
  const [matchingMediaCount, setMatchingMediaCount] = useState<number>();

  const loading = matchingMediaCount === undefined;

  useEffect(() => {
    if (recipeTitle && hasRecipeTitleChanged && recipeData && film) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMatchingMediaCount(undefined);
      getMediaNeedingRecipeTitleCountAction(recipeData, film, photoId)
        .then(setMatchingMediaCount);
    } else {
      setMatchingMediaCount(0);
    }
  }, [recipeTitle, hasRecipeTitleChanged, recipeData, film, photoId]);

  useEffect(() => {
    onMatchResults((matchingMediaCount ?? 0) > 0);
  }, [matchingMediaCount, onMatchResults]);

  const shouldShowFieldSet = loading || matchingMediaCount > 0;

  return (
    shouldShowFieldSet
      ? <FieldsetWithStatus {...{
        ...props,
        label: loading
          ? 'Scanning photos for matching recipes ...'
          : `Apply title to ${matchingMediaCount} matching photos`,
        type: 'checkbox',
        className: '-mt-4 translate-x-[4px]',
        loading,
      }} />
      : null
  );
}
