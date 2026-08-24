/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import {
  ComponentProps,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FIELDS_WITH_JSON,
  FORM_METADATA_ENTRIES_BY_SECTION,
  FormFields,
  FormMeta,
  MediaFormData,
  convertFormKeysToLabels,
  getChangedFormFields,
  getFormErrors,
  isFormValid,
} from '.';
import FieldsetWithStatus from '@/components/FieldsetWithStatus';
import {
  addSubtitlesAction,
  createMediaAction,
  deleteStorageAssetAction,
  deleteSubtitleAction,
  getSubtitleLanguagesAction,
  getUniqueVideoLibraryOptionsAction,
  updateSubtitleTrackAction,
  updateMediaAction,
  updateMediaInlineAction,
} from '../actions';
import SubmitButtonWithStatus from '@/components/SubmitButtonWithStatus';
import useVideoPreviewLifecycle from '@/media/video-preview-lifecycle';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx/lite';
import { PATH_ADMIN_PHOTOS, PATH_ADMIN_UPLOADS } from '@/app/path';
import { toastSuccess, toastWarning } from '@/toast';
import { getDimensionsFromSize } from '@/utility/size';
import ImageWithFallback from '@/components/image/ImageWithFallback';
import { Tags, convertTagsForForm } from '@/tag';
import { AiContent } from '../ai/useAiImageQueries';
import AiButton from '../ai/AiButton';
import Spinner from '@/components/Spinner';
import usePreventNavigation from '@/utility/usePreventNavigation';
import { useAppState } from '@/app/AppState';
import UpdateBlurDataButton from '../UpdateBlurDataButton';
import { BLUR_ENABLED, IS_PREVIEW } from '@/app/config';
import ErrorNote from '@/components/ErrorNote';
import { convertRecipesForForm, Recipes } from '@/recipe';
import deepEqual from 'fast-deep-equal/es6/react';
import ApplyRecipeTitleGloballyCheckbox from './ApplyRecipesGloballyCheckbox';
import { convertFilmsForForm, Films } from '@/film';
import { isMakeFujifilm } from '@/platforms/fujifilm';
import MediaFilmIcon from '@/film/MediaFilmIcon';
import FieldsetFavs from './FieldsetFavs';
import { useAppText } from '@/i18n/state/client';
import IconAddUpload from '@/components/icons/IconAddUpload';
import { didVisibilityChange } from '../visibility';
import FieldsetVisibility from '../visibility/FieldsetVisibility';
import MediaColors from '../color/MediaColors';
import { generateColorDataFromString } from '../color/client';
import { capitalize, parameterize } from '@/utility/string';
import AnchorSections from '@/components/AnchorSections';
import useIsVisible from '@/utility/useIsVisible';
import { getOptimizedMediaUrlForManipulation } from '../storage';
import {
  getFileNamePartsFromStorageUrl,
  StorageListResponse,
} from '@/platforms/storage';
import SmallDisclosure from '@/components/SmallDisclosure';
import { TbFile, TbFileText, TbJson, TbPhoto } from 'react-icons/tb';
import { Albums } from '@/album';
import FieldsetAlbum from '@/album/FieldsetAlbum';
const THUMBNAIL_SIZE = 300;

const VIDEO_SECTION_LABELS: Record<string, string> = {
  text: 'Details',
  media: 'Playback',
  subtitles: 'Subtitles',
  exif: 'Dates',
  storage: 'Files',
  misc: 'Advanced',
};

const PHOTO_SECTION_LABELS: Record<string, string> = {
  text: 'Details',
  media: 'Image',
  exif: 'Capture',
  storage: 'Files',
  misc: 'Advanced',
};

const VIDEO_SECTION_DESCRIPTIONS: Record<string, string> = {
  text: 'Core library details and organization',
  media: 'Playback and generated preview assets',
  subtitles: 'Caption tracks and language management',
  exif: 'Original timestamps and date controls',
  storage: 'Stored asset references and source details',
  misc: 'Low-frequency controls and internal tuning',
};

const PHOTO_SECTION_DESCRIPTIONS: Record<string, string> = {
  text: 'Core media details and organization',
  media: 'Image dimensions, aspect ratio, and display metadata',
  exif: 'Camera, lens, exposure, and timestamp metadata',
  storage: 'Stored asset references and source details',
  misc: 'Low-frequency controls and internal tuning',
};

const VIDEO_SECTION_ORDER = [
  'text',
  'media',
  'subtitles',
  'storage',
  'misc',
  'exif',
];
const PHOTO_SECTION_ORDER = ['text', 'exif', 'media', 'storage', 'misc'];
const SECTION_SCROLL_TOP_OFFSET = 112;

const shouldPreventImplicitFormSubmit = (
  event: KeyboardEvent<HTMLFormElement>,
) => {
  if (event.key !== 'Enter') { return false; }
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
    return false;
  }

  const target = event.target as HTMLElement | null;
  if (!target) { return false; }

  const tagName = target.tagName.toLowerCase();
  if (tagName === 'textarea' || tagName === 'button') {
    return false;
  }

  if (target.getAttribute('role') === 'option') {
    return false;
  }

  if (target instanceof HTMLInputElement) {
    const inputType = target.type.toLowerCase();
    if (
      inputType === 'submit' ||
      inputType === 'button' ||
      inputType === 'checkbox' ||
      inputType === 'file'
    ) {
      return false;
    }
  }

  return true;
};

const formatAspectRatioPair = (width: number, height: number) => {
  const gcd = (a: number, b: number): number =>
    b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
};

const formatAspectRatioForDisplay = (value?: string) => {
  const parsed = value ? parseFloat(value) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return value ?? '';
  }

  let bestWidth = 0;
  let bestHeight = 0;
  let bestError = Number.POSITIVE_INFINITY;

  for (let height = 1; height <= 24; height += 1) {
    const width = Math.max(1, Math.round(parsed * height));
    const error = Math.abs((width / height) - parsed);
    if (error < bestError) {
      bestWidth = width;
      bestHeight = height;
      bestError = error;
    }
  }

  return bestError <= 0.02
    ? formatAspectRatioPair(bestWidth, bestHeight)
    : parsed.toFixed(2);
};

const getSectionLabel = (section: string, isVideo: boolean) => {
  const labels = isVideo ? VIDEO_SECTION_LABELS : PHOTO_SECTION_LABELS;
  return labels[section] ?? capitalize(section);
};

