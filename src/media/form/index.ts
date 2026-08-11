import {
  DEFAULT_ASPECT_RATIO,
  MEDIA_TYPES,
  MediaType,
  Media,
  MediaDbInsert,
  TRANSCODE_STATUSES,
  getDisplayTranscodeStatus,
  isVideoMedia,
} from '..';
import {
  generateLocalNaivePostgresString,
  generateLocalPostgresString,
  validationMessageNaivePostgresDateString,
  validationMessagePostgresDateString,
} from '@/utility/date';
import { roundToNumber } from '@/utility/number';
import { parseAspectRatio } from '@/utility/size';
import { convertStringToArray, parameterize } from '@/utility/string';
import { generateMediaNanoid } from '@/utility/nanoid';
import { TAG_FAVS, getValidationMessageForTags } from '@/tag';
import { MAKE_FUJIFILM } from '@/platforms/fujifilm';
import { FujifilmRecipe } from '@/platforms/fujifilm/recipe';
import { ReactNode } from 'react';
import { FujifilmSimulation } from '@/platforms/fujifilm/simulation';
import { SelectMenuOptionType } from '@/components/SelectMenuOption';
import { COLOR_SORT_ENABLED } from '@/app/config';

type VirtualFields =
  'albums' |
  'subtitles' |
  'visibility' |
  'favorite' |
  'applyRecipeTitleGlobally' |
  'shouldStripGpsData' |
  'uploadOriginalFileName';

export type FormFields = keyof MediaDbInsert | VirtualFields;

export type MediaFormData = Record<FormFields, string>

export type FieldSetType =
  'text' |
  'email' |
  'password' |
  'checkbox' |
  'textarea' |
  'hidden';

export type AnnotatedTag = {
  value: string,
  label?: string,
  icon?: ReactNode
  annotation?: string,
  annotationAria?: string,
};

export type FormMeta = {
  section: string
  label: string
  note?: string
  noteShort?: string
  required?: boolean
  excludeFromInsert?: boolean
  readOnly?: boolean
  hideModificationStatus?: boolean
  validate?: (value?: string) => string | undefined
  validateStringMaxLength?: number
  spellCheck?: boolean
  capitalize?: boolean
  hideIfEmpty?: boolean
  shouldHide?: (
    formData: Partial<MediaFormData>,
    changedFormKeys?: (keyof MediaFormData)[],
  ) => boolean
  loadingMessage?: string
  type?: FieldSetType
  selectOptions?: SelectMenuOptionType[]
  selectOptionsDefaultLabel?: string
  tagOptions?: AnnotatedTag[]
  tagOptionsLimit?: number
  tagOptionsLimitValidationMessage?: string
  tagOptionsShouldParameterize?: boolean
  shouldNotOverwriteWithNullDataOnSync?: boolean
  isJson?: boolean
  staticValue?: string
};

const STRING_MAX_LENGTH_SHORT = 255;
const STRING_MAX_LENGTH_LONG  = 1000;

const hideIfNotVideo = ({ mediaType }: Partial<MediaFormData>) =>
  mediaType !== 'video';

const hideIfVideo = ({ mediaType }: Partial<MediaFormData>) =>
  mediaType === 'video';

