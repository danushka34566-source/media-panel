import { processUploadToMedia } from '@/admin/upload/process';

describe('upload and registration separation', () => {
  it(
    'finishes the panel step without writing hints or calling the worker',
    async () => {
      const originalFetch = global.fetch;
      const fetchMock = jest.fn();
      global.fetch = fetchMock as typeof fetch;
      const updates: Array<{ status?: string; statusMessage?: string }> = [];

      try {
        const result = await processUploadToMedia({
          url: 'https://storage.example/uploads/id/Current File.mp4',
          title: 'Current File',
          originalFileName: 'Current File.mp4',
          onUpdate: update => updates.push(update),
        });

        expect(result).toEqual({
          status: 'added',
          statusMessage: 'Uploaded; awaiting worker scan',
        });
        expect(updates.at(-1)).toMatchObject({
          status: 'added',
          statusMessage: 'Uploaded; awaiting worker scan',
        });
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        global.fetch = originalFetch;
      }
    },
  );
});
