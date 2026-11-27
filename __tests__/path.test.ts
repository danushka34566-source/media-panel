import {
  getEscapePath,
  getMediaSearchQuery,
  getPathComponents,
  getCanonicalAdminMediaPath,
  doesPathOfferSort,
  isPathAdminMedia,
  isPathTopLevelAdmin,
  isPathCamera,
  isPathCameraMedia,
  isPathFilm,
  isPathFilmMedia,
  isPathFocalLength,
  isPathFocalLengthMedia,
  isPathMedia,
  isPathProtected,
  isPathTag,
  isPathTagMedia,
  pathForAdminMediaEdit,
  pathForCategory,
  pathForContentType,
  pathForMedia,
  pathForPerformer,
  pathForStudio,
} from '@/app/path';
import { TAG_PRIVATE } from '@/tag';
import { isValidMediaYear } from '@/year';

jest.mock('../src/tag', () => ({ TAG_PRIVATE: 'private' }));

const PHOTO_ID            = 'UsKSGcbt';
const TAG                 = 'tag-name';
const CAMERA_MAKE         = 'fujifilm';
const CAMERA_MODEL        = 'x-t1';
const CAMERA_OBJECT       = { make: CAMERA_MAKE, model: CAMERA_MODEL };
const FILM                = 'acros';
const FOCAL_LENGTH        = 90;
const FOCAL_LENGTH_STRING = `${FOCAL_LENGTH}mm`;

const PATH_ROOT                     = '/';
const PATH_GRID                     = '/grid';
const PATH_FULL                     = '/full';
const PATH_ADMIN                    = '/admin/photos';
const PATH_OG                       = '/og';
const PATH_OG_ALL                   = `${PATH_OG}/all`;
const PATH_OG_SAMPLE                = `${PATH_OG}/sample`;

const PATH_PHOTO                    = `/${PHOTO_ID}`;

const PATH_TAG                      = `/tag/${TAG}`;
const PATH_TAG_PHOTO                = `${PATH_TAG}/${PHOTO_ID}`;

const PATH_TAG_PRIVATE               = `/tag/${TAG_PRIVATE}`;
const PATH_TAG_PRIVATE_PHOTO         = `${PATH_TAG_PRIVATE}/${PHOTO_ID}`;

const PATH_CAMERA                   = `/shot-on/${CAMERA_MAKE}/${CAMERA_MODEL}`;
const PATH_CAMERA_PHOTO             = `${PATH_CAMERA}/${PHOTO_ID}`;

const PATH_FILM                     = `/film/${FILM}`;
const PATH_FILM_PHOTO               = `${PATH_FILM}/${PHOTO_ID}`;

const PATH_FOCAL_LENGTH             = `/focal/${FOCAL_LENGTH_STRING}`;
const PATH_FOCAL_LENGTH_PHOTO       = `${PATH_FOCAL_LENGTH}/${PHOTO_ID}`;
 
