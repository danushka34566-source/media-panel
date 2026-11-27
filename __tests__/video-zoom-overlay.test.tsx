import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import VideoZoomOverlay from '@/media/VideoZoomOverlay';

function Player({ onCloseWithTime }: { onCloseWithTime: (time: number) => void }) {
  const [open, setOpen] = useState(false);
  const returnFocusRef = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={returnFocusRef} onClick={() => setOpen(true)}>Expand video</button>
    {open && <VideoZoomOverlay
      onClose={() => setOpen(false)}
      returnFocusRef={returnFocusRef}
      onCloseWithTime={onCloseWithTime}
      usingCompatibility={false}
      videoUrl="/source.mp4"
      playbackUrl="/source.mp4"
    />}
  </>;
}

beforeEach(() => {
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it.each(['close button', 'Escape', 'backdrop'])('synchronizes playback and restores focus on %s', async dismissal => {
  const onCloseWithTime = jest.fn();
  render(<Player onCloseWithTime={onCloseWithTime} />);
  const trigger = screen.getByRole('button', { name: 'Expand video' });
  trigger.focus();
  fireEvent.click(trigger);

  const dialog = await screen.findByRole('dialog', { name: 'Expanded video player' });
  const close = screen.getByRole('button', { name: 'Close expanded video' });
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(document.activeElement).toBe(close);
  const video = dialog.querySelector('video')!;
  Object.defineProperty(video, 'readyState', { value: HTMLMediaElement.HAVE_METADATA });
  video.currentTime = 47;

  if (dismissal === 'close button') {
    fireEvent.click(close);
  } else if (dismissal === 'Escape') {
    expect(fireEvent.keyDown(close, { key: 'Escape' })).toBe(false);
  } else {
    await waitFor(() => {
      fireEvent.pointerDown(dialog.previousElementSibling!, { pointerType: 'mouse', button: 0 });
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  }

  expect(onCloseWithTime).toHaveBeenCalledTimes(1);
  expect(onCloseWithTime).toHaveBeenCalledWith(47);
  expect(screen.queryByRole('dialog')).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

it('retries a stalled expanded video from its last playback position', () => {
  jest.useFakeTimers();
  try {
    render(<Player onCloseWithTime={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand video' }));

    const video = screen.getByRole('dialog').querySelector('video')!;
    const load = jest.fn();
    Object.defineProperty(video, 'load', { value: load });
    Object.defineProperty(video, 'paused', { value: false });
    video.currentTime = 47;
    fireEvent.playing(video);
    fireEvent.waiting(video);
    expect(screen.getByRole('status').textContent).toBe('Buffering video…');

    act(() => { jest.advanceTimersByTime(15_000); });
    expect(load).toHaveBeenCalledTimes(1);
    video.currentTime = 0;
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(47);
  } finally {
    jest.useRealTimers();
  }
});
