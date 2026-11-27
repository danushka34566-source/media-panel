import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { usePriorityVideoPreviewAllowed } from '@/media/video-preview-lifecycle';

it('defers autoplay until motion settings are available and honors later changes', () => {
  const query = Object.assign(new EventTarget(), { matches: true });
  const connection = Object.assign(new EventTarget(), { saveData: true });
  const previousMatchMedia = window.matchMedia;
  const previousConnection = Object.getOwnPropertyDescriptor(navigator, 'connection');
  const matchMedia = jest.fn(() => query);
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia });
  Object.defineProperty(navigator, 'connection', { configurable: true, value: connection });
  try {
    function Preview() {
      return usePriorityVideoPreviewAllowed(true) ? <video autoPlay /> : <span />;
    }
    expect(renderToString(<Preview />)).not.toContain('<video');
    expect(matchMedia).not.toHaveBeenCalled();

    const { result, rerender } = renderHook(
      ({ enabled }) => usePriorityVideoPreviewAllowed(enabled),
      { initialProps: { enabled: true } },
    );
    expect(result.current).toBe(false);
    act(() => {
      query.matches = false;
      query.dispatchEvent(new Event('change'));
    });
    expect(result.current).toBe(false);
    act(() => {
      connection.saveData = false;
      connection.dispatchEvent(new Event('change'));
    });
    expect(result.current).toBe(true);
    rerender({ enabled: false });
    expect(result.current).toBe(false);
  } finally {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: previousMatchMedia });
    if (previousConnection) {
      Object.defineProperty(navigator, 'connection', previousConnection);
    } else {
      Reflect.deleteProperty(navigator, 'connection');
    }
  }
});