const FORM_METADATA = (
  tagOptions?: AnnotatedTag[],
  categoryOptions?: AnnotatedTag[],
  studioOptions?: AnnotatedTag[],
  performerOptions?: AnnotatedTag[],
  contentTypeOptions?: AnnotatedTag[],
  recipeOptions?: AnnotatedTag[],
  filmOptions?: AnnotatedTag[],
  aiTextGeneration?: boolean,
  shouldStripGpsData?: boolean,
): Record<keyof MediaFormData, FormMeta> => ({
  title: {
    section: 'text',
    label: 'title',
    required: true,
    capitalize: true,
    validateStringMaxLength: STRING_MAX_LENGTH_SHORT,
    shouldNotOverwriteWithNullDataOnSync: true,
  },
  caption: {
    section: 'text',
    label: 'caption',
    capitalize: true,
    validateStringMaxLength: STRING_MAX_LENGTH_LONG,
    shouldHide: ({ title, caption }) =>
      !aiTextGeneration && (!title && !caption),
  },
  tags: {
    section: 'text',
    label: 'tags',
    tagOptions,
    validate: getValidationMessageForTags,
  },
  categories: {
    section: 'text',
    label: 'categories',
    tagOptions: categoryOptions,
    validateStringMaxLength: STRING_MAX_LENGTH_LONG,
  },
  studio: {
    section: 'text',
    label: 'studio',
    tagOptions: studioOptions,
    tagOptionsLimit: 1,
    validateStringMaxLength: STRING_MAX_LENGTH_SHORT,
    shouldHide: hideIfNotVideo,
  },
  performers: {
    section: 'text',
    label: 'performers',
    tagOptions: performerOptions,
    validateStringMaxLength: STRING_MAX_LENGTH_LONG,
    shouldHide: hideIfNotVideo,
  },
  contentType: {
    section: 'text',
    label: 'content type',
    tagOptions: contentTypeOptions,
    tagOptionsLimitValidationMessage:
      'Use commas to add multiple content types',
    validateStringMaxLength: STRING_MAX_LENGTH_LONG,
    shouldHide: hideIfNotVideo,
  },
  rating: {
    section: 'text',
    label: 'rating',
    shouldHide: () => true,
  },
  watched: {
    section: 'text',
    label: 'watched',
    type: 'checkbox',
    shouldHide: () => true,
  },
  semanticDescription: {
    section: 'text',
    type: 'textarea',
    label: 'semantic description (not visible)',
    capitalize: true,
    validateStringMaxLength: STRING_MAX_LENGTH_LONG,
    shouldHide: () => !aiTextGeneration,
  },
  mediaType: {
    section: 'media',
    label: 'media type',
    readOnly: true,
  },
  durationSeconds: {
    section: 'media',
    label: 'duration (seconds)',
    readOnly: true,
    shouldHide: ({ mediaType }) => mediaType !== 'video',
  },
  frameRate: {
    section: 'media',
    label: 'frame rate (fps)',
    readOnly: true,
    shouldHide: ({ mediaType }) => mediaType !== 'video',
  },
  mediaWidth: {
    section: 'media',
    label: 'width (px)',
    readOnly: true,
    shouldHide: ({ mediaType }) => mediaType !== 'video',
  },
  mediaHeight: {
    section: 'media',
    label: 'height (px)',
    readOnly: true,
    shouldHide: ({ mediaType }) => mediaType !== 'video',
  },
  posterUrl: {
    section: 'media',
    label: 'poster url',
    note: 'Override automatically generated cover frame',
    shouldHide: ({ mediaType }) => mediaType !== 'video',
  },
  previewUrl: {
    section: 'media',
    label: 'preview url',
    note: 'Override generated autoplay preview clip',
    shouldHide: ({ mediaType }) => mediaType !== 'video',
  },
  transcodeStatus: {
    section: 'media',
    label: 'transcode status',
    readOnly: true,
    shouldHide: ({ mediaType }) => mediaType !== 'video',
  },
  transcodeError: {
    section: 'media',
    type: 'textarea',
    label: 'transcode error',
    readOnly: true,
    hideIfEmpty: true,
    shouldHide: ({ mediaType }) => mediaType !== 'video',
  },
  albums: {
    section: 'text',
    label: 'albums',
    excludeFromInsert: true,
  },
  subtitles: {
    section: 'subtitles',
    label: 'subtitles',
    excludeFromInsert: true,
    shouldHide: hideIfNotVideo,
  },
  visibility: {
    section: 'text',
    type: 'text',
    label: 'visibility',
    excludeFromInsert: true,
  },
  uploadOriginalFileName: {
    section: 'text',
    label: 'original file name',
    excludeFromInsert: true,
    hideModificationStatus: true,
    type: 'hidden',
  },
  excludeFromFeeds: {
    section: 'text',
    label: 'exclude from feeds',
    type: 'hidden',
  },
  hidden: {
    section: 'text',
    label: 'hidden',
    type: 'hidden',
  },
  favorite: {
    section: 'text',
    label: 'favorite',
    type: 'checkbox',
    excludeFromInsert: true,
  },
  make: {
    section: 'exif',
    label: 'camera make',
    shouldHide: hideIfVideo,
  },
  model: {
    section: 'exif',
    label: 'camera model',
    shouldHide: hideIfVideo,
  },
  film: {
    section: 'exif',
    label: 'film',
    note: 'Intended for Fujifilm cameras and analog scans',
    noteShort: 'Fujifilm cameras / analog scans',
    tagOptions: filmOptions,
    tagOptionsLimit: 1,
    shouldNotOverwriteWithNullDataOnSync: true,
    shouldHide: hideIfVideo,
  },
  recipeTitle: {
    section: 'exif',
    label: 'recipe title',
    tagOptions: recipeOptions,
    tagOptionsLimit: 1,
    spellCheck: false,
    capitalize: false,
    shouldHide: ({ make, mediaType }) =>
      mediaType === 'video' || make !== MAKE_FUJIFILM,
  },
  applyRecipeTitleGlobally: {
    section: 'exif',
    label: 'apply recipe title globally',
    type: 'checkbox',
    excludeFromInsert: true,
    hideModificationStatus: true,
    shouldHide: ({ make, mediaType, recipeTitle, recipeData }, changedFormKeys) =>
      !(
        mediaType !== 'video' &&
        make === MAKE_FUJIFILM &&
        recipeData &&
        recipeTitle &&
        changedFormKeys?.includes('recipeTitle')
      ),
  },
  recipeData: {
    section: 'exif',
    type: 'textarea',
    label: 'recipe data',
    spellCheck: false,
    capitalize: false,
    shouldHide: ({ make, mediaType }) =>
      mediaType === 'video' || make !== MAKE_FUJIFILM,
    shouldNotOverwriteWithNullDataOnSync: true,
    isJson: true,
    validate: value => {
      let validationMessage = undefined;
      if (value) {
        try {
          JSON.parse(value);
        } catch {
          validationMessage = 'Invalid JSON';
        }
      }
      return validationMessage;
    },
  },
  focalLength: {
    section: 'exif',
    label: 'focal length',
    shouldHide: hideIfVideo,
  },
  focalLengthIn35MmFormat: {
    section: 'exif',
    label: 'focal length 35mm-equivalent',
    shouldHide: hideIfVideo,
  },
  lensMake: {
    section: 'exif',
    label: 'lens make',
    shouldHide: hideIfVideo,
  },
  lensModel: {
    section: 'exif',
    label: 'lens model',
    shouldHide: hideIfVideo,
  },
  fNumber: {
    section: 'exif',
    label: 'aperture',
    shouldHide: hideIfVideo,
  },
  iso: {
    section: 'exif',
    label: 'ISO',
    shouldHide: hideIfVideo,
  },
  exposureTime: {
    section: 'exif',
    label: 'exposure time',
    shouldHide: hideIfVideo,
  },
  exposureCompensation: {
    section: 'exif',
    label: 'exposure compensation',
    shouldHide: hideIfVideo,
  },
  locationName: {
    section: 'exif',
    label: 'location name',
    shouldHide: () => true,
  },
  latitude: {
    section: 'exif',
    label: 'latitude',
    shouldHide: hideIfVideo,
  },
  longitude: {
    section: 'exif',
    label: 'longitude',
    shouldHide: hideIfVideo,
  },
  takenAt: {
    section: 'exif',
    label: 'taken at',
    validate: validationMessagePostgresDateString,
  },
  takenAtNaive: {
    section: 'exif',
    label: 'taken at (naive)',
    validate: validationMessageNaivePostgresDateString,
  },
  id: {
    section: 'storage',
    label: 'id',
    readOnly: true,
    hideIfEmpty: true,
  },
  url: {
    section: 'storage',
    label: 'storage url',
    readOnly: true,
  },
  extension: {
    section: 'storage',
    label: 'extension',
    readOnly: true,
  },
  blurData: {
    section: 'storage',
    label: 'blur data',
    readOnly: true,
    shouldHide: hideIfVideo,
  },
  aspectRatio: {
    section: 'storage',
    label: 'aspect ratio',
    readOnly: true,
  },
  priorityOrder: {
    section: 'misc',
    label: 'priority order',
    shouldHide: () => true,
  },
  colorData: {
    section: 'misc',
    type: 'textarea',
    label: 'color data',
    isJson: true,
    shouldHide: ({ mediaType }) => mediaType === 'video' || !COLOR_SORT_ENABLED,
  },
  colorSort: {
    section: 'misc',
    label: 'color sort',
    shouldHide: ({ mediaType }) => mediaType === 'video' || !COLOR_SORT_ENABLED,
  },
  shouldStripGpsData: {
    section: 'misc',
    label: 'strip gps data',
    type: 'hidden',
    excludeFromInsert: true,
    staticValue: shouldStripGpsData ? 'true' : 'false',
  },
});

