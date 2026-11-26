import { VideoPlaybackManager } from '@/utility/VideoPlaybackManager';

function createPlayer() {
  const video = document.createElement('video');
  video.play = jest.fn().mockResolvedValue(undefined);
  video.pause = jest.fn();
  return video;
}

afterEach(() => { jest.restoreAllMocks(); });

it('calls play within the gesture when switching videos and preserves the preview', async () => {
  const preview = createPlayer();
  const full = createPlayer();
  await VideoPlaybackManager.requestPlay(preview);
  const result = VideoPlaybackManager.requestPlay(full, { preserveVideoUntilPlaying: preview });
  expect(full.play).toHaveBeenCalledTimes(1);
  expect(preview.pause).not.toHaveBeenCalled();
  await expect(result).resolves.toBe('playing');
});

it('can start another video while the previous picture-in-picture session is closing', async () => {
  const oldVideo = createPlayer();
  await VideoPlaybackManager.requestPlay(oldVideo);
  const full = createPlayer();
  jest.spyOn(VideoPlaybackManager, 'isPiPActive').mockReturnValue(true);
  jest.spyOn(VideoPlaybackManager, 'isPiPEnabled').mockReturnValue(false);
  let finishExit!: () => void;
  jest.spyOn(VideoPlaybackManager, 'exitPiP').mockImplementation(() =>
    new Promise<void>(resolve => { finishExit = resolve; }));
  const pending = VideoPlaybackManager.requestPlay(full);
  expect(oldVideo.pause).toHaveBeenCalledTimes(1);
  expect(full.play).toHaveBeenCalledTimes(1);
  finishExit();
  await expect(pending).resolves.toBe('playing');
});

it.each([['NotAllowedError', 'blocked'], ['AbortError', 'failed']])(
  'reports %s to the play control', async (name, result) => {
    const video = createPlayer();
    video.play = jest.fn().mockRejectedValue(new DOMException('Playback rejected', name));
    await expect(VideoPlaybackManager.requestPlay(video)).resolves.toBe(result);
  },
);
