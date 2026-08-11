'use client';

import { useRef, RefObject } from 'react';
import { pngToJpegWithExif, jpgToJpegWithExif } from '@/utility/exif-client';
import { clsx } from 'clsx/lite';
import {
  ACCEPTED_MEDIA_FILE_TYPES,
  ACCEPTED_VIDEO_FILE_TYPES,
  MediaType,
} from '@/media';
import { FiUploadCloud } from 'react-icons/fi';
import { MAX_IMAGE_SIZE } from '@/platforms/next-image';
import ProgressButton from './primitives/ProgressButton';
import { useAppState } from '@/app/AppState';
import { useAppText } from '@/i18n/state/client';

const createClientUploadId = (index: number, fileName: string) =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}-${fileName}`;

const MAX_CONCURRENT_BLOB_PREPARATION = 3;

const runWithConcurrency = async (
  jobs: Array<() => Promise<void>>,
  maxConcurrency: number,
) => {
  const concurrency = Math.max(1, Math.min(maxConcurrency, jobs.length));
  let nextIndex = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (nextIndex < jobs.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const job = jobs[currentIndex];
      if (job) {
        await job();
      }
    }
  });
  await Promise.all(workers);
};

export default function MediaInput({
  ref: inputRefExternal,
  id = 'file',
  onStart,
  onFilesSelected,
  onBlobReady,
  shouldResize,
  maxSize = MAX_IMAGE_SIZE,
  quality = 0.9,
  showButton,
  disabled: disabledProp,
  debug: _debug,
}: {
  ref?: RefObject<HTMLInputElement | null>
  id?: string
  onStart?: () => void
  onFilesSelected?: (files: {
    id: string
    file: File
    previewUrl: string
  }[]) => void
  onBlobReady?: (args: {
    blob: Blob
    clientUploadId: string
    extension?: string
    hasMultipleUploads?: boolean
    mediaType: MediaType
    originalFileName: string
  }) => Promise<any> | void
  shouldResize?: boolean
  maxSize?: number
  quality?: number
  showButton?: boolean
  disabled?: boolean
  debug?: boolean
}) {
  const inputRefInternal = useRef<HTMLInputElement>(null);

  const inputRef = inputRefExternal ?? inputRefInternal;

  const {
    uploadState: {
      isUploading,
      filesLength,
      fileUploadIndex,
    },
    setUploadState,
    resetUploadState,
  } = useAppState();
  
  const appText = useAppText();

  const disabled = Boolean(disabledProp);

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="flex items-center gap-2 sm:gap-4">
        <label
          htmlFor={id}
          className={clsx(
            'shrink-0 select-none text-main',
            // Undo standard label styles since
            // content is shown as button
            'font-normal tracking-normal',
            disabled && 'pointer-events-none cursor-not-allowed',
          )}
        >
          {showButton &&
            <ProgressButton
              type="button"
              isLoading={false}
              progress={filesLength > 1
                ? (fileUploadIndex + 1) / filesLength * 0.95
                : undefined}
              icon={<FiUploadCloud
                size={18}
                className="translate-x-[-0.5px] translate-y-[0.5px]"
              />}
              aria-disabled={disabled}
              onClick={() => inputRef.current?.click()}
              hideText="never"
              primary
            >
              {isUploading
                ? filesLength > 1
                  ? appText.utility.paginateAction(
                    fileUploadIndex + 1,
                    filesLength,
                    appText.admin.uploading,
                  )
                  : appText.admin.uploading
                : appText.admin.uploadMedia}
            </ProgressButton>}
          <input
            ref={inputRef}
            id={id}
            type="file"
            className="hidden!"
            accept={ACCEPTED_MEDIA_FILE_TYPES.join(',')}
            disabled={disabled}
            multiple
            onChange={async e => {
              onStart?.();
              const { files } = e.currentTarget;
              if (files && files.length > 0) {
                const selectedFiles = Array.from(files).map((file, index) => {
                  const id = createClientUploadId(index, file.name);
                  return {
                    id,
                    file,
                    previewUrl: `client-upload:${id}`,
                  };
                });
                onFilesSelected?.(selectedFiles);
                setUploadState?.({ filesLength: files.length });
                const jobs = selectedFiles.map(({ file, id: clientUploadId }) =>
                  async () => {
                    const normalizedMime = file.type?.toLowerCase() ?? '';
                    const inputExtension = file.name
                      .split('.')
                      .pop()?.toLowerCase();
                    const isVideoByMime =
                      normalizedMime.startsWith('video/') ||
                      ACCEPTED_VIDEO_FILE_TYPES.some(type => type === normalizedMime);
                    const isVideoByExtension = [
                      'mp4', 'mkv', 'mov', 'm4v', 'webm', 'avi', 'ts',
                      'm2ts', 'mts', 'mpg', 'mpeg', 'wmv', 'flv', '3gp', 'ogv',
                    ]
                      .includes((inputExtension ?? '').toLowerCase());
                    const mediaType: MediaType =
                      isVideoByMime || isVideoByExtension
                        ? 'video'
                        : 'photo';
                    const isInputPng = inputExtension === 'png';

                    const outputExtension = (shouldResize && mediaType === 'photo')
                      ? 'jpeg'
                      : inputExtension;

                    const callbackArgs = {
                      extension: outputExtension,
                      clientUploadId,
                      hasMultipleUploads: files.length > 1,
                      mediaType,
                      originalFileName: file.name,
                    };

                    let blob: Blob | File = file;

                    if (shouldResize && mediaType === 'photo') {
                      if (isInputPng) {
                        // Use specialized PNG <> JPEG converter
                        // for EXIF preservation
                        blob = await pngToJpegWithExif(
                          file,
                          { maxSize, quality },
                        ).catch(() => file);
                      } else {
                        // Use specialized JPG <> JPEG converter
                        // for EXIF preservation
                        blob = await jpgToJpegWithExif(
                          file,
                          { maxSize, quality },
                        ).catch(() => file);
                      }
                    } else if (
                      mediaType === 'video' &&
                      !isVideoByMime
                    ) {
                      // Warn if unsupported type detected
                      console.warn(
                        `Uploading video with non-whitelisted MIME type: ${file.type}`,
                      );
                    }

                    void Promise.resolve()
                      .then(() => onBlobReady?.({
                        ...callbackArgs,
                        blob,
                      }))
                      .catch(error => {
                        console.error('Failed to start client upload', error);
                      });
                  });
                await runWithConcurrency(jobs, MAX_CONCURRENT_BLOB_PREPARATION);
              } else {
                resetUploadState?.();
              }
            }}
          />
        </label>
      </div>
    </div>
  );
}
