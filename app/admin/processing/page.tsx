import AppGrid from '@/components/AppGrid';
import { redirect } from 'next/navigation';
import { pathForProcessingPage } from '@/admin/processing/path';
import AdminProcessingTable, {
  type RegistrationItem,
} from '@/admin/AdminProcessingTable';
import {
  getUnregisteredStorageUploadsPage,
} from '@/admin/processing/server';
import {
  getPendingMediaProcessingPage,
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
  const registrationPage = getPageNumber(params.registrationPage);
  const processingPage = getPageNumber(params.processingPage);
  const [
    registrationResult,
    processingResult,
  ] = await Promise.all([
    getUnregisteredStorageUploadsPage(
      PROCESSING_PAGE_SIZE,
      (registrationPage - 1) * PROCESSING_PAGE_SIZE,
    ).catch(() => undefined),
    getPendingMediaProcessingPage(
      PROCESSING_PAGE_SIZE,
      (processingPage - 1) * PROCESSING_PAGE_SIZE,
    ).catch(() => undefined),
  ]);

  // Either queue may shrink while visiting its last page.
  const lastValidPage = (page: number, total?: number) => total === undefined
    ? page
    : Math.min(page, Math.max(1, Math.ceil(total / PROCESSING_PAGE_SIZE)));
  const validRegistrationPage = lastValidPage(registrationPage, registrationResult?.total);
  const validProcessingPage = lastValidPage(processingPage, processingResult?.total);
  if (registrationPage !== validRegistrationPage || processingPage !== validProcessingPage) {
    redirect(pathForProcessingPage(validRegistrationPage, validProcessingPage));
  }

  const registeringUrls = registrationResult?.uploads.map(registrationRowToStatus) ?? [];

  return (
    <AppGrid
      contentMain={
        <AdminProcessingTable
          registering={registeringUrls}
          registeringTotal={registrationResult?.total ?? 0}
          registrationPage={registrationPage}
          processing={processingResult?.items ?? []}
          processingTotal={processingResult?.total ?? 0}
          processingPage={processingPage}
        />
      }
    />
  );
}