const getSectionDescription = (section: string, isVideo: boolean) => {
  const descriptions = isVideo
    ? VIDEO_SECTION_DESCRIPTIONS
    : PHOTO_SECTION_DESCRIPTIONS;
  return descriptions[section] ?? 'Edit these fields as needed.';
};

const getSectionDomId = (section: string, isVideo: boolean) =>
  `edit-section-${isVideo ? 'video' : 'photo'}-${
    parameterize(getSectionLabel(section, isVideo))
  }`;

export default function MediaForm({
  type = 'create',
  initialMediaForm,
  photoStorageUrls,
  updatedExifData,
  updatedBlurData,
  photoAlbumTitles = [],
  albums,
  uniqueTags,
  uniqueCategories = [],
  uniqueStudios = [],
  uniquePerformers = [],
  uniqueContentTypes = [],
  uniqueRecipes,
  uniqueFilms,
  aiContent,
  shouldStripGpsData,
  onTitleChange,
  onFormDataChange,
  onFormStatusChange,
  onStorageFilesChanged,
  inlineEdit = false,
  compactEdit = false,
  visibleSectionNames,
  excludeFields = [],
  onCancel,
  onUpdated,
}: {
  type?: 'create' | 'edit'
  initialMediaForm: Partial<MediaFormData>
  photoStorageUrls?: StorageListResponse
  updatedExifData?: Partial<MediaFormData>
  updatedBlurData?: string
  photoAlbumTitles?: string[]
  albums: Albums
  uniqueTags: Tags
  uniqueCategories?: { category: string, count: number, lastModified: Date }[]
  uniqueStudios?: string[]
  uniquePerformers?: string[]
  uniqueContentTypes?: string[]
  uniqueRecipes?: Recipes
  uniqueFilms?: Films
  aiContent?: AiContent
  shouldStripGpsData?: boolean
  onTitleChange?: (updatedTitle: string) => void
  onFormDataChange?: (formData: Partial<MediaFormData>) => void,
  onFormStatusChange?: (pending: boolean) => void
  onStorageFilesChanged?: () => Promise<void>
  inlineEdit?: boolean
  compactEdit?: boolean
  visibleSectionNames?: string[]
  excludeFields?: FormFields[]
  onCancel?: () => void
  onUpdated?: () => void
}) {
  const router = useRouter();
  const formMode = type;
  const [formData, setFormData] =
    useState<Partial<MediaFormData>>(initialMediaForm);
  const [formErrors, setFormErrors] =
    useState(getFormErrors(initialMediaForm));
  const [formActionErrorMessage, setFormActionErrorMessage] = useState('');
  const [activeSection, setActiveSection] = useState('');
  const navItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [albumTitles, setAlbumTitles] = useState(photoAlbumTitles
    .sort((a, b) => a.localeCompare(b))
    .join(','));

  const areAlbumTitlesModified = albumTitles !== photoAlbumTitles
    .sort((a, b) => a.localeCompare(b))
    .join(',');

  const { canDelete, confirmDialog, invalidateSwr, shouldDebugImageFallbacks } =
    useAppState();

  const appText = useAppText();
  const [categoryOptions, setCategoryOptions] = useState<string[]>(
    uniqueCategories.map(({ category }) => category),
  );
  const [studioOptions, setStudioOptions] = useState<string[]>(uniqueStudios);
  const [performerOptions, setPerformerOptions] =
    useState<string[]>(uniquePerformers);
  const [contentTypeOptions, setContentTypeOptions] =
    useState<string[]>(uniqueContentTypes);

  useEffect(() => {
    if (uniqueCategories.length > 0) {
      setCategoryOptions(uniqueCategories.map(({ category }) => category));
    }
  }, [uniqueCategories]);

  useEffect(() => {
    if (uniqueStudios.length > 0) {
      setStudioOptions(uniqueStudios);
    }
  }, [uniqueStudios]);

  useEffect(() => {
    if (uniquePerformers.length > 0) {
      setPerformerOptions(uniquePerformers);
    }
  }, [uniquePerformers]);

  useEffect(() => {
    if (uniqueContentTypes.length > 0) {
      setContentTypeOptions(uniqueContentTypes);
    }
  }, [uniqueContentTypes]);

  useEffect(() => {
    const currentCategories = (formData.categories ?? '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
    if (currentCategories.length === 0) { return; }
    setCategoryOptions(current =>
      Array.from(new Set([...(current || []), ...currentCategories])));
  }, [formData.categories]);

  useEffect(() => {
    const currentContentTypes = (formData.contentType ?? '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
    if (currentContentTypes.length === 0) { return; }
    setContentTypeOptions(current =>
      Array.from(new Set([...(current || []), ...currentContentTypes])));
  }, [formData.contentType]);

  useEffect(() => {
    if (
      formData.mediaType !== 'video' ||
      (
        uniqueStudios.length > 0 &&
        uniquePerformers.length > 0 &&
        uniqueContentTypes.length > 0
      )
    ) {
      return;
    }

    let cancelled = false;
    getUniqueVideoLibraryOptionsAction()
      .then(result => {
        if (cancelled || !result) { return; }
        if (Array.isArray(result.studios) && result.studios.length > 0) {
          setStudioOptions(current =>
            current.length > 0 ? current : result.studios);
        }
        if (Array.isArray(result.performers) && result.performers.length > 0) {
          setPerformerOptions(current =>
            current.length > 0 ? current : result.performers);
        }
        if (Array.isArray(result.contentTypes) && result.contentTypes.length > 0) {
          setContentTypeOptions(current =>
            current.length > 0 ? current : result.contentTypes);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    formData.mediaType,
    uniqueContentTypes.length,
    uniquePerformers.length,
    uniqueStudios.length,
  ]);

  // Subtitle language options management (must be inside component)
  // No pre-assigned languages; user can add their own
  const defaultSubtitleLangs = useMemo(() => [], []);
  const existingSubtitleLangs = useMemo(() => {
    const langs = new Set<string>();
    (photoStorageUrls || []).forEach(({ url }) => {
      const { fileName } = getFileNamePartsFromStorageUrl(url);
      const match = fileName.match(/-subtitles\.([a-zA-Z0-9_-]+)\.vtt$/i);
      if (match?.[1]) { langs.add(match[1]); }
    });
    return Array.from(langs.values());
  }, [photoStorageUrls]);
  const [subtitleLangOptions, setSubtitleLangOptions] = useState<string[]>(
    Array.from(new Set([...defaultSubtitleLangs, ...existingSubtitleLangs])),
  );
  const [subtitleUploadLang, setSubtitleUploadLang] = useState('');
  const [subtitleUploadLabel, setSubtitleUploadLabel] = useState('');
  const [subtitleRenameValues, setSubtitleRenameValues] = useState<Record<string, string>>({});
  const [subtitleLabelValues, setSubtitleLabelValues] = useState<Record<string, string>>({});
  const [subtitleManifestMetadata, setSubtitleManifestMetadata] = useState<
    Record<string, { lang: string, label: string }>
  >({});
  useEffect(() => {
    const manifestUrl = (photoStorageUrls || []).find(({ url }) =>
      /-subtitles\.json$/i.test(getFileNamePartsFromStorageUrl(url).fileName))?.url;
    if (!manifestUrl) {
      setSubtitleManifestMetadata({});
      return;
    }
    const controller = new AbortController();
    fetch(`${manifestUrl}${manifestUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async response => response.ok
        ? await response.json() as { tracks?: { src: string, lang: string, label?: string }[] }
        : undefined)
      .then(data => {
        const metadata: Record<string, { lang: string, label: string }> = {};
        (data?.tracks || []).forEach(track => {
          const fileName = getFileNamePartsFromStorageUrl(track.src).fileName;
          metadata[fileName.toLowerCase()] = {
            lang: track.lang,
            label: track.label || track.lang.toUpperCase(),
          };
        });
        setSubtitleManifestMetadata(metadata);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [photoStorageUrls]);
  // Load saved languages from DB and merge
  useEffect(() => {
    (async () => {
      try {
        const saved = await getSubtitleLanguagesAction();
        if (Array.isArray(saved)) {
          setSubtitleLangOptions(opts => Array.from(new Set([...(opts || []), ...saved])));
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    setSubtitleLangOptions(current =>
      Array.from(new Set([...(current || []), ...existingSubtitleLangs])));
  }, [existingSubtitleLangs]);

  const changedFormKeys = useMemo(() =>
    getChangedFormFields(initialMediaForm, formData),
  [initialMediaForm, formData]);
  const meaningfulChangedFormKeys = useMemo(() =>
    changedFormKeys.filter(key => key !== 'blurData'),
  [changedFormKeys]);
  const formHasChanged = changedFormKeys.length > 0 || areAlbumTitlesModified;
  const formHasMeaningfulChanges =
    meaningfulChangedFormKeys.length > 0 || areAlbumTitlesModified;

  usePreventNavigation(formHasMeaningfulChanges);

  const canFormBeSubmitted =
    (type === 'create' || formHasChanged) &&
    isFormValid(formData) &&
    !aiContent?.isLoading;

  const isVideoForm = (formData.mediaType || initialMediaForm.mediaType) === 'video';
  const isEditMode = formMode === 'edit';
  const subtitleTracks = useMemo(() =>
    (photoStorageUrls || []).filter(({ url }) =>
      /-subtitles(\.[a-zA-Z0-9_-]+)?\.vtt$/i
        .test(getFileNamePartsFromStorageUrl(url).fileName)),
  [photoStorageUrls]);
  const subtitleTrackItems = useMemo(() =>
    subtitleTracks.map(({ url }) => {
      const { fileName } = getFileNamePartsFromStorageUrl(url);
      const match = fileName.match(/-subtitles\.([a-zA-Z0-9_-]+)\.vtt$/i);
      return {
        url,
        fileName,
        lang: subtitleManifestMetadata[fileName.toLowerCase()]?.lang ||
          match?.[1] || 'default',
        label: subtitleManifestMetadata[fileName.toLowerCase()]?.label ||
          (match?.[1] || 'default').toUpperCase(),
      };
    }),
  [subtitleManifestMetadata, subtitleTracks]);
  const hasSubtitleManager = isVideoForm && isEditMode;

  // Update form when EXIF data
  // is refreshed by parent
  useEffect(() => {
    if (Object.keys(updatedExifData ?? {}).length > 0) {
      const changedKeys: (keyof MediaFormData)[] = [];

      setFormData(currentForm => {
        (Object.entries(updatedExifData ?? {}) as
          [keyof MediaFormData, string][])
          .forEach(([key, value]) => {
            let a = currentForm[key];
            let b = value;
            if (FIELDS_WITH_JSON.includes(key)) {
              try {
                a = a ? JSON.parse(a) : undefined;
                b = b ? JSON.parse(b) : undefined;
              } catch (error) {
                console.log(`Error parsing JSON: ${key}`, error);
              }
            }
            if (!deepEqual(a, b)) {
              changedKeys.push(key as keyof MediaFormData);
            }
          });

        return {
          ...currentForm,
          ...updatedExifData,
        };
      });

      if (changedKeys.length > 0) {
        const fields = convertFormKeysToLabels(changedKeys);
        toastSuccess(`Updated EXIF fields: ${fields.join(', ')}`, 8000);
      } else {
        toastWarning('No new EXIF data found');
      }
    }
  }, [updatedExifData]);

  const url = formData.url ?? '';

  useEffect(() => {
    if (updatedBlurData) {
      setFormData(data => updatedBlurData
        ? { ...data, blurData: updatedBlurData }
        : data);
    } else if (!BLUR_ENABLED) {
      setFormData(data => ({ ...data, blurData: '' }));
    }
  }, [updatedBlurData]);

  useEffect(() =>
    setFormData(data => aiContent?.title
      ? { ...data, title: aiContent?.title }
      : data),
  [aiContent?.title]);

  useEffect(() =>
    setFormData(data => aiContent?.caption
      ? { ...data, caption: aiContent?.caption }
      : data),
  [aiContent?.caption]);

  useEffect(() =>
    setFormData(data => aiContent?.tags
      ? { ...data, tags: aiContent?.tags }
      : data),
  [aiContent?.tags]);

  useEffect(() =>
    setFormData(data => aiContent?.semanticDescription
      ? { ...data, semanticDescription: aiContent?.semanticDescription }
      : data),
  [aiContent?.semanticDescription]);

  useEffect(() => {
    onFormDataChange?.(formData);
  }, [onFormDataChange, formData]);

  useEffect(() => {
    if (!activeSection) { return; }
    navItemRefs.current[activeSection]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [activeSection]);

  const isFieldGeneratingAi = (key: keyof MediaFormData) => {
    switch (key) {
      case 'title':
        return aiContent?.isLoadingTitle;
      case 'caption':
        return aiContent?.isLoadingCaption;
      case 'tags':
        return aiContent?.isLoadingTags;
      case 'semanticDescription':
        return aiContent?.isLoadingSemantic;
      default:
        return false;
    }
  };

  const accessoryForField = (key: keyof MediaFormData) => {
    if (aiContent) {
      switch (key) {
        case 'title':
          return <AiButton
            tabIndex={-1}
            aiContent={aiContent}
            requestFields={['title']}
            shouldConfirm={Boolean(formData.title)}
            className="h-full"
          />;
        case 'caption':
          return <AiButton
            tabIndex={-1}
            aiContent={aiContent}
            requestFields={['caption']}
            shouldConfirm={Boolean(formData.caption)}
            className="h-full"
          />;
        case 'tags':
          return <AiButton
            tabIndex={-1}
            aiContent={aiContent}
            requestFields={['tags']}
            shouldConfirm={Boolean(formData.tags)}
            className="h-full"
          />;
        case 'semanticDescription':
          return <AiButton
            tabIndex={-1}
            aiContent={aiContent}
            requestFields={['semantic']}
            shouldConfirm={Boolean(formData.semanticDescription)}
          />;
        case 'blurData':
          return shouldDebugImageFallbacks && type === 'edit' && formData.url
            ? <UpdateBlurDataButton
              photoUrl={getOptimizedMediaUrlForManipulation(
                formData.url,
                IS_PREVIEW,
              )}
              onUpdatedBlurData={blurData =>
                setFormData(data => ({ ...data, blurData }))}
            />
            : null;
      }
    }
  };

  const renderStorageFilesPanel = () => photoStorageUrls
    ? <SmallDisclosure label="Optimized and linked file set">
            <div className="space-y-1">
              {photoStorageUrls
                .map(({ url, size }) => {
                  const { fileName } = getFileNamePartsFromStorageUrl(url);
                  const mainFileName = getFileNamePartsFromStorageUrl(String((initialMediaForm as any).url || '')).fileName;
                  const canDeleteFile = canDelete &&
                    Boolean(mainFileName && mainFileName !== fileName);
                  const FileIcon = /-subtitles\.json$/i.test(fileName)
                    ? TbJson
                    : /-subtitles(\.[a-zA-Z0-9_-]+)?\.vtt$/i.test(fileName)
                      ? TbFileText
                      : /\.(jpe?g|png|webp|avif)$/i.test(fileName)
                        ? TbPhoto
                        : TbFile;
                  return (
                    <div key={url} className="flex items-start w-full gap-3 py-1">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <FileIcon className="text-medium shrink-0" />
                        <Link
                          href={url}
                          target="_blank"
                          className="hover:underline break-all whitespace-normal min-w-0 flex-1"
                        >
                          {fileName}
                        </Link>
                      </div>
                      <span className="w-16 text-right text-dim shrink-0 self-start">{size}</span>
                      {canDeleteFile && (
                        <div className="shrink-0 self-start">
                          <button
                            type="button"
                            className="text-error underline decoration-dotted"
                            onClick={async () => {
                              const didConfirm = await confirmDialog?.({
                                description: 'Delete this file from storage?',
                                confirmLabel: 'Delete',
                                tone: 'danger',
                              });
                              if (!didConfirm) { return; }
                              const fd = new FormData();
                              fd.set('photoId', String((initialMediaForm as any).id));
                              fd.set('assetFileName', fileName);
                              deleteStorageAssetAction(fd).then(async () => {
                                await onStorageFilesChanged?.();
                                router.refresh();
                              });
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </SmallDisclosure>
    : type === 'edit'
      ? <div className="text-sm text-dim">Loading linked files...</div>
      : undefined;

  const footerForField = (key: keyof MediaFormData) => {
    switch (key) {
      case 'url':
        return isVideoForm ? undefined : renderStorageFilesPanel();
    }
  };

  const isFieldHidden = (
    key: FormFields,
    hideIfEmpty?: boolean,
    shouldHide?: FormMeta['shouldHide'],
  ) => {
    if (
      key === 'favorite' &&
      type === 'edit'
    ) {
      return true;
    } else if (
      key === 'blurData' &&
      type === 'create' &&
      !BLUR_ENABLED &&
      !shouldDebugImageFallbacks
    ) {
      return true;
    } else {
      return (
        (key === 'subtitles' && !hasSubtitleManager) ||
        (hideIfEmpty && !formData[key]) ||
        shouldHide?.(formData, changedFormKeys)
      );
    }
  };

  const onMatchResults = useCallback((didFindMatchingMedia: boolean) => {
    setFormData(data => ({
      ...data,
      applyRecipeTitleGlobally: didFindMatchingMedia
        ? 'true'
        : 'false',
    }));
  }, [setFormData]);

  const studioTagOptions = useMemo(() =>
    studioOptions.map(studio => ({ value: studio })),
  [studioOptions]);
  const categoryTagOptions = useMemo(() =>
    categoryOptions.map(category => ({ value: category })),
  [categoryOptions]);

  const performerTagOptions = useMemo(() =>
    performerOptions.map(performer => ({ value: performer })),
  [performerOptions]);
  const contentTypeTagOptions = useMemo(() =>
    contentTypeOptions.map(contentType => ({ value: contentType })),
  [contentTypeOptions]);

  const formContent = useMemo(() =>
    FORM_METADATA_ENTRIES_BY_SECTION(
      convertTagsForForm(uniqueTags, appText),
      categoryTagOptions,
      studioTagOptions,
      performerTagOptions,
      contentTypeTagOptions,
      convertRecipesForForm(uniqueRecipes),
      convertFilmsForForm(uniqueFilms, isMakeFujifilm(formData.make)),
      aiContent !== undefined,
      shouldStripGpsData,
    ), [
    uniqueTags,
    categoryTagOptions,
    studioTagOptions,
    performerTagOptions,
    contentTypeTagOptions,
    appText,
    uniqueRecipes,
    uniqueFilms,
    formData.make,
    aiContent,
    shouldStripGpsData,
  ]);

  const orderedSections = useMemo(() => {
    const sectionOrder = isVideoForm
      ? VIDEO_SECTION_ORDER
      : PHOTO_SECTION_ORDER;
    const sectionIndex = new Map(
      sectionOrder.map((section, index) => [section, index]),
    );

    return [...formContent].sort((a, b) =>
      (sectionIndex.get(a.section) ?? Number.MAX_SAFE_INTEGER) -
      (sectionIndex.get(b.section) ?? Number.MAX_SAFE_INTEGER));
  }, [formContent, isVideoForm]);

  const visibleSections = useMemo(() =>
    orderedSections
      .filter(({ section }) =>
        !visibleSectionNames || visibleSectionNames.includes(section))
      .map(section => ({
        ...section,
        fields: section.fields.filter(([key, {
          hideIfEmpty,
          shouldHide,
          type,
        }]) =>
          !excludeFields.includes(key) &&
          type !== 'hidden' &&
          !isFieldHidden(key, hideIfEmpty, shouldHide)),
      }))
      .filter(section => section.fields.length > 0),
  [
    orderedSections,
    formData,
    changedFormKeys,
    hasSubtitleManager,
    excludeFields,
    visibleSectionNames,
  ]);

  const hiddenFields = useMemo(() =>
    orderedSections.flatMap(({ section, fields }) =>
      fields.filter(([key, {
        hideIfEmpty,
        shouldHide,
        type,
      }]) =>
        !excludeFields.includes(key) &&
        (
          Boolean(
            visibleSectionNames && !visibleSectionNames.includes(section),
          ) || (
            type === 'hidden' &&
            !isFieldHidden(key, hideIfEmpty, shouldHide)
          )
        ))),
  [
    orderedSections,
    formData,
    changedFormKeys,
    hasSubtitleManager,
    excludeFields,
    visibleSectionNames,
  ]);

  const ref = useRef<HTMLDivElement>(null);
  const [failedThumbnailPreviewUrl, setFailedThumbnailPreviewUrl] =
    useState<string>();
  const isThumbnailVisible = useIsVisible({ ref, initiallyVisible: true });
  const thumbnailPreviewUrl = isVideoForm
    ? (photoStorageUrls || []).find(({ url }) =>
      /-preview\.(mp4|webm)$/i.test(
        getFileNamePartsFromStorageUrl(url).fileName,
      ))?.url || (initialMediaForm as any).previewUrl
    : undefined;
  const isThumbnailPreviewActive = useVideoPreviewLifecycle({
    ref,
    enabled: Boolean(
      isVideoForm &&
      thumbnailPreviewUrl &&
      failedThumbnailPreviewUrl !== thumbnailPreviewUrl,
    ),
  });
  const thumbnailDimensions =
    getDimensionsFromSize(THUMBNAIL_SIZE, formData.aspectRatio);
  const thumbnail = (includeRef?: boolean, className?: string) => {
    const isVideo = (formData.mediaType || (initialMediaForm as any).mediaType) === 'video';
    if (isVideo) {
      const poster = (photoStorageUrls || []).find(({ url }) => /-poster\.jpg$/i.test(getFileNamePartsFromStorageUrl(url).fileName))?.url || (initialMediaForm as any).posterUrl;
      return (
        <div
          className={clsx(
            'relative',
            'border rounded-md overflow-hidden',
            'border-gray-200 dark:border-gray-700',
            'bg-black object-contain',
            className,
          )}
          style={{ width: thumbnailDimensions.width, height: thumbnailDimensions.height }}
        >
          {poster &&
            <img src={poster} alt="" className="absolute inset-0 size-full object-contain" />}
          {includeRef && isThumbnailPreviewActive && thumbnailPreviewUrl &&
            <video
              src={thumbnailPreviewUrl}
              poster={poster}
              className="absolute inset-0 size-full object-contain"
              muted
              loop
              playsInline
              autoPlay
              preload="auto"
              disablePictureInPicture
              disableRemotePlayback
              controlsList="nodownload noplaybackrate"
              onContextMenu={(e) => e.preventDefault()}
              onError={() => setFailedThumbnailPreviewUrl(thumbnailPreviewUrl)}
            />}
        </div>
      );
    }
    return (
      <ImageWithFallback
        alt="Upload"
        src={url}
        className={clsx(
          'border rounded-md overflow-hidden',
          'border-gray-200 dark:border-gray-700',
          className,
        )}
        blurDataURL={formData.blurData}
        blurCompatibilityLevel="none"
        width={thumbnailDimensions.width}
        height={thumbnailDimensions.height}
        priority
      />
    );
  };

  const scrollToSection = useCallback((sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (!element) { return; }
    const top = window.scrollY +
      element.getBoundingClientRect().top -
      SECTION_SCROLL_TOP_OFFSET;
    window.scrollTo({
      top: Math.max(0, top),
      behavior: 'smooth',
    });
  }, []);

  return (
    <div className="space-y-5 max-w-[42rem] relative">
      {!compactEdit && <>
        <div
          className={clsx(
            'flex flex-col gap-4',
            'sm:flex-row sm:items-start sm:gap-3',
          )}
        >
          <div ref={ref} className="relative shrink-0 self-start">
            {thumbnail(true)}
            <div className={clsx(
              'hidden min-[1500px]:block',
              'fixed top-8',
              'left-[calc(50%+22rem)] 3xl:left-[calc(50%+24rem)]',
              // Prevent image blocking form button interaction
              'pointer-events-none',
            )}>
              {thumbnail(false, clsx(
                'opacity-0 -translate-y-4',
                !isThumbnailVisible &&
                'opacity-100 translate-y-0 transition-all duration-300',
              ))}
            </div>
            <div className={clsx(
              'absolute top-2 left-2 transition-opacity duration-500',
              aiContent?.isLoading ? 'opacity-100' : 'opacity-0',
            )}>
              <div className={clsx(
                'leading-none text-xs font-medium uppercase tracking-wide',
                'px-1.5 py-1 rounded-[4px]',
                'inline-flex items-center gap-2',
                'bg-white/70 dark:bg-black/60 backdrop-blur-md',
                'border border-gray-900/10 dark:border-gray-700/70',
                'select-none',
              )}>
                <Spinner
                  color="text"
                  size={9}
                  className={clsx(
                    'text-extra-dim',
                    'translate-x-[1px] translate-y-[0.5px]',
                  )}
                />
                {isVideoForm ? 'Analyzing media' : 'Analyzing image'}
              </div>
            </div>
          </div>
          <div className={clsx(
            'min-w-0 flex-1 space-y-2',
            'sm:pt-1',
          )}>
            <div className="text-[0.7rem] font-medium uppercase tracking-[0.2em] text-dim">
              {isVideoForm ? 'Library Edit' : 'Photo Edit'}
            </div>
            <div className="text-xl font-semibold leading-tight break-words">
              {formData.title || 'Untitled'}
            </div>
            <div className="flex flex-wrap gap-2 text-xs uppercase tracking-wide text-dim">
              <span className={clsx(
                'px-2 py-1 rounded-full',
                'bg-gray-100 dark:bg-gray-900',
              )}>
                {isVideoForm ? 'Video' : 'Photo'}
              </span>
              {isVideoForm && formData.contentType &&
              <span className={clsx(
                'px-2 py-1 rounded-full',
                'bg-gray-100 dark:bg-gray-900',
              )}>
                {formData.contentType}
              </span>}
            </div>
            <div className="text-sm text-dim max-w-xl">
              {isVideoForm
                ? 'Update core library details first. Playback, files, and lower-frequency controls stay grouped below.'
                : 'Primary details come first. Capture metadata, image info, files, and advanced controls stay grouped below.'}
            </div>
          </div>
        </div>
      </>}
        {formActionErrorMessage &&
        <ErrorNote>{formActionErrorMessage}</ErrorNote>}
        {!compactEdit && <div className={clsx(
          'sticky top-3 z-30 mx-auto w-full bg-main/92 backdrop-blur-xl',
          'border border-gray-200 dark:border-gray-700',
          'rounded-[1.4rem] px-3 py-2 shadow-md',
          'overflow-x-auto',
          'mb-3 transition-all duration-300',
        )}>
          <div className="flex gap-2 min-w-max">
            {visibleSections.map(({ section }) => (
              <button
                key={section}
                type="button"
                ref={element => {
                  navItemRefs.current[getSectionDomId(section, isVideoForm)] =
                    element;
                }}
                onClick={() =>
                  scrollToSection(getSectionDomId(section, isVideoForm))}
                className={clsx(
                  'cursor-pointer whitespace-nowrap uppercase tracking-[0.16em]',
                  'px-3 py-2 rounded-xl transition-all duration-250 text-[0.72rem]',
                  activeSection === getSectionDomId(section, isVideoForm)
                    ? clsx(
                      'bg-black text-white dark:bg-white dark:text-black font-semibold',
                      'shadow-sm scale-[1.01]',
                    )
                    : 'text-dim hover:text-main hover:bg-gray-100 dark:hover:bg-gray-900',
                )}
              >
                {getSectionLabel(section, isVideoForm)}
              </button>
            ))}
          </div>
        </div>}
        <form
          action={async data => {
            try {
              await (type === 'create'
                ? createMediaAction
                : inlineEdit
                  ? updateMediaInlineAction
                  : updateMediaAction
              )(data);
              if (inlineEdit) { onUpdated?.(); }
            } catch (e: any) {
              if (e.message !== 'NEXT_REDIRECT') {
                setFormActionErrorMessage(e.message);
              }
            }
          }}
          onSubmit={() => {
            setFormActionErrorMessage('');
            (document.activeElement as HTMLElement)?.blur?.();
            invalidateSwr?.();
          }}
          onKeyDownCapture={event => {
            if (shouldPreventImplicitFormSubmit(event)) {
              event.preventDefault();
            }
          }}
        >
          {hiddenFields.map(([key, { staticValue }]) => (
            <input
              key={key}
              type="hidden"
              name={key}
              value={staticValue ?? formData[key] ?? ''}
            />
          ))}
          <input
            type="hidden"
            name="uploadOriginalFileName"
            value={formData.uploadOriginalFileName ?? ''}
          />
          {type === 'edit' &&
            <input
              type="hidden"
              name="favorite"
              value={formData.favorite ?? 'false'}
            />}
          {/* Fields */}
          <AnchorSections
            className={compactEdit ? 'space-y-5' : 'mt-6 space-y-8'}
            classNameSection="scroll-mt-28"
            onSectionChange={section => {
              setActiveSection(section);
            }}
            sections={visibleSections
              .map(({ section, fields }) => ({
                id: getSectionDomId(section, isVideoForm),
                content: <div className={clsx(
                  'relative focus-within:z-50',
                  'rounded-[1.5rem] border border-gray-200 dark:border-gray-800',
                  'bg-white/90 dark:bg-black/35 backdrop-blur-sm',
                  'px-4 sm:px-5 py-5',
                  'space-y-5 shadow-sm',
                  'transition-transform duration-300 motion-safe:hover:translate-y-[-1px]',
                )}>
                  <div className="space-y-1">
                    <div className="text-[0.7rem] font-medium uppercase tracking-[0.2em] text-dim">
                      {getSectionLabel(section, isVideoForm)}
                    </div>
                    <div className="text-sm text-dim">
                      {getSectionDescription(section, isVideoForm)}
                    </div>
                  </div>
                  {section === 'storage' && isVideoForm && isEditMode &&
                    renderStorageFilesPanel()}
                  <div className="space-y-5">
                    {fields.map(([key, {
                      label,
                      note,
                      noteShort,
                      required,
                      selectOptions,
                      selectOptionsDefaultLabel,
                      tagOptions,
                      tagOptionsLimit,
                      tagOptionsLimitValidationMessage,
                      tagOptionsShouldParameterize,
                      readOnly,
                      hideModificationStatus,
                      validate,
                      validateStringMaxLength,
                      spellCheck,
                      capitalize,
                      hideIfEmpty,
                      shouldHide,
                      loadingMessage,
                      type,
                      staticValue,
                    }]) => {
                      if (!isFieldHidden(key, hideIfEmpty, shouldHide)) {
                      // eslint-disable-next-line max-len
                        const fieldProps: ComponentProps<typeof FieldsetWithStatus> = {
                          id: key,
                          label: label + (
                            key === 'blurData' && shouldDebugImageFallbacks
                              ? ` (${(formData[key] ?? '').length} chars.)`
                              : ''
                          ),
                          note,
                          noteShort,
                          error: formErrors[key],
                          value: key === 'aspectRatio'
                            ? formatAspectRatioForDisplay(
                              staticValue ?? formData[key] ?? '',
                            )
                            : staticValue ?? formData[key] ?? '',
                          isModified: (
                            !hideModificationStatus &&
                          changedFormKeys.includes(key)
                          ),
                          onChange: value => {
                            const formUpdated = { ...formData, [key]: value };
                            setFormData(formUpdated);
                            if (validate) {
                              setFormErrors({
                                ...formErrors, [key]:
                              validate(value),
                              });
                            } else if (validateStringMaxLength !== undefined) {
                              setFormErrors({
                                ...formErrors,
                                [key]: value.length > validateStringMaxLength
                                  ? `${validateStringMaxLength} characters or less`
                                  : undefined,
                              });
                            }
                            if (key === 'title') {
                              onTitleChange?.(value.trim());
                            }
                          },
                          selectOptions,
                          selectOptionsDefaultLabel: selectOptionsDefaultLabel,
                          tagOptions,
                          tagOptionsLimit,
                          tagOptionsLimitValidationMessage,
                          tagOptionsShouldParameterize,
                          required,
                          readOnly,
                          spellCheck,
                          capitalize,
                          placeholder: loadingMessage && !formData[key]
                            ? loadingMessage
                            : undefined,
                          loading: (
                            (loadingMessage && !formData[key] ? true : false) ||
                          isFieldGeneratingAi(key)
                          ),
                          type,
                          accessory: accessoryForField(key),
                          footer: footerForField(key),
                        };
                        switch (key) {
                          case 'film':
                            return <FieldsetWithStatus
                              key={key}
                              {...fieldProps}
                              tagOptionsDefaultIcon={<span
                                className="w-4 overflow-hidden"
                              >
                                <MediaFilmIcon />
                              </span>}
                            />;
                          case 'applyRecipeTitleGlobally':
                            return <ApplyRecipeTitleGloballyCheckbox
                              key={key}
                              {...fieldProps}
                              photoId={initialMediaForm.id}
                              recipeTitle={formData.recipeTitle}
                              hasRecipeTitleChanged={
                                changedFormKeys.includes('recipeTitle')}
                              recipeData={formData.recipeData}
                              film={formData.film}
                              onMatchResults={onMatchResults}
                            />;
                          case 'colorData':
                            return <FieldsetWithStatus
                              key={key}
                              {...fieldProps}
                              noteComplex={<MediaColors
                                classNameDot="size-[13px]!"
                                // eslint-disable-next-line max-len
                                colorData={generateColorDataFromString(formData.colorData)}
                              />}
                            />;
                          case 'tags':
                            return <FieldsetWithStatus
                              key={key}
                              {...fieldProps}
                              className="relative z-2"
                            />;
                          case 'albums':
                            return <FieldsetAlbum
                              key={key}
                              {...fieldProps}
                              albumOptions={albums}
                              value={albumTitles}
                              onChange={value => setAlbumTitles(value)}
                              isModified={areAlbumTitlesModified}
                              className={clsx(
                                fieldProps.className,
                                'relative z-1',
                              )}
                            />;
                          case 'subtitles':
                            return formMode === 'edit'
                              ? photoStorageUrls
                                ? (
                                  <div
                                    key={key}
                                    className={clsx(
                                      'space-y-4 rounded-[1.4rem]',
                                      'border border-gray-200 dark:border-gray-800',
                                      'bg-gray-50/80 dark:bg-gray-950/30',
                                      'p-4 sm:p-5 shadow-sm',
                                    )}
                                  >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                      <div className="text-sm font-medium uppercase tracking-[0.16em]">
                                        Subtitle Manager
                                      </div>
                                      <div className="text-sm text-dim">
                                        Upload tracks, pick a language, and rename or remove existing files here.
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-dim">
                                      <span>{subtitleTrackItems.length} tracks</span>
                                      <span className="text-gray-300 dark:text-gray-700">/</span>
                                      <span>{subtitleLangOptions.length} language options</span>
                                    </div>
                                    <div className="space-y-3">
                                      <div className="text-sm font-medium">
                                        Add Track
                                      </div>
                                      <input
                                        type="hidden"
                                        name="photoId"
                                        value={String((initialMediaForm as any).id)}
                                      />
                                      <input
                                        type="file"
                                        name="subtitleFiles"
                                        multiple
                                        accept=".vtt,.srt,.ass,.ssa,.idx,.sub"
                                        className="block"
                                      />
                                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                        <FieldsetWithStatus
                                          id="subtitleLang"
                                          label="language"
                                          value={subtitleUploadLang}
                                          onChange={value => setSubtitleUploadLang(value)}
                                          tagOptions={subtitleLangOptions.map(code => ({
                                            value: code,
                                            label: code,
                                          }))}
                                          tagOptionsLimit={1}
                                          tagOptionsAllowNewValues
                                          placeholder="e.g. en"
                                          className="min-w-0 flex-1"
                                        />
                                        <FieldsetWithStatus
                                          id="subtitleLabel"
                                          label="display name"
                                          value={subtitleUploadLabel}
                                          onChange={setSubtitleUploadLabel}
                                          placeholder="e.g. English Full"
                                          className="min-w-0 flex-1"
                                        />
                                        <button
                                          type="submit"
                                          className="button self-start sm:self-auto"
                                          formAction={async (data) => {
                                            await addSubtitlesAction(data);
                                            await onStorageFilesChanged?.();
                                          }}
                                          formEncType="multipart/form-data"
                                        >
                                          Upload Track
                                        </button>
                                      </div>
                                    </div>
                                    <div className="space-y-3">
                                      <div className="text-sm font-medium">
                                        Current Tracks
                                      </div>
                                      {subtitleTrackItems.map(({ url, fileName, lang, label }) => (
                                        <div
                                          key={url}
                                          className={clsx(
                                            'space-y-3 rounded-xl border border-gray-200 dark:border-gray-800',
                                            'px-4 py-3',
                                          )}
                                        >
                                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                            <Link
                                              href={url}
                                              target="_blank"
                                              className="min-w-0 break-all underline"
                                            >
                                              {fileName}
                                            </Link>
                                            <span className="text-xs uppercase tracking-[0.16em] text-dim">
                                              {lang}
                                            </span>
                                          </div>
                                          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                            <FieldsetWithStatus
                                              label="language"
                                              value={subtitleRenameValues[fileName] ?? lang}
                                              onChange={(value) => setSubtitleRenameValues(v => ({
                                                ...v,
                                                [fileName]: value,
                                              }))}
                                              tagOptions={subtitleLangOptions.map(code => ({
                                                value: code,
                                                label: code,
                                              }))}
                                              tagOptionsLimit={1}
                                              tagOptionsAllowNewValues
                                              placeholder="rename language"
                                              className="w-full sm:max-w-[14rem]"
                                            />
                                            <FieldsetWithStatus
                                              label="display name"
                                              value={subtitleLabelValues[fileName] ?? label}
                                              onChange={(value) => setSubtitleLabelValues(v => ({
                                                ...v,
                                                [fileName]: value,
                                              }))}
                                              placeholder="e.g. English Full"
                                              className="w-full sm:max-w-[18rem]"
                                            />
                                            <div className="flex flex-wrap gap-2">
                                              <button
                                                type="button"
                                                className="button button-secondary"
                                                onClick={async () => {
                                                  const next =
                                                    (subtitleRenameValues[fileName] ?? lang)
                                                      .trim();
                                                  const nextLabel =
                                                    (subtitleLabelValues[fileName] ?? label)
                                                      .trim();
                                                  if (!next || !nextLabel ||
                                                    (next === lang && nextLabel === label)) {
                                                    return;
                                                  }
                                                  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(next)) {
                                                    alert('Invalid language code.');
                                                    return;
                                                  }
                                                  if (nextLabel.length > 120) {
                                                    alert('Display name is too long.');
                                                    return;
                                                  }
                                                  const didConfirm =
                                                    await confirmDialog?.({
                                                      description:
                                                        `Save '${nextLabel}' (${next})?`,
                                                      confirmLabel: 'Save',
                                                    });
                                                  if (!didConfirm) {
                                                    return;
                                                  }
                                                  const fd = new FormData();
                                                  fd.set('photoId', String((initialMediaForm as any).id));
                                                  fd.set('subtitleFileName', fileName);
                                                  fd.set('subtitleNewLang', next);
                                                  fd.set('subtitleNewLabel', nextLabel);
                                                  updateSubtitleTrackAction(fd).then(async () => {
                                                    if (!subtitleLangOptions.includes(next)) {
                                                      setSubtitleLangOptions(opts =>
                                                        Array.from(new Set([
                                                          ...opts,
                                                          next,
                                                        ])));
                                                    }
                                                    setSubtitleRenameValues(v => ({
                                                      ...v,
                                                      [fileName]: next,
                                                    }));
                                                    setSubtitleLabelValues(v => ({
                                                      ...v,
                                                      [fileName]: nextLabel,
                                                    }));
                                                    await onStorageFilesChanged?.();
                                                    router.refresh();
                                                  });
                                                }}
                                              >
                                                Save Rename
                                              </button>
                                               {canDelete && <button
                                                 type="button"
                                                 className="button text-error"
                                                onClick={async () => {
                                                  const didConfirm =
                                                    await confirmDialog?.({
                                                      description:
                                                        'Delete this subtitle from storage?',
                                                      confirmLabel: 'Delete',
                                                      tone: 'danger',
                                                    });
                                                  if (!didConfirm) {
                                                    return;
                                                  }
                                                  const fd = new FormData();
                                                  fd.set('photoId', String((initialMediaForm as any).id));
                                                  fd.set('subtitleFileName', fileName);
                                                  deleteSubtitleAction(fd)
                                                    .then(async () => {
                                                      await onStorageFilesChanged?.();
                                                      router.refresh();
                                                    });
                                                }}
                                              >
                                                Delete Track
                                               </button>}
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                      {subtitleTrackItems.length === 0 &&
                                        <div className={clsx(
                                          'rounded-2xl border border-dashed',
                                          'border-gray-300 dark:border-gray-700',
                                          'px-4 py-6 text-sm text-dim',
                                        )}>
                                          No subtitle tracks uploaded yet.
                                        </div>}
                                    </div>
                                  </div>
                                )
                                : (
                                  <div
                                    key={key}
                                    className={clsx(
                                      'space-y-3 rounded-[1.4rem]',
                                      'border border-gray-200 dark:border-gray-800',
                                      'bg-gray-50/80 dark:bg-gray-950/30',
                                      'p-4 sm:p-5 shadow-sm',
                                    )}
                                  >
                                    <div className="text-sm font-medium uppercase tracking-[0.16em]">
                                      Subtitle Manager
                                    </div>
                                    <div className="text-sm text-dim">
                                      Loading subtitle files and language controls...
                                    </div>
                                  </div>
                                )
                              : null;
                          case 'visibility':
                            return <FieldsetVisibility
                              key={key}
                              {...fieldProps}
                              formData={formData}
                              setFormData={setFormData}
                              isModified={didVisibilityChange(
                                initialMediaForm,
                                formData,
                              )}
                            />;
                          case 'favorite':
                            return <FieldsetFavs
                              key={key}
                              {...fieldProps}
                            />;
                          default:
                            return <FieldsetWithStatus
                              key={key}
                              {...fieldProps}
                            />;
                        }
                      }
                    })}
                  </div>
                </div>,
              }))}
          />
          {/* Actions */}
          <div className={clsx(
            'flex gap-3 sticky bottom-0',
            compactEdit ? 'pb-1 mt-6' : 'pb-4 md:pb-8 mt-16',
            'relative z-20',
          )}>
            {inlineEdit
              ? <button type="button" className="button" onClick={onCancel}>
                  Cancel
                </button>
              : <Link
                className="button"
                href={type === 'edit' ? PATH_ADMIN_PHOTOS : PATH_ADMIN_UPLOADS}
              >
                Cancel
              </Link>}
            <SubmitButtonWithStatus
              icon={type === 'create' && <IconAddUpload />}
              disabled={!canFormBeSubmitted}
              onFormStatusChange={onFormStatusChange}
              hideText="never"
              primary
            >
              {type === 'create' ? 'Add' : 'Update'}
            </SubmitButtonWithStatus>
            <div className={clsx(
              'absolute -top-16 -left-2 right-0 bottom-0 -z-10',
              'pointer-events-none',
              'bg-linear-to-t',
              'from-white/95 from-60%',
              'dark:from-black/95 dark:from-50%',
            )} />
          </div>
        </form>
    </div>
  );
};
