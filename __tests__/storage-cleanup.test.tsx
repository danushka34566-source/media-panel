import { act, fireEvent, render, screen } from '@testing-library/react';
import StorageCleanupClient from '@/admin/storage-cleanup/StorageCleanupClient';
import {
  getStorageCleanupSnapshot,
  type StorageCleanupItem,
} from '../src/admin/storage-cleanup/actions';

jest.mock('../src/admin/storage-cleanup/actions', () => ({
  getStorageCleanupSnapshot: jest.fn(),
}));

const readOnly = 'The storage provider cannot verify the object version during deletion. This audit is read-only.';

const candidate = (key: string): StorageCleanupItem => ({
  key,
  url: `https://storage.example/${key}`,
  relations: [{ kind: 'source', label: 'registration.source', mediaId: 'media-42' }],
  classification: 'source-cleanup',
  canDelete: false,
  reason: 'Source replacement verified.',
});

const renderAudit = (errors: string[] = []) => render(<StorageCleanupClient initial={{
  checkedAt: '2026-11-27T00:00:00Z',
  provider: 'drive',
  totalObjects: 2,
  scannedObjects: 2,
  items: [candidate('first.mp4'), candidate('second.mp4')],
  errors,
  deletionUnavailableReason: readOnly,
}} />);

afterEach(() => jest.restoreAllMocks());

it('shows the read-only reason and keeps candidates searchable', () => {
  renderAudit();

  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'media-42' } });
  expect(screen.getByText(readOnly)).toBeTruthy();
  expect(screen.getByText('first.mp4')).toBeTruthy();
  expect(screen.getByText('second.mp4')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
});

it('keeps the last audit visible when refreshing fails', async () => {
  jest.mocked(getStorageCleanupSnapshot).mockRejectedValue(new Error('storage unavailable'));
  renderAudit();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Refresh audit' }));
  });

  expect(screen.getByRole('alert').textContent).toContain('Unable to refresh');
  expect(screen.getByText('first.mp4')).toBeTruthy();
});

it('shows incomplete verification alongside existing audit items', () => {
  renderAudit(['Unable to verify some storage replacements.']);

  expect(screen.getByRole('alert').textContent)
    .toBe('Unable to verify some storage replacements.');
  expect(screen.getByText('first.mp4')).toBeTruthy();
});

it('recovers inline from an unavailable initial audit', async () => {
  jest.mocked(getStorageCleanupSnapshot).mockResolvedValueOnce({
    checkedAt: '2026-11-27T00:00:00Z',
    provider: 'drive',
    totalObjects: 1,
    scannedObjects: 1,
    items: [candidate('recovered.mp4')],
    errors: [],
    deletionUnavailableReason: readOnly,
  });
  render(<StorageCleanupClient />);

  expect(screen.getByRole('alert').textContent).toContain(
    'Unable to load the storage audit',
  );
  expect(screen.queryByText('No matching storage objects.')).toBeNull();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Refresh audit' }));
  });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('recovered.mp4')).toBeTruthy();
});