export const FIELDS_WITH_JSON = Object.entries(FORM_METADATA())
  .filter(([_, meta]) => meta.isJson)
  .map(([key]) => key as keyof MediaFormData);

export const FIELDS_TO_NOT_OVERWRITE_WITH_NULL_DATA_ON_SYNC =
  Object.entries(FORM_METADATA())
    .filter(([_, meta]) => meta.shouldNotOverwriteWithNullDataOnSync)
    .map(([key]) => key as keyof MediaFormData);

export const FORM_METADATA_ENTRIES = (
  ...args: Parameters<typeof FORM_METADATA>
) =>
  (Object.entries(FORM_METADATA(...args)) as [keyof MediaFormData, FormMeta][]);

export const FORM_METADATA_ENTRIES_BY_SECTION = (
  ...args: Parameters<typeof FORM_METADATA>
) => {
  const fields = (Object
    .entries(FORM_METADATA(...args)) as [keyof MediaFormData, FormMeta][]);
  return fields.reduce((acc, field) => {
    const section = acc.find(s => s.section === field[1].section);
    if (section) {
      section.fields.push(field);
    } else {
      acc.push({ section: field[1].section, fields: [field] });
    }
    return acc;
  }, [] as {
    section: string
    fields: [keyof MediaFormData, FormMeta][]
  }[]);
};

