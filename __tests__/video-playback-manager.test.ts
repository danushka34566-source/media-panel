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

it('pauses an expanded player when playback returns to its inline video', async () => {
  const expanded = createPlayer();
  const inline = createPlayer();
  await VideoPlaybackManager.requestPlay(expanded);

  await VideoPlaybackManager.requestPlay(inline);

  expect(expanded.pause).toHaveBeenCalledTimes(1);
  expect(inline.play).toHaveBeenCalledTimes(1);
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

it('reports when a native PiP request needs a new gesture', async () => {
  const video = Object.assign(createPlayer(), {
    requestPictureInPicture: jest.fn().mockRejectedValue(new DOMException('', 'NotAllowedError')),
  });
  jest.spyOn(VideoPlaybackManager, 'isPiPEnabled').mockReturnValue(true);

  const pending = VideoPlaybackManager.togglePiP(video);
  expect(video.requestPictureInPicture).toHaveBeenCalledTimes(1);
  await expect(pending).resolves.toBe(false);
});

it('enters and exits Safari picture-in-picture presentation mode', async () => {
  const video = Object.assign(createPlayer(), {
    webkitPresentationMode: 'inline',
    webkitSupportsPresentationMode: jest.fn().mockReturnValue(true),
    webkitSetPresentationMode: jest.fn((mode: string) => { video.webkitPresentationMode = mode; }),
  });
  jest.spyOn(VideoPlaybackManager, 'isPiPEnabled').mockReturnValue(true);

  await expect(VideoPlaybackManager.togglePiP(video)).resolves.toBe(true);
  expect(video.webkitPresentationMode).toBe('picture-in-picture');
  await expect(VideoPlaybackManager.togglePiP(video)).resolves.toBe(true);
  expect(video.webkitPresentationMode).toBe('inline');
});

it('opens Document PiP from the Window API and cleans up on pagehide', async () => {
  const pipWindow = Object.assign(new EventTarget(), {
    document: document.implementation.createHTMLDocument(),
    setInterval: jest.fn(() => 1),
    clearInterval: jest.fn(),
  });
  const requestWindow = jest.fn().mockResolvedValue(pipWindow);
  Object.defineProperty(window, 'documentPictureInPicture', {
    configurable: true, value: { requestWindow },
  });
  const source = createPlayer();
  source.src = '/source.mp4';
  try {
    expect(VideoPlaybackManager.isPiPEnabled()).toBe(true);
    const opening = VideoPlaybackManager.togglePiP(source);
    expect(requestWindow).toHaveBeenCalledTimes(1);
    await expect(opening).resolves.toBe(true);
    expect(VideoPlaybackManager.isPiPActive()).toBe(true);
    expect(pipWindow.document.querySelector('video')?.getAttribute('src'))
      .toContain('/source.mp4');
    expect(source.muted).toBe(true);
    pipWindow.dispatchEvent(new Event('pagehide'));
    expect(VideoPlaybackManager.isPiPActive()).toBe(false);
    expect(source.muted).toBe(false);
    expect(pipWindow.clearInterval).toHaveBeenCalledWith(1);
  } finally {
    Reflect.deleteProperty(window, 'documentPictureInPicture');
  }
});

it('falls back to native PiP when the Document PiP window is rejected', async () => {
  const requestWindow = jest.fn().mockRejectedValue(new Error('Window blocked'));
  const video = Object.assign(createPlayer(), {
    requestPictureInPicture: jest.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(window, 'documentPictureInPicture', {
    configurable: true, value: { requestWindow },
  });
  try {
    await expect(VideoPlaybackManager.togglePiP(video)).resolves.toBe(true);
    expect(requestWindow).toHaveBeenCalledTimes(1);
    expect(video.requestPictureInPicture).toHaveBeenCalledTimes(1);
  } finally {
    Reflect.deleteProperty(window, 'documentPictureInPicture');
  }
});
