import AppGrid from '@/components/AppGrid';
import AdminProcessingTable, {
  type RegistrationItem,
} from '@/admin/AdminProcessingTable';
import {
  getUnregisteredStorageUploads,
  getUnregisteredStorageUploadsCount,
} from '@/admin/processing/server';
import {
  getPendingMediaProcessing,
  getPendingMediaProcessingCount,
} from '@/media/query';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PROCESSING_PAGE_SIZE = 15;

const getPageNumber = (page?: string | string[]) => {
  const value = Array.isArray(page) ? page[0] : page;
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const registrationRowToStatus = (
  upload: Awaited<ReturnType<typeof getUnregisteredStorageUploads>>[number],
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
  const registrationPage = getPageNumber(params.registrationPage);
  const processingPage = getPageNumber(params.processingPage);
  const [
    registrationUploads,
    registrationTotal,
    videoProcessingUploads,
    processingTotal,
  ] = await Promise.all([
    getUnregisteredStorageUploads(
      PROCESSING_PAGE_SIZE,
      (registrationPage - 1) * PROCESSING_PAGE_SIZE,
    ).catch(() => []),
    getUnregisteredStorageUploadsCount().catch(() => 0),
    getPendingMediaProcessing(
      PROCESSING_PAGE_SIZE,
      (processingPage - 1) * PROCESSING_PAGE_SIZE,
    )
      .catch(() => []),
    getPendingMediaProcessingCount().catch(() => 0),
  ]);

  const registeringUrls = registrationUploads.map(registrationRowToStatus);

  return (
    <AppGrid
      contentMain={
        <AdminProcessingTable
          registering={registeringUrls}
          registeringTotal={registrationTotal}
          registrationPage={registrationPage}
          processing={videoProcessingUploads}
          processingTotal={processingTotal}
          processingPage={processingPage}
        />
      }
    />
  );
}