export const FORM_SECTIONS = FORM_METADATA_ENTRIES_BY_SECTION()
  .map(section => section.section);

export const convertFormKeysToLabels = (keys: (keyof MediaFormData)[]) =>
  keys.map(key => FORM_METADATA()[key].label.toUpperCase());

export const getFormErrors = (
  formData: Partial<MediaFormData>,
): Partial<Record<keyof MediaFormData, string>> =>
  Object.keys(formData).reduce((acc, key) => ({
    ...acc,
    [key]: FORM_METADATA_ENTRIES().find(([k]) => k === key)?.[1]
      .validate?.(formData[key as keyof MediaFormData]),
  }), {});

export const isFormValid = (formData: Partial<MediaFormData>) =>
  FORM_METADATA_ENTRIES().every(
    ([key, { required, validate, validateStringMaxLength }]) =>
      (!required || Boolean(formData[key])) &&
      (!validate?.(formData[key])) &&
      // eslint-disable-next-line max-len
      (!validateStringMaxLength || (formData[key]?.length ?? 0) <= validateStringMaxLength),
  );

export const formHasExistingAiTextContent = ({
  title,
  caption,
  tags,
  categories,
  semanticDescription,
}: Partial<MediaFormData> = {}) =>
  Boolean(title || caption || tags || categories || semanticDescription);

// CREATE FORM DATA: FROM MEDIA

export const convertMediaToFormData = (photo: Media): MediaFormData => {
  const valueForKey = (key: keyof Media, value: any) => {
    switch (key) {
      case 'tags':
        return (value ?? [])
          .filter((tag: string) => tag !== TAG_FAVS)
          .join(', ');
      case 'categories':
      case 'performers':
        return (value ?? []).join(', ');
      case 'contentType':
        return (value ?? []).join(', ');
      case 'transcodeStatus':
        return isVideoMedia(photo)
          ? (getDisplayTranscodeStatus(photo) ?? photo.transcodeStatus ?? 'ready')
          : '';
      case 'takenAt':
        return value?.toISOString ? value.toISOString() : value;
      case 'hidden':
        return value ? 'true' : 'false';
      case 'recipeData':
        return JSON.stringify(value);
      case 'colorData':
        return JSON.stringify(value);
      default:
        return value !== undefined && value !== null
          ? value.toString()
          : undefined;
    }
  };
  return Object.entries(photo).reduce((photoForm, [key, value]) => ({
    ...photoForm,
    [key]: valueForKey(key as keyof Media, value),
  }), {
    favorite: photo.tags.includes(TAG_FAVS) ? 'true' : 'false',
  } as MediaFormData);
};

// PREPARE FORM FOR DB INSERT

