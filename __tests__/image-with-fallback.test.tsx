import ImageWithFallback from '@/components/image/ImageWithFallback';
import { fireEvent, render } from '@testing-library/react';

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
});
