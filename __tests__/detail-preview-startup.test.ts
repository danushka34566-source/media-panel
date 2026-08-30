import {
  beginDetailPreviewStartup,
  completeDetailPreviewStartup,
  isDetailPreviewStartupComplete,
  subscribeDetailPreviewStartup,
} from '@/media/detail-preview-startup';

describe('detail preview startup coordination', () => {
  it('ignores stale completion and releases related previews for the current media', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeDetailPreviewStartup(listener);

    beginDetailPreviewStartup('current-media');
    completeDetailPreviewStartup('previous-media');
    expect(isDetailPreviewStartupComplete('current-media')).toBe(false);

    completeDetailPreviewStartup('current-media');
    expect(isDetailPreviewStartupComplete('current-media')).toBe(true);
    expect(listener).toHaveBeenLastCalledWith({
      mediaId: 'current-media',
      prepared: true,
    });
    unsubscribe();
  });
});
