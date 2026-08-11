'use client';

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react';
import Modal from '@/components/Modal';
import FieldsetWithStatus from '@/components/FieldsetWithStatus';
import FieldsetTag from '@/tag/FieldsetTag';
import FieldsetAlbum from '@/album/FieldsetAlbum';
import LoaderButton from '@/components/primitives/LoaderButton';
import { Media } from '@/media';
import { convertMediaToFormData } from '@/media/form';
import { updateMediaQuickMetaAction } from '@/media/actions';
import { convertStringToArray } from '@/utility/string';
import { toastSuccess, toastWarning } from '@/toast';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/app/AppState';
import { createPortal } from 'react-dom';
import type { Tags } from '@/tag';
import type { Albums } from '@/album';
import { getUniqueTagsAction } from '@/tag/actions';
import {
  getAlbumsWithMetaAction,
  getAlbumTitlesForMediaAction,
} from '@/album/actions';

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const arraysEqualCaseInsensitive = (a: string[], b: string[]) => {
  if (a.length !== b.length) { return false; }
  const normalize = (value: string) => value.trim().toLocaleLowerCase();
  const normalizedA = a.map(normalize).sort();
  const normalizedB = b.map(normalize).sort();
  return normalizedA.every((value, index) => value === normalizedB[index]);
};

export default function AdminMediaQuickEditModal({
  photo,
  onClose,
  onUpdated,
}: {
  photo: Media
  onClose: () => void
  onUpdated?: () => void
}) {
  const router = useRouter();
  const { registerAdminUpdate } = useAppState();
  const [isMounted, setIsMounted] = useState(false);
  const [uniqueTags, setUniqueTags] = useState<Tags>();
  const [albums, setAlbums] = useState<Albums>();
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [isLoadingAlbums, setIsLoadingAlbums] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const initialForm = useMemo(() => convertMediaToFormData(photo), [photo]);
  const initialTitle = initialForm.title ?? '';
  const initialTags = initialForm.tags ?? '';
  const initialTagArray = useMemo(
    () => convertStringToArray(initialTags) ?? [],
    [initialTags],
  );

  const [title, setTitle] = useState(initialTitle);
  const [tags, setTags] = useState(initialTags);
  const [albumTitles, setAlbumTitles] = useState('');
  const [initialAlbumArray, setInitialAlbumArray] = useState<string[]>([]);
  const [tagErrorMessage, setTagErrorMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let isSubscribed = true;
    setIsLoadingTags(true);
    setIsLoadingAlbums(true);
    (async () => {
      try {
        const [
          fetchedTags,
          fetchedAlbums,
          fetchedAlbumTitles,
        ] = await Promise.all([
          getUniqueTagsAction(),
          getAlbumsWithMetaAction(),
          getAlbumTitlesForMediaAction(photo.id),
        ]);
        if (!isSubscribed) { return; }
        setUniqueTags(fetchedTags);
        setAlbums(fetchedAlbums);
        const albumTitlesFromServer = fetchedAlbumTitles ?? [];
        setInitialAlbumArray(albumTitlesFromServer);
        setAlbumTitles(albumTitlesFromServer.join(', '));
      } catch (error) {
        console.error(error);
        if (isSubscribed) {
          setUniqueTags([]);
          setAlbums([]);
          setInitialAlbumArray([]);
          setAlbumTitles('');
        }
      } finally {
        if (isSubscribed) {
          setIsLoadingTags(false);
          setIsLoadingAlbums(false);
        }
      }
    })();
    return () => {
      isSubscribed = false;
    };
  }, [photo.id]);

  useEffect(() => {
    if (!uniqueTags) { return; }
    const currentTags = convertStringToArray(tags) ?? [];
    if (currentTags.length === 0) { return; }
    const existingTags = new Set(uniqueTags.map(({ tag }) => tag));
    const merged = [...uniqueTags];
    let hasChanges = false;
    currentTags.forEach(tagValue => {
      if (!existingTags.has(tagValue)) {
        merged.push({
          tag: tagValue,
          count: 1,
          lastModified: new Date(),
        });
        existingTags.add(tagValue);
        hasChanges = true;
      }
    });
    if (hasChanges) {
      setUniqueTags(merged);
    }
  }, [tags, uniqueTags]);

  const currentTagArray = convertStringToArray(tags) ?? [];
  const currentAlbumArray = convertStringToArray(albumTitles, false) ?? [];
  const hasTitleChanged = title.trim() !== initialTitle.trim();
  const hasTagsChanged = !arraysEqual(initialTagArray, currentTagArray);
  const hasAlbumsChanged = !arraysEqualCaseInsensitive(
    currentAlbumArray,
    initialAlbumArray,
  );
  const hasChanges = hasTitleChanged || hasTagsChanged || hasAlbumsChanged;
  const isMetadataLoading = isLoadingTags || isLoadingAlbums;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (tagErrorMessage) {
      toastWarning(tagErrorMessage);
      return;
    }
    if (!hasChanges) {
      toastWarning('No updates to save');
      return;
    }

    startTransition(async () => {
      try {
        const result = await updateMediaQuickMetaAction({
          photoId: photo.id,
          title,
          tags,
          albumTitles,
        });
        if (!result?.success) {
          toastWarning(result?.error ?? 'Unable to update photo');
          return;
        }
        if (result.updated) {
          toastSuccess('Media updated');
          registerAdminUpdate?.();
          onUpdated?.();
          router.refresh();
        } else {
          toastSuccess('Media already up to date', 2500);
        }
        onClose();
      } catch (error) {
        console.error(error);
        toastWarning('Unable to update photo');
      }
    });
  };

  if (!isMounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <Modal onClose={onClose}>
      <form
        className="space-y-5 p-4 sm:p-5"
        onSubmit={handleSubmit}
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            Quick Edit
          </h2>
          <p className="text-sm text-dim">
            Update the title, tags, or albums without leaving the photo.
          </p>
        </div>
        <div className="space-y-4">
          <FieldsetWithStatus
            label="Title"
            value={title}
            onChange={setTitle}
            isModified={hasTitleChanged}
            spellCheck
            capitalize
            readOnly={isPending}
          />
          <FieldsetTag
            tags={tags}
            tagOptions={uniqueTags}
            onChange={setTags}
            onError={setTagErrorMessage}
            openOnLoad
            note="Separate with commas"
            loading={isLoadingTags}
            isModified={hasTagsChanged}
            readOnly={isPending}
          />
          <FieldsetAlbum
            albumOptions={albums ?? []}
            value={albumTitles}
            onChange={setAlbumTitles}
            loading={isLoadingAlbums}
            isModified={hasAlbumsChanged}
            readOnly={isPending || isLoadingAlbums}
            note="Separate with commas"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="button"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </button>
          <LoaderButton
            type="submit"
            hideText="never"
            primary
            isLoading={isPending}
            disabled={
              isPending ||
              isMetadataLoading ||
              !hasChanges ||
              Boolean(tagErrorMessage)
            }
          >
            Save
          </LoaderButton>
        </div>
      </form>
    </Modal>,
    document.body,
  );
}
