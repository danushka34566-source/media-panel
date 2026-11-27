import { render, screen } from '@testing-library/react';
import AdminProcessingTable from '../src/admin/AdminProcessingTable';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock('../src/media/index', () => ({
  getDisplayTranscodeStatus: () => undefined,
  titleForMedia: () => undefined,
}));

jest.mock('../src/media/MediaSmall', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/admin/AdminProcessingSyncButton', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../src/admin/AdminRegistrationRetryButton', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../src/admin/AdminRegistrationDeleteButton', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../src/admin/AdminRegistrationErrorButton', () => ({
  __esModule: true,
  default: () => null,
}));

it('shows retryable errors instead of empty queue states', () => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }),
  });

  render(<AdminProcessingTable
    registering={[]}
    registeringTotal={0}
    registrationPage={1}
    registrationError
    processing={[]}
    processingTotal={0}
    processingPage={1}
    processingError
  />);

  expect(screen.getByText('Unable to load pending uploads.')).toBeTruthy();
  expect(screen.getByText('Unable to load media processing.')).toBeTruthy();
  expect(screen.queryByText('No files registering.')).toBeNull();
  expect(screen.queryByText('No files processing.')).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(2);
});