describe('Paths', () => {
  it.each(['2026', '-44'])('accepts an integer archive year %s', year => {
    expect(isValidMediaYear(year)).toBe(true);
  });

  it.each(['recent', '2026-11', '2e3', '1'.repeat(30)])(
    'rejects an invalid archive year %s before querying media', year => {
      expect(isValidMediaYear(year)).toBe(false);
    },
  );

  it.each([
    ['/admin/photos', '/admin/media', true],
    ['/admin/photos/updates', '/admin/media/updates', true],
    ['/admin/photos/abc/edit', '/admin/media/abc/edit', false],
  ] as const)('recognizes the legacy media library route %s', (
    alias, canonical, topLevel,
  ) => {
    expect(getCanonicalAdminMediaPath(alias)).toBe(canonical);
    expect(isPathAdminMedia(alias)).toBe(true);
    expect(isPathTopLevelAdmin(alias)).toBe(topLevel);
    expect(getCanonicalAdminMediaPath('/admin/photoshoot')).toBe('/admin/photoshoot');
  });

  it.each([
    ['category', '/category', pathForCategory],
    ['studio', '/studio', pathForStudio],
    ['performer', '/performer', pathForPerformer],
    ['contentType', '/content-type', pathForContentType],
  ] as const)('preserves punctuation in %s links', (key, prefix, makePath) => {
    const value = 'R&D / Studio #1? 100%';
    const parent = makePath(value);
    const detail = pathForMedia({ photo: PHOTO_ID, [key]: value });
    const url = new URL(detail, 'https://media.example');

    expect(parent).toBe(`${prefix}/${encodeURIComponent(value)}`);
    expect(url.pathname).toBe(`${parent}/${PHOTO_ID}`);
    expect(url.search + url.hash).toBe('');
    expect(getEscapePath(url.pathname)).toBe(parent);
  });

  it('keeps the search query and sort together on root detail links', () => {
    const query = getMediaSearchQuery(['  R&D / Studio #1 + rain  ', 'ignored']);
    const path = pathForMedia({ photo: PHOTO_ID, sortBy: 'createdAtAsc', query });
    const url = new URL(path, 'https://media.example');

    expect(url.pathname).toBe(PATH_PHOTO);
    expect(url.searchParams.get('sort')).toBe('createdAtAsc');
    expect(url.searchParams.get('query')).toBe('R&D / Studio #1 + rain');
    expect(url.hash).toBe('');
    expect(pathForMedia({ photo: PHOTO_ID, tag: TAG, query })).toBe(PATH_TAG_PHOTO);
    expect(getMediaSearchQuery('   ')).toBeUndefined();
  });

  it.each([
    ['/recents', { recent: true }],
    ['/year/2025', { year: '2025' }],
    ['/album/spring', { album: 'spring' }],
    ['/recipe/daylight', { recipe: 'daylight' }],
    ['/lens/-/35mm', { lens: { model: '35mm' } }],
    ['/lens/sony/35mm', { lens: { make: 'sony', model: '35mm' } }],
    ['/category/summer%20days', { category: 'summer%20days' }],
    ['/studio/a', { studio: 'a' }],
    ['/performer/b', { performer: 'b' }],
    ['/content-type/music', { contentType: 'music' }],
    ['/tag/private', { tag: 'private' }],
  ] as const)('preserves the collection path for %s', (parent, components) => {
    const detail = `${parent}/${PHOTO_ID}/`;
    expect(getPathComponents(detail)).toEqual({ ...components, photoId: PHOTO_ID });
    expect(getEscapePath(detail)).toBe(parent);
    expect(getEscapePath(parent)).toBe(PATH_ROOT);
  });

  it.each([
    '/search', '/profile', '/favorites', '/sign-up', '/verify-login',
    '/password-reset', '/verify-email', '/film-demo', '/template-image',
    '/template-image-tight', '/template-url', '/favicon.ico', '/recents/image',
    '/album/spring/image', '/tag/x/id/extra', '/unknown/nested',
  ])('keeps media keyboard navigation off %s', path => {
    expect(isPathMedia(path)).toBe(false);
    expect(getPathComponents(path)).toEqual({});
    expect(getEscapePath(path)).toBeUndefined();
  });

  it('matches complete route segments when showing navigation controls', () => {
    expect(doesPathOfferSort('/grid/taken-at/ascending')).toBe(true);
    expect(doesPathOfferSort('/grid123')).toBe(false);
    expect(isPathProtected('/og123')).toBe(false);
  });
  it('preserves the page that opened the media editor', () => {
    expect(pathForAdminMediaEdit(PHOTO_ID, PATH_TAG_PHOTO)).toBe(
      `/admin/media/${PHOTO_ID}/edit?returnTo=${encodeURIComponent(
        PATH_TAG_PHOTO,
      )}`,
    );
  });
  it('can be protected', () => {
    // Public
    expect(isPathProtected(PATH_ROOT)).toBe(false);
    expect(isPathProtected(PATH_PHOTO)).toBe(false);
    expect(isPathProtected(PATH_TAG)).toBe(false);
    expect(isPathProtected(PATH_TAG_PHOTO)).toBe(false);
    expect(isPathProtected(PATH_CAMERA)).toBe(false);
    expect(isPathProtected(PATH_FILM)).toBe(false);
    // Private
    expect(isPathProtected(PATH_ADMIN)).toBe(true);
    expect(isPathProtected(PATH_OG)).toBe(true);
    expect(isPathProtected(PATH_OG_ALL)).toBe(true);
    expect(isPathProtected(PATH_OG_SAMPLE)).toBe(true);
    expect(isPathProtected(PATH_TAG_PRIVATE)).toBe(true);
    expect(isPathProtected(PATH_TAG_PRIVATE_PHOTO)).toBe(true);
  });
  it('can be classified', () => {
    // Positive
    expect(isPathMedia(PATH_PHOTO)).toBe(true);
    expect(isPathTag(PATH_TAG)).toBe(true);
    expect(isPathTagMedia(PATH_TAG_PHOTO)).toBe(true);
    expect(isPathCamera(PATH_CAMERA)).toBe(true);
    expect(isPathCameraMedia(PATH_CAMERA_PHOTO)).toBe(true);
    expect(isPathFilm(PATH_FILM)).toBe(true);
    expect(isPathFilmMedia(PATH_FILM_PHOTO)).toBe(true);
    expect(isPathFocalLength(PATH_FOCAL_LENGTH)).toBe(true);
    expect(isPathFocalLengthMedia(PATH_FOCAL_LENGTH_PHOTO)).toBe(true);
    // Negative
    expect(isPathFocalLength(PATH_FILM)).toBe(false);
    expect(isPathFocalLengthMedia(PATH_FILM_PHOTO)).toBe(false);
  });
  it('can be parsed', () => {
    // Core
    expect(getPathComponents(PATH_ROOT)).toEqual({});
    expect(getPathComponents(PATH_PHOTO)).toEqual({
      photoId: PHOTO_ID,
    });
    // Tag
    expect(getPathComponents(PATH_TAG)).toEqual({
      tag: TAG,
    });
    expect(getPathComponents(PATH_TAG_PHOTO)).toEqual({
      photoId: PHOTO_ID,
      tag: TAG,
    });
    // Camera
    expect(getPathComponents(PATH_CAMERA)).toEqual({
      camera: CAMERA_OBJECT,
    });
    expect(getPathComponents(PATH_CAMERA_PHOTO)).toEqual({
      photoId: PHOTO_ID,
      camera: CAMERA_OBJECT,
    });
    // Film
    expect(getPathComponents(PATH_FILM)).toEqual({
      film: FILM,
    });
    expect(getPathComponents(PATH_FILM_PHOTO)).toEqual({
      photoId: PHOTO_ID,
      film: FILM,
    });
    // Focal Length
    expect(getPathComponents(PATH_FOCAL_LENGTH)).toEqual({
      focal: FOCAL_LENGTH,
    });
    expect(getPathComponents(PATH_FOCAL_LENGTH_PHOTO)).toEqual({
      photoId: PHOTO_ID,
      focal: FOCAL_LENGTH,
    });
  });
  it('can be escaped', () => {
    // Root
    expect(getEscapePath(PATH_ROOT)).toEqual(undefined);
    expect(getEscapePath(PATH_GRID)).toEqual(undefined);
    expect(getEscapePath(PATH_FULL)).toEqual(undefined);
    expect(getEscapePath(PATH_ADMIN)).toEqual(undefined);
    // Media
    expect(getEscapePath(PATH_PHOTO)).toEqual(PATH_ROOT);
    // Tag
    expect(getEscapePath(PATH_TAG)).toEqual(PATH_ROOT);
    expect(getEscapePath(PATH_TAG_PHOTO)).toEqual(PATH_TAG);
    // Camera
    expect(getEscapePath(PATH_CAMERA)).toEqual(PATH_ROOT);
    expect(getEscapePath(PATH_CAMERA_PHOTO)).toEqual(PATH_CAMERA);
    // Film
    expect(getEscapePath(PATH_FILM)).toEqual(PATH_ROOT);
    expect(getEscapePath(PATH_FILM_PHOTO)).toEqual(PATH_FILM);
    // Focal Length
    expect(getEscapePath(PATH_FOCAL_LENGTH)).toEqual(PATH_ROOT);
    expect(getEscapePath(PATH_FOCAL_LENGTH_PHOTO)).toEqual(PATH_FOCAL_LENGTH);
  });
});
