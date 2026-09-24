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
});
