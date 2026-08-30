import InlineVideoPreview from '@/media/InlineVideoPreview';
import { act, fireEvent, render } from '@testing-library/react';

describe('inline video preview', () => {
  it('stays transparent until a frame is ready and keeps it during buffering', () => {
    const playSpy = jest.spyOn(
      HTMLMediaElement.prototype,
      'play',
    ).mockResolvedValue(undefined);
    const pauseSpy = jest.spyOn(
      HTMLMediaElement.prototype,
      'pause',
    ).mockImplementation(() => undefined);
    const { container, rerender } = render(<div>
      <img src="poster.jpg" alt="Poster" />
      <InlineVideoPreview
        src="preview.mp4"
        active
        onError={jest.fn()}
      />
    </div>);
    const poster = container.querySelector('img')!;
    const video = container.querySelector('video')!;

    expect(poster).not.toBeNull();
    expect(video.classList.contains('opacity-0')).toBe(true);

    fireEvent.loadedData(video);
    expect(video.classList.contains('opacity-100')).toBe(true);
    expect(poster).not.toBeNull();

    fireEvent.waiting(video);
    expect(video.classList.contains('opacity-100')).toBe(true);
    expect(poster).not.toBeNull();

    rerender(<div>
      <img src="poster.jpg" alt="Poster" />
      <InlineVideoPreview
        src="preview.mp4"
        active={false}
        onError={jest.fn()}
      />
    </div>);
    expect(pauseSpy).toHaveBeenCalled();
    playSpy.mockRestore();
    pauseSpy.mockRestore();
  });

  it('retries a transient play rejection without requiring a page refresh', async () => {
    jest.useFakeTimers();
    let attempts = 0;
    const playSpy = jest.spyOn(
      HTMLMediaElement.prototype,
      'play',
    ).mockImplementation(() => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error('mobile resume race'))
        : Promise.resolve();
    });
    const pauseSpy = jest.spyOn(
      HTMLMediaElement.prototype,
      'pause',
    ).mockImplementation(() => undefined);

    render(<InlineVideoPreview
      src="preview.mp4"
      active
      onError={jest.fn()}
    />);
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
    act(() => { jest.advanceTimersByTime(180); });

    expect(attempts).toBe(2);
    playSpy.mockRestore();
    pauseSpy.mockRestore();
    jest.useRealTimers();
  });
});
