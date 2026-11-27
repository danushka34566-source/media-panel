import { resolveDetailPrimary } from '../src/media/detail-primary';

const photo = (id: string) => ({ id });

describe('detail primary lookup', () => {
  it('uses the nearby result without another read when the primary is present', async () => {
    const loadPrimary = jest.fn(async () => photo('a'));
    const result = await resolveDetailPrimary('a', [photo('a'), photo('b')], loadPrimary);
    expect(result).toEqual({ photo: photo('a'), photos: [photo('a'), photo('b')] });
    expect(loadPrimary).not.toHaveBeenCalled();
  });

  it('recovers a primary missing from a stale or changed category result', async () => {
    const result = await resolveDetailPrimary(
      'a', [photo('b')], async () => photo('a'),
    );
    expect(result).toEqual({ photo: photo('a'), photos: [photo('a')] });
  });

  it('propagates a failed primary read instead of reporting a missing item', async () => {
    await expect(resolveDetailPrimary('a', [], async () => {
      throw new Error('database unavailable');
    })).rejects.toThrow('database unavailable');
  });

  it('reports absence only after the primary read confirms it', async () => {
    await expect(resolveDetailPrimary('a', [], async () => undefined))
      .resolves.toEqual({ photo: undefined, photos: [] });
  });

  it('drops a cached processing video that is no longer visible publicly', async () => {
    const loadPrimary = jest.fn(async () => ({ id: 'a', hidden: true }));
    const result = await resolveDetailPrimary(
      'a', [photo('a'), photo('b')], loadPrimary, { shouldRefresh: () => true },
    );

    expect(loadPrimary).toHaveBeenCalledWith(false);
    expect(result).toEqual({ photo: undefined, photos: [photo('b')] });
  });

  it('drops a cached processing video that left the private collection', async () => {
    const loadPrimary = jest.fn(async () => ({ id: 'a', hidden: false }));
    const result = await resolveDetailPrimary(
      'a', [{ id: 'a', hidden: true }], loadPrimary,
      { hidden: 'only', shouldRefresh: () => true },
    );

    expect(loadPrimary).toHaveBeenCalledWith(true);
    expect(result).toEqual({ photo: undefined, photos: [] });
  });

  it('keeps the last visible status when a processing refresh fails', async () => {
    const cached = { id: 'a', hidden: false, transcodeStatus: 'processing' };
    const result = await resolveDetailPrimary('a', [cached], async () => {
      throw new Error('database unavailable');
    }, { shouldRefresh: () => true });

    expect(result).toEqual({ photo: cached, photos: [cached] });
  });
});
