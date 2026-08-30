import { releaseVideoElement } from '@/media/release-video-element';

describe('video element teardown', () => {
  it('releases buffered sources and the decoder immediately', () => {
    const video = document.createElement('video');
    const source = document.createElement('source');
    video.setAttribute('src', 'preview.mp4');
    source.setAttribute('src', 'fallback.mp4');
    video.append(source);
    const pause = jest.spyOn(video, 'pause')
      .mockImplementation(() => undefined);
    const load = jest.spyOn(video, 'load')
      .mockImplementation(() => undefined);

    releaseVideoElement(video);

    expect(pause).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(video.hasAttribute('src')).toBe(false);
    expect(source.hasAttribute('src')).toBe(false);
  });
});
