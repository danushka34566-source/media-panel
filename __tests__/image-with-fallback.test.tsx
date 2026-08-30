import ImageWithFallback from '@/components/image/ImageWithFallback';
import { act, fireEvent, render } from '@testing-library/react';

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt,
    onError,
    onLoad,
    src,
    unoptimized,
  }: {
    alt: string
    onError?: React.ReactEventHandler<HTMLImageElement>
    onLoad?: React.ReactEventHandler<HTMLImageElement>
    src: string
    unoptimized?: boolean
  }) => <img
    alt={alt}
    src={unoptimized
      ? src
      : `/_next/image?url=${encodeURIComponent(src)}&w=640&q=75`}
    onError={onError}
    onLoad={onLoad}
  />,
}));

describe('optimized image fallback', () => {
  it('keeps a transformed image until it really errors', () => {
    jest.useFakeTimers();
    const { container } = render(<ImageWithFallback
      src="https://storage.example/video-poster.jpg"
      width={300}
      height={200}
      alt="Poster"
      fallbackToUnoptimized
    />);
    const image = container.querySelector('img')!;

    expect(image.src).toContain('/_next/image');
    jest.advanceTimersByTime(10_000);
    expect(image.src).toContain('/_next/image');

    fireEvent.error(image);
    expect(container.querySelector('img')?.src).toBe(
      'https://storage.example/video-poster.jpg',
    );
    jest.useRealTimers();
  });

  it('remembers a failed transformation when the card remounts', () => {
    const src = 'https://storage.example/new-video-poster.jpg';
    const first = render(<ImageWithFallback
      src={src}
      width={300}
      height={200}
      alt="Poster"
      fallbackToUnoptimized
    />);
    fireEvent.error(first.container.querySelector('img')!);
    first.unmount();

    const second = render(<ImageWithFallback
      src={src}
      width={300}
      height={200}
      alt="Poster"
      fallbackToUnoptimized
    />);
    expect(second.container.querySelector('img')?.src).toBe(src);
  });

  it('gives cached transforms one frame before bypassing an unavailable optimizer', () => {
    const animationFrames: FrameRequestCallback[] = [];
    const requestFrameSpy = jest.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        animationFrames.push(callback);
        return animationFrames.length;
      });
    const failedSrc = 'https://storage.example/quota-failure-poster.jpg';
    const failed = render(<ImageWithFallback
      src={failedSrc}
      width={300}
      height={200}
      alt="Failed poster"
      fallbackToUnoptimized
    />);
    const failedImage = failed.container.querySelector('img')!;
    fireEvent.error(failedImage);
    fireEvent.load(failed.container.querySelector('img')!);

    const nextSrc = 'https://storage.example/next-poster.jpg';
    const next = render(<ImageWithFallback
      src={nextSrc}
      width={300}
      height={200}
      alt="Next poster"
      fallbackToUnoptimized
    />);
    expect(next.container.querySelector('img')?.src).toContain('/_next/image');
    act(() => animationFrames.splice(0).forEach(callback => callback(0)));
    expect(next.container.querySelector('img')?.src).toBe(nextSrc);
    requestFrameSpy.mockRestore();
  });

  it('keeps a transformed response that resolves from browser cache', () => {
    const animationFrames: FrameRequestCallback[] = [];
    const requestFrameSpy = jest.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        animationFrames.push(callback);
        return animationFrames.length;
      });
    const src = 'https://storage.example/cached-poster.jpg';
    const cached = render(<ImageWithFallback
      src={src}
      width={300}
      height={200}
      alt="Cached poster"
      fallbackToUnoptimized
    />);
    const image = cached.container.querySelector('img')!;

    fireEvent.load(image);
    act(() => animationFrames.splice(0).forEach(callback => callback(0)));
    expect(cached.container.querySelector('img')?.src)
      .toContain('/_next/image');
    requestFrameSpy.mockRestore();
  });
});
