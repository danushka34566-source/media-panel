import { act, renderHook } from '@testing-library/react';
import useNavigateOrRunActionWithToast from '@/components/useNavigateOrRunActionWithToast';
import { toastWaiting, toastWarning } from '@/toast';
import { toast } from 'sonner';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../src/i18n/state/client', () => ({
  useAppText: () => ({ utility: { loading: 'Loading' } }),
}));
jest.mock('../src/toast', () => ({
  toastWaiting: jest.fn(),
  toastWarning: jest.fn(),
}));
jest.mock('sonner', () => ({
  toast: Object.assign(jest.fn(), { dismiss: jest.fn() }),
}));

const notify = (run: () => Promise<unknown>) => renderHook(() =>
  useNavigateOrRunActionWithToast({ pathOrAction: run, toastMessage: 'Syncing' }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(toastWaiting).mockReturnValue('waiting-toast');
});

afterEach(() => jest.useRealTimers());

it('marks a fulfilled action complete and dismisses its own toast', async () => {
  const { result } = notify(() => Promise.resolve());
  await act(async () => { result.current(); });

  expect(toastWaiting).toHaveBeenCalledWith('Syncing');
  expect(toast).toHaveBeenCalledWith('Syncing', expect.objectContaining({
    id: 'waiting-toast',
  }));
  expect(toastWarning).not.toHaveBeenCalled();
  expect(toast.dismiss).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1500));
  expect(toast.dismiss).toHaveBeenCalledWith('waiting-toast');
});

it('dismisses the waiting toast when the action redirects', async () => {
  const { result } = notify(() => Promise.reject({
    digest: 'NEXT_REDIRECT;replace;/;307;',
  }));
  await act(async () => { result.current(); });

  expect(toast.dismiss).toHaveBeenCalledWith('waiting-toast');
  expect(toast).not.toHaveBeenCalled();
  expect(toastWarning).not.toHaveBeenCalled();
});

it('warns when an action rejects without a redirect', async () => {
  const { result } = notify(() => Promise.reject(new Error('Request failed')));
  await act(async () => { result.current(); });

  expect(toast.dismiss).toHaveBeenCalledWith('waiting-toast');
  expect(toast).not.toHaveBeenCalled();
  expect(toastWarning).toHaveBeenCalledWith('Unable to complete this action.');
});

it('finishes each overlapping action with its own toast ID', async () => {
  let finishFirst!: () => void;
  const first = new Promise<void>(resolve => { finishFirst = resolve; });
  let failSecond!: (error: Error) => void;
  const second = new Promise<void>((_, reject) => { failSecond = reject; });
  const run = jest.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
  jest.mocked(toastWaiting).mockReturnValueOnce('first').mockReturnValueOnce('second');
  const { result } = notify(run);
  act(() => { result.current(); result.current(); });

  await act(async () => { finishFirst(); });
  act(() => jest.advanceTimersByTime(1500));
  expect(toast.dismiss).toHaveBeenCalledWith('first');
  expect(toast.dismiss).not.toHaveBeenCalledWith('second');

  await act(async () => { failSecond(new Error('Request failed')); });
  expect(toast.dismiss).toHaveBeenCalledWith('second');
  expect(toastWarning).toHaveBeenCalledTimes(1);
});
