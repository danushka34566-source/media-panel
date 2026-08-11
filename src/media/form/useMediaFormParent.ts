import { useCallback, useState } from 'react';
import { MediaFormData, formHasExistingAiTextContent } from '.';
import useAiImageQueries from '../ai/useAiImageQueries';

export default function useMediaFormParent({
  photoForm,
  imageThumbnailBase64,
}: {
  photoForm?: Partial<MediaFormData>
  imageThumbnailBase64?: string,
}) {
  const [pending, setIsPending] = useState(false);
  const [updatedTitle, setUpdatedTitle] = useState('');
  const [shouldConfirmAiTextGeneration, _setShouldConfirmAiTextGeneration] =
    useState(formHasExistingAiTextContent(photoForm));

  const setShouldConfirmAiTextGeneration = useCallback(
    (updatedFormData: Partial<MediaFormData>) => {
      _setShouldConfirmAiTextGeneration(
        formHasExistingAiTextContent(updatedFormData),
      );
    }, []);

  const aiContent = useAiImageQueries(imageThumbnailBase64);

  return {
    pending,
    setIsPending,
    updatedTitle,
    setUpdatedTitle,
    shouldConfirmAiTextGeneration,
    setShouldConfirmAiTextGeneration,
    aiContent,
  };
}
