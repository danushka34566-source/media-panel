import {
  deleteFile,
  deleteFilesWithPrefix,
  getCurrentStorageUrlsForPrefix,
  getFileNamePartsFromStorageUrl,
} from '@/platforms/storage';
import { getStorageUrlsForMedia } from './storage';
import { convertFormDataToMediaDbInsert } from '@/media/form';
import {
  FujifilmSimulation,
  getFujifilmSimulationFromMakerNote,
} from '@/platforms/fujifilm/simulation';
import { ExifData, ExifParserFactory } from 'ts-exif-parser';
import { MediaFormData } from './form';
import sharp, { Sharp } from 'sharp';
import {
  GEO_PRIVACY_ENABLED,
  PRESERVE_ORIGINAL_UPLOADS,
} from '@/app/config';
import { isExifForFujifilm } from '@/platforms/fujifilm/server';
import {
  FujifilmRecipe,
  getFujifilmRecipeFromMakerNote,
} from '@/platforms/fujifilm/recipe';
import {
  deleteMedia,
  getRecipeTitleForData,
  updateAllMatchingRecipeTitles,
} from '@/media/query';
import type { Media } from '.';
import { MediaDbInsert } from '.';
import { convertExifToFormData } from './form/server';
import { getColorFieldsForMediaForm } from './color/server';
import exifr from 'exifr';
import { getCompatibleExifValue } from '@/utility/exif';

const IMAGE_WIDTH_BLUR = 200;
const IMAGE_WIDTH_DEFAULT = 200;
const IMAGE_QUALITY_DEFAULT = 80;
const VIDEO_FILE_EXTENSIONS = [
  'mp4', 'mkv', 'mov', 'm4v', 'webm', 'avi', 'ts', 'm2ts', 'mts',
  'mpg', 'mpeg', 'wmv', 'flv', '3gp', 'ogv',
];
const VIDEO_INLINE_METADATA_MAX_BYTES = 250 * 1024 * 1024;

const getRemoteContentLength = async (url: string) =>
  fetch(url, {
    method: 'HEAD',
    cache: 'no-store',
  })
    .then(response => {
      const contentLength = response.headers.get('content-length');
      return contentLength ? Number(contentLength) : undefined;
    })
    .catch(() => undefined);

