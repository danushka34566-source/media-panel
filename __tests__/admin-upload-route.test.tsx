import UploadPage from '../app/admin/uploads/[uploadPath]/page';
import { pathForAdminUploadUrl } from '../src/app/path';

jest.mock('../src/app/config', () => ({
  AI_CONTENT_GENERATION_ENABLED: false,
  BLUR_ENABLED: false,
  getBaseUrl: () => 'https://example.test',
}));
jest.mock('../src/tag', () => ({ TAG_PRIVATE: 'private' }));
jest.mock('../src/album/query', () => ({
  getAlbumsWithMeta: async () => [],
}));
jest.mock('../src/media/query', () => ({
  getRecipeTitleForData: async () => undefined,
}));
jest.mock('../src/media/cache', () => ({
  getUniqueCategoriesCached: async () => [],
  getUniqueFilmsCached: async () => [],
  getUniqueRecipesCached: async () => [],
  getUniqueTagsCached: async () => [],
}));
jest.mock('../src/media/server', () => ({
  extractImageDataFromBlobPath: async () => ({ formDataFromExif: {} }),
}));
jest.mock('../src/media/ai/server', () => ({
  addAiTextToFormData: async ({ formData }: { formData: unknown }) => formData,
}));
jest.mock('../src/media/UploadPageClient', () => () => null);

it.each([
  '100% complete.jpg',
  'the literal %20.jpg',
])('preserves the upload filename "%s"', async originalName => {
  const href = pathForAdminUploadUrl(
    'https://example.test/upload.jpg', 'Upload', originalName,
  );
  const url = new URL(href, 'https://example.test');
  const uploadPath = url.pathname.split('/').at(-1)!;
  const page = await UploadPage({
    params: Promise.resolve({ uploadPath }),
    searchParams: Promise.resolve(Object.fromEntries(url.searchParams)),
  });

  expect(page.props.formDataFromExif.uploadOriginalFileName).toBe(originalName);
});
