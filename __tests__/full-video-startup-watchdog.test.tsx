import { act, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { useFullVideoPlaybackWatchdog } from '@/media/full-video-playback';

function Player({ onTimeout, onBufferingChange, onDecodedPause, attempt = 0 }: {
  onTimeout: (video: HTMLVideoElement, code: number) => void
  onBufferingChange?: (buffering: boolean) => void
  onDecodedPause?: () => void
  attempt?: number
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useFullVideoPlaybackWatchdog({
    active: true, attempt, videoRef, onTimeout, onBufferingChange, onDecodedPause,
  });
  return <video ref={videoRef} />;
}

const advance = (millis: number) => act(() => {
  jest.advanceTimersByTime(millis);
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('waits for a transfer in progress before requesting recovery', () => {
  const onTimeout = jest.fn();
  const { container, rerender } = render(<Player onTimeout={onTimeout} />);
  const video = container.querySelector('video')!;

  advance(14_000);
  fireEvent.progress(video);
  advance(14_999);
  expect(onTimeout).not.toHaveBeenCalled();

  advance(1);
  expect(onTimeout).toHaveBeenCalledWith(video, 2);

  rerender(<Player onTimeout={onTimeout} attempt={1} />);
  advance(15_000);
  expect(onTimeout).toHaveBeenCalledTimes(2);
});

it('allows normal playback to continue after startup', () => {
  const onTimeout = jest.fn();
  const { container } = render(<Player onTimeout={onTimeout} />);
  const video = container.querySelector('video')!;

  fireEvent.playing(video);
  fireEvent.progress(video);
  advance(30_000);
  expect(onTimeout).not.toHaveBeenCalled();
});

it('recovers a sustained stall after playback has started', () => {
  const onTimeout = jest.fn();
  const onBufferingChange = jest.fn();
  const { container } = render(<Player {...{ onTimeout, onBufferingChange }} />);
  const video = container.querySelector('video')!;
  Object.defineProperty(video, 'paused', { value: false });

  fireEvent.playing(video);
  fireEvent.waiting(video);
  expect(onBufferingChange).toHaveBeenCalledWith(true);
  advance(14_999);
  fireEvent.progress(video);
  expect(onTimeout).not.toHaveBeenCalled();
  advance(1);
  expect(onTimeout).toHaveBeenCalledWith(video, 2);
});

it('cancels runtime recovery if playback continues or pauses', () => {
  const onTimeout = jest.fn();
  const onBufferingChange = jest.fn();
  const { container } = render(<Player {...{ onTimeout, onBufferingChange }} />);
  const video = container.querySelector('video')!;
  Object.defineProperty(video, 'paused', { value: false });

  fireEvent.playing(video);
  fireEvent.stalled(video);
  video.currentTime = 1;
  fireEvent.timeUpdate(video);
  expect(onBufferingChange.mock.calls).toEqual([[true], [false]]);
  advance(15_000);

  fireEvent.waiting(video);
  fireEvent.pause(video);
  advance(15_000);
  expect(onTimeout).not.toHaveBeenCalled();
  expect(onBufferingChange.mock.calls).toEqual([[true], [false], [true], [false]]);
});

it('leaves a paused video with decoded future data available for manual play', () => {
  const onTimeout = jest.fn();
  const onDecodedPause = jest.fn();
  const { container } = render(<Player {...{ onTimeout, onDecodedPause }} />);
  const video = container.querySelector('video')!;
  Object.defineProperty(video, 'readyState', {
    value: HTMLMediaElement.HAVE_FUTURE_DATA,
  });

  advance(15_000);
  expect(onTimeout).not.toHaveBeenCalled();
  expect(onDecodedPause).toHaveBeenCalledTimes(1);
});

it('releases startup recovery when playback pauses after its first frame', () => {
  const onTimeout = jest.fn();
  const onDecodedPause = jest.fn();
  const { container } = render(<Player {...{ onTimeout, onDecodedPause }} />);
  const video = container.querySelector('video')!;
  let readyState: number = HTMLMediaElement.HAVE_METADATA;
  Object.defineProperty(video, 'readyState', { get: () => readyState });
  fireEvent.pause(video);
  expect(onDecodedPause).not.toHaveBeenCalled();

  readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
  fireEvent.pause(video);
  expect(onDecodedPause).toHaveBeenCalledTimes(1);
  advance(15_000);
  expect(onTimeout).not.toHaveBeenCalled();
});
