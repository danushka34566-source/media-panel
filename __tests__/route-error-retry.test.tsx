import { act, fireEvent, render, screen } from '@testing-library/react';
import RouteError from '../app/error';

const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));
jest.mock('../src/tag', () => ({ TAG_PRIVATE: 'private' }));

beforeEach(() => mockRefresh.mockClear());

it('retries a stale error once per navigation across remounts', async () => {
  const originalNavigation = Object.getOwnPropertyDescriptor(window, 'navigation');
  const initialUrl = location.href;
  const initialState = history.state;
  const navigation = Object.assign(new EventTarget(), {
    currentEntry: { key: 'route-error-entry' },
  });
  const reset = jest.fn();
  const staleError = () => new Error('Loading chunk 12 failed');
  const announceNavigation = () => act(async () => {
    navigation.dispatchEvent(new Event('currententrychange'));
  });
  Object.defineProperty(window, 'navigation', {
    configurable: true,
    value: navigation,
  });

  try {
    history.replaceState(null, '', '/search?query=first');
    const initial = render(<RouteError error={staleError()} reset={reset} />);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);

    await announceNavigation();
    initial.unmount();
    const remount = render(<RouteError error={staleError()} reset={reset} />);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    remount.unmount();

    history.replaceState(null, '', '/search?query=second');
    await announceNavigation();
    history.replaceState(null, '', '/search?query=first');
    await announceNavigation();
    render(<RouteError error={staleError()} reset={reset} />);
    expect(mockRefresh).toHaveBeenCalledTimes(2);
    expect(reset).toHaveBeenCalledTimes(2);
  } finally {
    history.replaceState(initialState, '', initialUrl);
    await announceNavigation();
    if (originalNavigation) {
      Object.defineProperty(window, 'navigation', originalNavigation);
    } else {
      Reflect.deleteProperty(window, 'navigation');
    }
  }
});

it('offers a manual refresh and reset for other failures', () => {
  const reset = jest.fn();
  render(<RouteError error={new Error('Unavailable')} reset={reset} />);
  expect(mockRefresh).not.toHaveBeenCalled();
  expect(reset).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(reset).toHaveBeenCalledTimes(1);
});
