'use client';

import AdminTable from './AdminTable';
import { clsx } from 'clsx/lite';
import ResponsiveDate from '@/components/ResponsiveDate';
import { Media, getDisplayTranscodeStatus, titleForMedia } from '@/media';
import MediaSmall from '@/media/MediaSmall';
import Link from 'next/link';
import { pathForMedia } from '@/app/path';
import MediaDate from '@/media/MediaDate';
import AdminProcessingSyncButton from './AdminProcessingSyncButton';
import AdminRegistrationRetryButton from './AdminRegistrationRetryButton';
import AdminRegistrationDeleteButton from './AdminRegistrationDeleteButton';
import AdminRegistrationErrorButton from './AdminRegistrationErrorButton';
import { LuFileImage, LuFileVideo2, LuPlay } from 'react-icons/lu';
import { Fragment, useEffect, useRef, useTransition } from 'react';
import AdminPagination from './AdminPagination';
import { useRouter } from 'next/navigation';

const PROCESSING_PAGE_SIZE = 15;
export type RegistrationItem = {
  url: string
  sourceUrl?: string
  fileName: string
  originalFileName?: string
  extension?: string
  uploadedAt?: Date
  status: 'detected' | 'registering' | 'error' | 'failed'
  statusMessage: string
  errorMessage?: string
  title?: string
};

const statusBadgeClassName = (status: string) =>
  status === 'error' || status === 'failed' || status === 'missing'
    ? clsx(
      'bg-red-100 text-red-700',
      'dark:bg-red-950/50 dark:text-red-300',
    )
    : clsx(
      'bg-blue-100 text-blue-700',
      'dark:bg-blue-950/50 dark:text-blue-300',
    );

const getProcessingDiagnosticMessage = (photo: Media) => {
  if (photo.missingStorageError) { return photo.missingStorageError; }
  const message = photo.transcodeError?.trim();
  if (!message || /^queued for background processing\.?$/i.test(message)) {
    return undefined;
  }
  return message;
};

function RegistrationThumb({
  title,
  extension,
}: {
  title: string
  extension?: string
}) {
  const isVideoUpload = [
    'mp4', 'mkv', 'mov', 'm4v', 'webm', 'avi', 'ts', 'm2ts', 'mts',
    'mpg', 'mpeg', 'wmv', 'flv', '3gp', 'ogv',
  ]
    .includes((extension || '').toLowerCase());
  const isImageUpload = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'heif']
    .includes((extension || '').toLowerCase());

  return (
    <div
      className={clsx(
        'relative min-w-[50px] rounded-[3px] overflow-hidden border-main',
        'w-[50px] bg-black',
      )}
      style={{ aspectRatio: 16 / 9 }}
      title={title}
    >
      {isVideoUpload
        ? <div
          className={clsx(
            'absolute inset-0 flex items-center justify-center',
            'bg-black text-white',
          )}
        >
          <LuPlay size={16} className="drop-shadow" />
        </div>
        : <div
          className={clsx(
            'absolute inset-0 flex items-center justify-center',
            'bg-neutral-100 text-neutral-500',
            'dark:bg-neutral-900 dark:text-neutral-400',
          )}
        >
          {isImageUpload
            ? <LuFileImage size={16} />
            : <LuFileVideo2 size={16} />}
        </div>}
    </div>
  );
}

function RegisteringTable({
  items,
  total,
  page,
}: {
  items: RegistrationItem[]
  total: number
  page: number
}) {
  if (total === 0) {
    return <div className="text-sm text-dim">No files registering.</div>;
  }

  return (
    <div className="space-y-2">
      <AdminTable>
      {items.map(item => {
        const isErroredRegistration =
          item.status === 'error' || item.status === 'failed';
        const title = (
          item.title ||
          item.originalFileName ||
          item.fileName
        ).toLocaleUpperCase();
        return (
          <div
            key={item.url}
            className={clsx(
              'col-span-3 grid grid-cols-[auto_1fr] items-center',
              'gap-2 sm:gap-3',
            )}
          >
            <RegistrationThumb
              title={title}
              extension={item.extension}
            />
            <div
              className={clsx(
                'flex min-w-0 flex-col gap-0.5 lg:flex-row lg:items-start',
                'lg:gap-x-1',
              )}
            >
              <div className="min-w-0 flex flex-1 flex-col items-start gap-0.5">
                <div className="flex min-w-0 items-center gap-1.5 self-stretch">
                  <span className="block min-w-0 flex-1 truncate">
                    {title}
                  </span>
                  <span
                    className={clsx(
                      'shrink-0 rounded-sm px-[5px] py-[3px]',
                      'text-xs leading-none uppercase',
                      statusBadgeClassName(item.status),
                    )}
                  >
                    {item.status}
                  </span>
                </div>
              </div>
              <div
                className={clsx(
                  'flex min-w-0 gap-1.5 w-full',
                  'lg:w-auto lg:max-w-[30%] lg:shrink-0 uppercase text-dim',
                )}
              >
                {item.uploadedAt
                  ? <ResponsiveDate date={item.uploadedAt} className="truncate" />
                  : null}
              </div>
              {isErroredRegistration &&
                <div className="flex shrink-0 flex-nowrap items-center gap-2">
                  <AdminRegistrationErrorButton
                    title={title}
                    errorMessage={item.errorMessage || item.statusMessage}
                  />
                  <AdminRegistrationRetryButton
                    url={item.url}
                    sourceUrl={item.sourceUrl}
                    originalFileName={item.originalFileName}
                    title={item.title}
                  />
                  <AdminRegistrationDeleteButton
                    url={item.url}
                    sourceUrl={item.sourceUrl}
                  />
                </div>}
            </div>
          </div>
        );
      })}
      </AdminTable>
      <AdminPagination
        page={page}
        pageSize={PROCESSING_PAGE_SIZE}
        total={total}
        hrefForPage={nextPage => `/admin/processing?registrationPage=${nextPage}`}
      />
    </div>
  );
}

