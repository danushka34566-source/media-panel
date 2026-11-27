import AppGrid from '@/components/AppGrid';
import { redirect } from 'next/navigation';
import { pathForProcessingPage } from '@/admin/processing/path';
import AdminProcessingTable, {
  type RegistrationItem,
} from '@/admin/AdminProcessingTable';
import { getAdminPageNumber } from '@/admin/pagination';
import {
  getUnregisteredStorageUploadsPage,
} from '@/admin/processing/server';
import {
  getPendingMediaProcessingCount,
  getPendingMediaProcessingPage,
} from '@/media/query';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PROCESSING_PAGE_SIZE = 15;

const getProcessingPage = async (page: number) => {
  const offset = (page - 1) * PROCESSING_PAGE_SIZE;
  const result = await getPendingMediaProcessingPage(PROCESSING_PAGE_SIZE, offset);
  if (offset === 0 || result.total > 0) { return result; }

  // The window count has no row to carry it past the end of the queue.
  const total = await getPendingMediaProcessingCount();
  return total > offset
    ? getPendingMediaProcessingPage(PROCESSING_PAGE_SIZE, offset)
    : { ...result, total };
};

const registrationRowToStatus = (
  upload: Awaited<ReturnType<typeof getUnregisteredStorageUploadsPage>>['uploads'][number],
): RegistrationItem => ({
  ...(upload.status !== 'detected' && upload.status !== 'registering'
    ? { status: 'error' as const }
    : { status: upload.status }),
  url: upload.url,
  sourceUrl: upload.sourceUrl,
  fileName: upload.fileName,
  originalFileName: upload.originalFileName,
  extension: upload.extension,
  uploadedAt: upload.uploadedAt,
  statusMessage: upload.status === 'registering'
    ? 'Registering in database'
    : upload.status === 'detected'
      ? 'Detected by worker'
      : upload.errorMessage || 'Registration failed',
  errorMessage: upload.errorMessage,
  title: upload.title,
});

export default async function AdminProcessingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams;
  const registrationPage = getAdminPageNumber(
    params.registrationPage,
    PROCESSING_PAGE_SIZE,
  );
  const processingPage = getAdminPageNumber(
    params.processingPage,
    PROCESSING_PAGE_SIZE,
  );
  const [
    registrationResult,
    processingResult,
  ] = await Promise.all([
    getUnregisteredStorageUploadsPage(
      PROCESSING_PAGE_SIZE,
      (registrationPage - 1) * PROCESSING_PAGE_SIZE,
    ).then(value => ({ value, failed: false as const }))
      .catch(() => ({ value: undefined, failed: true as const })),
    getProcessingPage(processingPage)
      .then(value => ({ value, failed: false as const }))
      .catch(() => ({ value: undefined, failed: true as const })),
  ]);
  const registrationData = registrationResult.value;
  const processingData = processingResult.value;

  // Either queue may shrink while visiting its last page.
  const lastValidPage = (page: number, total?: number) => total === undefined
    ? page
    : Math.min(page, Math.max(1, Math.ceil(total / PROCESSING_PAGE_SIZE)));
  const validRegistrationPage = lastValidPage(registrationPage, registrationData?.total);
  const validProcessingPage = lastValidPage(processingPage, processingData?.total);
  if (registrationPage !== validRegistrationPage || processingPage !== validProcessingPage) {
    redirect(pathForProcessingPage(validRegistrationPage, validProcessingPage));
  }

  const registeringUrls = registrationData?.uploads.map(registrationRowToStatus) ?? [];

  return (
    <AppGrid
      contentMain={
        <AdminProcessingTable
          registering={registeringUrls}
          registeringTotal={registrationData?.total ?? 0}
          registrationPage={registrationPage}
          registrationError={registrationResult.failed}
          processing={processingData?.items ?? []}
          processingTotal={processingData?.total ?? 0}
          processingPage={processingPage}
          processingError={processingResult.failed}
        />
      }
    />
  );
}