export const convertFormDataToMediaDbInsert = (
  formData: FormData | Partial<MediaFormData>,
): MediaDbInsert => {
  const photoForm = formData instanceof FormData
    ? Object.fromEntries(formData) as MediaFormData
    : formData;

  // Capture tags before 'favorite' is excluded from insert
  const tags = (convertStringToArray(photoForm.tags) ?? [])
    .map(tag => tag?.trim() || undefined)
    .filter((tag): tag is string => Boolean(tag));
  const categories = (convertStringToArray(photoForm.categories, false) ?? [])
    .map(category => category?.trim() || undefined)
    .filter((category): category is string => Boolean(category));
  const performers = (convertStringToArray(photoForm.performers, false) ?? [])
    .map(performer => performer?.trim() || undefined)
    .filter((performer): performer is string => Boolean(performer));
  const contentTypes = (convertStringToArray(photoForm.contentType, false) ?? [])
    .map(contentType => contentType?.trim() || undefined)
    .filter((contentType): contentType is string => Boolean(contentType));
  if (photoForm.favorite === 'true') {
    tags.push(TAG_FAVS);
  }

  // Parse FormData:
  // - remove server action ID
  // - remove empty strings
  // - remove fields excluded from insert
  // - trim strings
  Object.keys(photoForm).forEach(key => {
    const meta = FORM_METADATA()[key as keyof MediaFormData];
    if (
      key.startsWith('$ACTION_ID_') ||
      (photoForm as any)[key] === '' ||
      meta?.excludeFromInsert
    ) {
      delete (photoForm as any)[key];
    } else if (typeof (photoForm as any)[key] === 'string') {
      (photoForm as any)[key] = (photoForm as any)[key].trim();
    }
  });

  return {
    ...(photoForm as MediaFormData & {
      film?: FujifilmSimulation
      recipeData?: FujifilmRecipe
    }),
    ...!photoForm.id && { id: generateMediaNanoid() },
    // Delete array field when empty
    tags: tags.length > 0 ? tags : undefined,
    categories: categories.length > 0 ? categories : undefined,
    performers: performers.length > 0 ? performers : undefined,
    contentType: contentTypes.length > 0 ? contentTypes : undefined,
    ...photoForm.recipeTitle && {
      recipeTitle: parameterize(photoForm.recipeTitle),
    },
    // Convert form strings to numbers
    aspectRatio: photoForm.aspectRatio
      ? roundToNumber(parseAspectRatio(photoForm.aspectRatio), 6)
      : DEFAULT_ASPECT_RATIO,
    mediaType: MEDIA_TYPES.includes(photoForm.mediaType as MediaType)
      ? photoForm.mediaType as MediaType
      : 'photo',
    studio: photoForm.studio || undefined,
    rating: undefined,
    watched: photoForm.watched === 'true',
    durationSeconds: photoForm.durationSeconds
      ? parseFloat(photoForm.durationSeconds)
      : undefined,
    frameRate: photoForm.frameRate
      ? parseFloat(photoForm.frameRate)
      : undefined,
    mediaWidth: photoForm.mediaWidth
      ? parseInt(photoForm.mediaWidth)
      : undefined,
    mediaHeight: photoForm.mediaHeight
      ? parseInt(photoForm.mediaHeight)
      : undefined,
    posterUrl: photoForm.posterUrl || undefined,
    previewUrl: photoForm.previewUrl || undefined,
    transcodeStatus: photoForm.transcodeStatus &&
      TRANSCODE_STATUSES.includes(photoForm.transcodeStatus as any)
      ? photoForm.transcodeStatus as MediaDbInsert['transcodeStatus']
      : undefined,
    transcodeError: photoForm.transcodeError || undefined,
    focalLength: photoForm.focalLength
      ? parseInt(photoForm.focalLength)
      : undefined,
    focalLengthIn35MmFormat: photoForm.focalLengthIn35MmFormat
      ? parseInt(photoForm.focalLengthIn35MmFormat)
      : undefined,
    fNumber: photoForm.fNumber
      ? parseFloat(photoForm.fNumber)
      : undefined,
    latitude: photoForm.latitude
      ? parseFloat(photoForm.latitude)
      : undefined,
    longitude: photoForm.longitude
      ? parseFloat(photoForm.longitude)
      : undefined,
    iso: photoForm.iso
      ? parseInt(photoForm.iso)
      : undefined,
    exposureTime: photoForm.exposureTime
      ? parseFloat(photoForm.exposureTime)
      : undefined,
    exposureCompensation: photoForm.exposureCompensation
      ? parseFloat(photoForm.exposureCompensation)
      : undefined,
    colorSort: photoForm.colorSort
      ? parseInt(photoForm.colorSort)
      : undefined,
    priorityOrder: undefined,
    excludeFromFeeds: photoForm.excludeFromFeeds === 'true',
    hidden: photoForm.hidden === 'true',
    ...(photoForm.mediaType !== 'video' && {
      studio: undefined,
      performers: undefined,
      contentType: undefined,
      watched: undefined,
      durationSeconds: undefined,
      frameRate: undefined,
      mediaWidth: undefined,
      mediaHeight: undefined,
      posterUrl: undefined,
      previewUrl: undefined,
      transcodeStatus: undefined,
      transcodeError: undefined,
    }),
    ...generateTakenAtFields(photoForm),
  };
};

export const getChangedFormFields = (
  original: Partial<MediaFormData>,
  current: Partial<MediaFormData>,
) => {
  return Object
    .keys(current)
    .filter(key =>
      (original[key as keyof MediaFormData] ?? '') !==
      (current[key as keyof MediaFormData] ?? ''),
    ) as (keyof MediaFormData)[];
};

export const generateTakenAtFields = (
  form?: Partial<MediaFormData>,
): { takenAt: string, takenAtNaive: string } => ({
  takenAt: form?.takenAt || generateLocalPostgresString(),
  takenAtNaive: form?.takenAtNaive || generateLocalNaivePostgresString(),
});