export const extractImageDataFromBlobPath = async (
  blobPath: string, {
    includeInitialMediaFields,
    generateBlurData,
    generateResizedImage,
    updateColorFields = true,
  }: {
    includeInitialMediaFields?: boolean
    generateBlurData?: boolean
    generateResizedImage?: boolean
    updateColorFields?: boolean
  } = {},
): Promise<{
  blobId?: string
  formDataFromExif?: Partial<MediaFormData>
  imageResizedBase64?: string
  shouldStripGpsData?: boolean
  fileBytes?: ArrayBuffer
  error?: string
}> => {
  const url = decodeURIComponent(blobPath);

  const {
    fileExtension: extension,
    fileId: blobId,
    fileName,
    fileNameBase,
  } = getFileNamePartsFromStorageUrl(url);
  const derivedOriginalBase = fileNameBase
    ? fileNameBase
    : undefined;
  const derivedOriginalFileName = derivedOriginalBase
    ? `${derivedOriginalBase}${extension ? `.${extension}` : ''}`
    : fileName;
  const derivedOriginalTitle = derivedOriginalBase
    ? derivedOriginalBase
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    : undefined;
  const isVideo = extension
    ? VIDEO_FILE_EXTENSIONS.includes(extension.toLowerCase())
    : false;

  let dataExif: ExifData | undefined;
  let dataExifr: any | undefined;
  let film: FujifilmSimulation | undefined;
  let recipe: FujifilmRecipe | undefined;
  let blurData: string | undefined;
  let imageResizedBase64: string | undefined;
  let shouldStripGpsData = false;
  let error: string | undefined;

  const videoContentLength = isVideo
    ? await getRemoteContentLength(url)
    : undefined;
  const shouldSkipVideoInlineMetadata =
    isVideo &&
    typeof videoContentLength === 'number' &&
    videoContentLength > VIDEO_INLINE_METADATA_MAX_BYTES;

  if (shouldSkipVideoInlineMetadata) {
    error = 'Video is too large for inline metadata generation';
  }

  const fileBytes = blobPath && !shouldSkipVideoInlineMetadata
    ? await fetch(url, { cache: 'no-store' }).then(res => res.arrayBuffer())
      .catch(e => {
        error = `Error fetching image from ${url}: "${e.message}"`;
        return undefined;
      })
    : undefined;

  try {
    if (fileBytes && !isVideo) {
      const parser = ExifParserFactory.create(Buffer.from(fileBytes));

      // Data for form
      parser.enableBinaryFields(false);
      dataExif = parser.parse();
      dataExifr = await exifr.parse(fileBytes, { xmp: true });

      // Capture film simulation for Fujifilm cameras
      if (isExifForFujifilm(dataExif)) {
        // Parse exif data again with binary fields
        // in order to access MakerNote tag
        parser.enableBinaryFields(true);
        const exifDataBinary = parser.parse();
        const makerNote = exifDataBinary.tags?.MakerNote;
        if (Buffer.isBuffer(makerNote)) {
          film = getFujifilmSimulationFromMakerNote(makerNote);
          recipe = getFujifilmRecipeFromMakerNote(makerNote);
        }
      }

      if (generateBlurData) {
        blurData = await blurImage(fileBytes);
      }

      if (generateResizedImage) {
        imageResizedBase64 = await resizeImage(fileBytes);
      }

      shouldStripGpsData = GEO_PRIVACY_ENABLED && (
        Boolean(getCompatibleExifValue('GPSLatitude', dataExif, dataExifr)) ||
        Boolean(getCompatibleExifValue('GPSLongitude', dataExif, dataExifr))
      );
    }
  } catch (e) {
    error = `Error extracting image data from ${url}: "${e}"`;
  }

  if (error) { console.log(error); }

  const colorFields = updateColorFields && !isVideo
    ? await getColorFieldsForMediaForm(url)
    : undefined;

  const baseFormFields = includeInitialMediaFields
    ? {
      hidden: 'false',
      favorite: 'false',
      extension,
      url,
    }
    : undefined;

  let formDataFromExif: Partial<MediaFormData> | undefined;
  if (dataExif) {
    formDataFromExif = {
      ...baseFormFields,
      ...generateBlurData && { blurData },
      ...convertExifToFormData(dataExif, dataExifr, film, recipe),
      ...colorFields,
    };
  } else if (baseFormFields) {
    formDataFromExif = {
      ...baseFormFields,
      ...colorFields,
    };
  }

  if (!formDataFromExif) {
    const fallback: Partial<MediaFormData> = {};
    if (extension) {
      fallback.extension = extension;
    }
    if (derivedOriginalFileName) {
      fallback.uploadOriginalFileName = derivedOriginalFileName;
    }
    if (derivedOriginalTitle) {
      fallback.title = derivedOriginalTitle;
    }
    if (isVideo) {
      fallback.mediaType = 'video';
    }
    if (Object.keys(fallback).length > 0) {
      formDataFromExif = fallback;
    }
  }

  if (formDataFromExif) {
    if (isVideo && !formDataFromExif.mediaType) {
      formDataFromExif.mediaType = 'video';
    }
    if (!formDataFromExif.extension && extension) {
      formDataFromExif.extension = extension;
    }
    if (derivedOriginalFileName) {
      formDataFromExif.uploadOriginalFileName = derivedOriginalFileName;
    }
    if (!formDataFromExif.title && derivedOriginalTitle) {
      formDataFromExif.title = derivedOriginalTitle;
    }
  }

  return {
    blobId,
    ...formDataFromExif && { formDataFromExif },
    imageResizedBase64,
    shouldStripGpsData,
    fileBytes,
    error,
  };
};

const generateBase64 = async (
  image: ArrayBuffer,
  middleware?: (sharp: Sharp) => Sharp,
) => 
  (middleware ? middleware(sharp(image)) : sharp(image))
    .withMetadata()
    .toFormat('jpeg', { quality: IMAGE_QUALITY_DEFAULT })
    .toBuffer()
    .then(data => `data:image/jpeg;base64,${data.toString('base64')}`);

const resizeImage = async (
  image: ArrayBuffer,
  width = IMAGE_WIDTH_DEFAULT,
) => 
  generateBase64(image, sharp => sharp
    .resize(width),
  );

const blurImage = async (image: ArrayBuffer) => 
  generateBase64(image, sharp => sharp
    .resize(IMAGE_WIDTH_BLUR)
    .modulate({ saturation: 1.15 })
    .blur(4),
  );

export const getImageBase64FromUrl = async (url: string) => 
  fetch(decodeURIComponent(url))
    .then(res => res.arrayBuffer())
    .then(buffer => generateBase64(buffer))
    .catch(e => {
      console.log(`Error getting image base64 from URL (${url})`, e);
      return '';
    });

export const resizeImageFromUrl = async (
  url: string,
  width?: number,
) => 
  fetch(decodeURIComponent(url))
    .then(res => res.arrayBuffer())
    .then(buffer => resizeImage(buffer, width))
    .catch(e => {
      console.log(`Error resizing image from URL (${url})`, e);
      return '';
    });