function ProcessingTable({
  items,
  total,
  page,
}: {
  items: Media[]
  total: number
  page: number
}) {
  if (total === 0) {
    return <div className="text-sm text-dim">No files processing.</div>;
  }

  return (
    <div className="space-y-2">
      <AdminTable>
      {items.map(photo => {
        const statusLabel = photo.missingStorageError
          ? 'missing'
          : getDisplayTranscodeStatus(photo);
        const statusMessage = getProcessingDiagnosticMessage(photo);
        const showProcessingDiagnostic = Boolean(
          statusMessage &&
          (statusLabel === 'failed' || statusLabel === 'missing'),
        );
        return (
          <Fragment key={photo.id}>
            <MediaSmall
              key={`${photo.id}-thumb`}
              photo={photo}
              thumbnailAspectRatio={16 / 9}
              enableVideoPreview={false}
            />
            <div
              key={`${photo.id}-main`}
              className={clsx(
                'flex min-w-0 flex-col gap-0.5 lg:flex-row lg:items-start',
                'lg:gap-x-1',
              )}
            >
              <div className="min-w-0 flex flex-1 flex-col items-start gap-0.5">
                <div className="flex min-w-0 items-center gap-1.5 self-stretch">
                  <span className="min-w-0 flex-1">
                    <Link
                      href={pathForMedia({ photo })}
                      prefetch={false}
                      className="block truncate"
                    >
                      {titleForMedia(photo, false)?.toLocaleUpperCase()}
                    </Link>
                  </span>
                  {statusLabel &&
                    <span
                      className={clsx(
                        'shrink-0 rounded-sm px-[5px] py-[3px]',
                        'text-xs leading-none uppercase',
                        statusBadgeClassName(statusLabel),
                      )}
                    >
                      {statusLabel}
                    </span>}
                </div>
              </div>
              <div
                className={clsx(
                  'flex min-w-0 gap-1.5 w-full',
                  'lg:w-auto lg:max-w-[30%] lg:shrink-0 uppercase text-dim',
                )}
              >
                <MediaDate
                  photo={photo}
                  dateType="createdAt"
                  className="truncate"
                  timezone={undefined}
                />
              </div>
            </div>
            <div
              key={`${photo.id}-actions`}
              className="flex min-h-6 min-w-6 shrink-0 flex-nowrap items-center justify-end gap-2"
            >
              {showProcessingDiagnostic && statusMessage && <AdminRegistrationErrorButton
                title={titleForMedia(photo, false) || photo.id}
                errorMessage={statusMessage}
                dialogTitle="Processing details"
              />}
              {!photo.missingStorageError &&
                <AdminProcessingSyncButton photo={photo} />}
            </div>
          </Fragment>
        );
      })}
      </AdminTable>
      <AdminPagination
        page={page}
        pageSize={PROCESSING_PAGE_SIZE}
        total={total}
        hrefForPage={nextPage => `/admin/processing?processingPage=${nextPage}`}
      />
    </div>
  );
}

export default function AdminProcessingTable({
  registering,
  registeringTotal,
  registrationPage,
  processing,
  processingTotal,
  processingPage,
}: {
  registering: RegistrationItem[]
  registeringTotal: number
  registrationPage: number
  processing: Media[]
  processingTotal: number
  processingPage: number
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const refreshInFlight = useRef(false);
  const hasRegisteringItems = registeringTotal > 0;

  useEffect(() => {
    if (!isRefreshing) { refreshInFlight.current = false; }
  }, [isRefreshing]);

  useEffect(() => {
    if (registeringTotal + processingTotal === 0) { return; }
    const refresh = () => {
      if (
        document.visibilityState === 'visible' &&
        !refreshInFlight.current
      ) {
        refreshInFlight.current = true;
        startRefresh(() => router.refresh());
      }
    };
    const interval = window.setInterval(refresh, 5_000);
    return () => window.clearInterval(interval);
  }, [processingTotal, registeringTotal, router]);

  return (
    <div className="space-y-4">
      {hasRegisteringItems && <>
        <div className="px-0.5 text-[10px] uppercase tracking-wide text-dim">
          Registering
        </div>
        <RegisteringTable
          items={registering}
          total={registeringTotal}
          page={registrationPage}
        />
        <div className="h-px w-full bg-medium" />
      </>}

      <div className="px-0.5 text-[10px] uppercase tracking-wide text-dim">
        Processing
      </div>
      <ProcessingTable
        items={processing}
        total={processingTotal}
        page={processingPage}
      />
    </div>
  );
}
