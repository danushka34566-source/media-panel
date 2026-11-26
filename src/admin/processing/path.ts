import { PATH_ADMIN_PROCESSING } from '@/app/path';

export function pathForProcessingPage(registrationPage: number, processingPage: number) {
  const params = new URLSearchParams();
  if (registrationPage > 1) { params.set('registrationPage', String(registrationPage)); }
  if (processingPage > 1) { params.set('processingPage', String(processingPage)); }
  const search = params.toString();
  return search ? `${PATH_ADMIN_PROCESSING}?${search}` : PATH_ADMIN_PROCESSING;
}