export const blurImageFromUrl = async (url: string) => 
  fetch(decodeURIComponent(url))
    .then(res => res.arrayBuffer())
    .then(buffer => blurImage(buffer))
    .catch(e => {
      console.log(`Error blurring image from URL (${url})`, e);
      return '';
    });

export const resizeImageToBytes = async (
  image: ArrayBuffer,
  width: number,
  quality = IMAGE_QUALITY_DEFAULT,
) => 
  sharp(image)
    .resize(width)
    .toFormat('jpeg', { quality })
    .toBuffer();

const GPS_NULL_STRING = '-';

export const removeGpsData = async (image: ArrayBuffer) =>
  sharp(image)
    .withExifMerge({
      IFD3: {
        GPSMapDatum: GPS_NULL_STRING,
        GPSLatitude: GPS_NULL_STRING,
        GPSLongitude: GPS_NULL_STRING,
        GPSDateStamp: GPS_NULL_STRING,
        GPSDateTime: GPS_NULL_STRING,
        GPSTimeStamp: GPS_NULL_STRING,
        GPSAltitude: GPS_NULL_STRING,
        GPSSatellites: GPS_NULL_STRING,
        GPSAreaInformation: GPS_NULL_STRING,
        GPSSpeed: GPS_NULL_STRING,
        GPSImgDirection: GPS_NULL_STRING,
        GPSDestLatitude: GPS_NULL_STRING,
        GPSDestLongitude: GPS_NULL_STRING,
        GPSDestBearing: GPS_NULL_STRING,
        GPSDestDistance: GPS_NULL_STRING,
        GPSHPositioningError: GPS_NULL_STRING,
      },
    })
    .toFormat('jpeg', { quality: PRESERVE_ORIGINAL_UPLOADS ? 95 : 80 })
    .toBuffer();

export const convertFormDataToMediaDbInsertAndLookupRecipeTitle =
  async (...args: Parameters<typeof convertFormDataToMediaDbInsert>):
  Promise<ReturnType<typeof convertFormDataToMediaDbInsert>> => {
    const photo = convertFormDataToMediaDbInsert(...args);

    if (photo.recipeData && !photo.recipeTitle && photo.film) {
      const recipeTitle = await getRecipeTitleForData(
        photo.recipeData,
        photo.film,
      );
      // Only replace recipe title when a new one is found
      if (recipeTitle) {
        photo.recipeTitle = recipeTitle;
      }
    }

    return photo;
  };

export const propagateRecipeTitleIfNecessary = async (
  formData: FormData,
  photo: MediaDbInsert,
) => {
  if (
    formData.get('applyRecipeTitleGlobally') === 'true' &&
    // Only propagate recipe title if set by user before lookup
    formData.get('recipeTitle') &&
    photo.recipeTitle &&
    photo.recipeData &&
    photo.film
  ) {
    await updateAllMatchingRecipeTitles(
      photo.recipeTitle,
      photo.recipeData,
      photo.film,
    );
  }
};

export const deleteMediaAndFiles = async (
  photoId: string,
  photoUrl: string,
  photoPosterUrl?: string | null,
  photoPreviewUrl?: string | null,
) => {
  const { fileNameBase } = getFileNamePartsFromStorageUrl(photoUrl);
  const relatedUrls = await getStorageUrlsForMedia({
    url: photoUrl,
    posterUrl: photoPosterUrl ?? undefined,
    previewUrl: photoPreviewUrl ?? undefined,
  } as Media).catch(() => []);

  const urlsToDelete = Array.from(new Set([
    photoUrl,
    photoPosterUrl ?? undefined,
    photoPreviewUrl ?? undefined,
    ...relatedUrls.map(({ url }) => url),
  ].filter((url): url is string => Boolean(url))));

  await deleteMedia(photoId);

  if (urlsToDelete.length > 0) {
    await Promise.all(urlsToDelete.map(url => deleteFile(url)));
  }

  if (fileNameBase) {
    await deleteFilesWithPrefix(fileNameBase);
    const remainingAfterPrefixDelete = await getCurrentStorageUrlsForPrefix(fileNameBase)
      .catch(() => []);
    if (remainingAfterPrefixDelete.length > 0) {
      await Promise.all(remainingAfterPrefixDelete.map(({ url }) => deleteFile(url)));
      const remainingAfterRetry = await getCurrentStorageUrlsForPrefix(fileNameBase)
        .catch(() => []);
      if (remainingAfterRetry.length > 0) {
        throw new Error(
          `Storage cleanup incomplete for ${fileNameBase}: ` +
          `${remainingAfterRetry.length} file(s) still remain`,
        );
      }
    }
  }
};
