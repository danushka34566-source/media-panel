import { Media } from '@/media';
import { MediaSetCategory } from '@/category';
import { getBaseUrl, GRID_HOMEPAGE_ENABLED } from './config';
import { Camera } from '@/camera';
import { parameterize } from '@/utility/string';
import { TAG_PRIVATE } from '@/tag';
import { Lens } from '@/lens';
import { AlbumOrAlbumSlug } from '@/album';

// Core
export const PATH_ROOT                  = '/';
export const PATH_GRID                  = '/grid';
export const PATH_FULL                  = '/full';
export const PATH_ADMIN                 = '/admin';
export const PATH_API                   = '/api';
export const PATH_SIGN_IN               = '/sign-in';
export const PATH_SETUP                 = '/setup';
export const PATH_ACCESS_DENIED         = '/access-denied';
export const PATH_VERIFY_LOGIN          = '/verify-login';
export const PATH_PROFILE               = '/profile';
export const PATH_FAVORITES             = '/favorites';
export const PATH_OG                    = '/og';
export const PATH_SEARCH                = '/search';

// Core: inferred
export const PATH_GRID_INFERRED = GRID_HOMEPAGE_ENABLED
  ? PATH_ROOT
  : PATH_GRID;
export const PATH_FULL_INFERRED = GRID_HOMEPAGE_ENABLED
  ? PATH_FULL
  : PATH_ROOT;

// Sort
export const PARAM_SORT_TYPE_TAKEN_AT     = 'taken-at';
export const PARAM_SORT_TYPE_UPLOADED_AT  = 'uploaded-at';
export const PARAM_SORT_TYPE_COLOR        = 'chromatic';
export const PARAM_SORT_ORDER_DESCENDING  = 'descending';
export const PARAM_SORT_ORDER_ASCENDING   = 'ascending';
export const doesPathOfferSort = (pathname: string) =>
  pathname === PATH_ROOT ||
  pathname.startsWith(PATH_GRID) ||
  pathname.startsWith(PATH_FULL);

// Feeds
export const PATH_SITEMAP               = '/sitemap.xml';
export const PATH_RSS_XML               = '/rss.xml';
export const PATH_FEED_JSON             = '/feed.json';

// Path prefixes
export const PREFIX_CAMERA              = '/shot-on';
export const PREFIX_LENS                = '/lens';
export const PREFIX_ALBUM               = '/album';
export const PREFIX_TAG                 = '/tag';
export const PREFIX_CATEGORY            = '/category';
export const PREFIX_STUDIO              = '/studio';
export const PREFIX_PERFORMER           = '/performer';
export const PREFIX_CONTENT_TYPE        = '/content-type';
export const PREFIX_RECIPE              = '/recipe';
export const PREFIX_FILM                = '/film';
export const PREFIX_FOCAL_LENGTH        = '/focal';
export const PREFIX_YEAR                = '/year';
export const PREFIX_RECENTS             = '/recents';

// Dynamic paths
const PATH_MEDIA_ROOT_DYNAMIC           = `/[photoId]`;
const PATH_CAMERA_DYNAMIC               = `${PREFIX_CAMERA}/[make]/[model]`;
const PATH_LENS_DYNAMIC                 = `${PREFIX_LENS}/[make]/[model]`;
const PATH_ALBUM_DYNAMIC                = `${PREFIX_ALBUM}/[album]`;
const PATH_TAG_DYNAMIC                  = `${PREFIX_TAG}/[tag]`;
const PATH_CATEGORY_DYNAMIC             = `${PREFIX_CATEGORY}/[category]`;
const PATH_STUDIO_DYNAMIC               = `${PREFIX_STUDIO}/[studio]`;
const PATH_PERFORMER_DYNAMIC            = `${PREFIX_PERFORMER}/[performer]`;
const PATH_CONTENT_TYPE_DYNAMIC         = `${PREFIX_CONTENT_TYPE}/[contentType]`;
const PATH_FILM_DYNAMIC                 = `${PREFIX_FILM}/[film]`;
const PATH_FOCAL_LENGTH_DYNAMIC         = `${PREFIX_FOCAL_LENGTH}/[focal]`;
const PATH_RECIPE_DYNAMIC               = `${PREFIX_RECIPE}/[recipe]`;
const PATH_YEAR_DYNAMIC                 = `${PREFIX_YEAR}/[year]`;
const PATH_RECENTS_DYNAMIC              = `${PREFIX_RECENTS}/[photoId]`;

// Admin paths
// Renamed route: use /admin/media instead of /admin/photos
export const PATH_ADMIN_MEDIA          = `${PATH_ADMIN}/media`;
export const PATH_ADMIN_MEDIA_UPDATES  = `${PATH_ADMIN_MEDIA}/updates`;
export const PATH_ADMIN_PHOTOS          = PATH_ADMIN_MEDIA;
export const PATH_ADMIN_PHOTOS_UPDATES  = PATH_ADMIN_MEDIA_UPDATES;
export const PATH_ADMIN_UPLOADS         = `${PATH_ADMIN}/uploads`;
export const PATH_ADMIN_PROCESSING      = `${PATH_ADMIN}/processing`;
export const PATH_ADMIN_ALBUMS          = `${PATH_ADMIN}/albums`;
export const PATH_ADMIN_CATEGORIES      = `${PATH_ADMIN}/categories`;
export const PATH_ADMIN_STUDIOS         = `${PATH_ADMIN}/studios`;
export const PATH_ADMIN_PERFORMERS      = `${PATH_ADMIN}/performers`;
export const PATH_ADMIN_CONTENT_TYPES   = `${PATH_ADMIN}/content-types`;
export const PATH_ADMIN_TAGS            = `${PATH_ADMIN}/tags`;
export const PATH_ADMIN_RECIPES         = `${PATH_ADMIN}/recipes`;
export const PATH_ADMIN_CONFIGURATION   = `${PATH_ADMIN}/configuration`;
export const PATH_ADMIN_INSIGHTS        = `${PATH_ADMIN}/insights`;
export const PATH_ADMIN_STATS           = `${PATH_ADMIN}/stats`;
export const PATH_ADMIN_BASELINE        = `${PATH_ADMIN}/baseline`;
export const PATH_ADMIN_COMPONENTS      = `${PATH_ADMIN}/components`;
export const PATH_ADMIN_USERS           = `${PATH_ADMIN}/users`;

// Debug paths
export const PATH_OG_ALL                = `${PATH_OG}/all`;
export const PATH_OG_SAMPLE             = `${PATH_OG}/sample`;

// API paths
export const PATH_API_STORAGE = `${PATH_API}/storage`;
export const PATH_API_PRESIGNED_URL = `${PATH_API_STORAGE}/presigned-url`;
export const PATH_API_STORAGE_MULTIPART = `${PATH_API_STORAGE}/multipart`;

// Modifiers
const EDIT = 'edit';
const IMAGE = 'image';
export const PARAM_UPLOAD_TITLE = 'title';
export const PARAM_UPLOAD_ORIGINAL_NAME = 'original';
export const PARAM_SELECT = 'select';

// Special characters
export const MISSING_FIELD = '-';

export const PATHS_ADMIN = [
  PATH_ADMIN,
  PATH_ADMIN_MEDIA,
  PATH_ADMIN_MEDIA_UPDATES,
  PATH_ADMIN_UPLOADS,
  PATH_ADMIN_PROCESSING,
  PATH_ADMIN_ALBUMS,
  PATH_ADMIN_CATEGORIES,
  PATH_ADMIN_STUDIOS,
  PATH_ADMIN_PERFORMERS,
  PATH_ADMIN_CONTENT_TYPES,
  PATH_ADMIN_TAGS,
  PATH_ADMIN_RECIPES,
  PATH_ADMIN_INSIGHTS,
  PATH_ADMIN_STATS,
  PATH_ADMIN_CONFIGURATION,
  PATH_ADMIN_BASELINE,
  PATH_ADMIN_COMPONENTS,
  PATH_ADMIN_USERS,
];

export const PATHS_TO_CACHE = [
  PATH_ROOT,
  PATH_GRID,
  PATH_FULL,
  PATH_OG,
  PATH_MEDIA_ROOT_DYNAMIC,
  PATH_CAMERA_DYNAMIC,
  PATH_LENS_DYNAMIC,
  PATH_ALBUM_DYNAMIC,
  PATH_TAG_DYNAMIC,
  PATH_CATEGORY_DYNAMIC,
  PATH_STUDIO_DYNAMIC,
  PATH_PERFORMER_DYNAMIC,
  PATH_CONTENT_TYPE_DYNAMIC,
  PATH_FILM_DYNAMIC,
  PATH_FOCAL_LENGTH_DYNAMIC,
  PATH_RECIPE_DYNAMIC,
  PATH_YEAR_DYNAMIC,
  PATH_RECENTS_DYNAMIC,
  ...PATHS_ADMIN,
];

type MediaPathParams  = { photo: MediaOrMediaId } & MediaSetCategory & {
  showRecipe?: boolean
};

const getMediaId = (photoOrMediaId: MediaOrMediaId) =>
  typeof photoOrMediaId === 'string'
    ? photoOrMediaId
    : photoOrMediaId.id;

const getAlbumSlug = (albumOrAlbumSlug: AlbumOrAlbumSlug) =>
  typeof albumOrAlbumSlug === 'string'
    ? albumOrAlbumSlug
    : albumOrAlbumSlug.slug;

export const pathForAdminUploadUrl = (
  url: string,
  title?: string,
  originalFileName?: string,
) => {
  const params = new URLSearchParams();
  if (title) { params.set(PARAM_UPLOAD_TITLE, title); }
  if (originalFileName) { params.set(PARAM_UPLOAD_ORIGINAL_NAME, originalFileName); }
  const queryString = params.toString();
  return `${PATH_ADMIN_UPLOADS}/${encodeURIComponent(url)}${queryString ? `?${queryString}` : ''}`;
};

export const pathForAdminMediaEdit = (
  photo: MediaOrMediaId,
  returnTo?: string,
) => {
  const path = `${PATH_ADMIN_MEDIA}/${getMediaId(photo)}/${EDIT}`;
  return returnTo
    ? `${path}?returnTo=${encodeURIComponent(returnTo)}`
    : path;
};

export const pathForAdminAlbumEdit = (album: AlbumOrAlbumSlug) =>
  `${PATH_ADMIN_ALBUMS}/${getAlbumSlug(album)}/${EDIT}`;

export const pathForAdminTagEdit = (tag: string) =>
  `${PATH_ADMIN_TAGS}/${tag}/${EDIT}`;

export const pathForAdminRecipeEdit = (recipe: string) =>
  `${PATH_ADMIN_RECIPES}/${recipe}/${EDIT}`;

type MediaOrMediaId = Media | string;

export const pathForMedia = ({
  photo,
  recent,
  year,
  camera,
  lens,
  album,
  tag,
  category,
  studio,
  performer,
  contentType,
  film,
  focal,
  recipe,
}: MediaPathParams) => {
  // Default to root (no trailing slash) to avoid generating //{id}
  let prefix = '';

  if (typeof photo !== 'string' && photo.hidden) {
    prefix = pathForTag(TAG_PRIVATE);
  } else if (recent) {
    prefix = PREFIX_RECENTS;
  } else if (year) {
    prefix = pathForYear(year);
  } else if (camera) {
    prefix = pathForCamera(camera);
  } else if (lens) {
    prefix = pathForLens(lens);
  } else if (album) {
    prefix = pathForAlbum(album);
  } else if (tag) {
    prefix = pathForTag(tag);
  } else if (category) {
    prefix = pathForCategory(category);
  } else if (studio) {
    prefix = pathForStudio(studio);
  } else if (performer) {
    prefix = pathForPerformer(performer);
  } else if (contentType) {
    prefix = pathForContentType(contentType);
  } else if (recipe) {
    prefix = pathForRecipe(recipe);
  } else if (film) {
    prefix = pathForFilm(film);
  } else if (focal) {
    prefix = pathForFocalLength(focal);
  }

  return `${prefix}/${getMediaId(photo)}`;
};

export const pathForYear = (year: string) =>
  `${PREFIX_YEAR}/${year}`;

export const pathForCamera = ({ make, model }: Camera) =>
  `${PREFIX_CAMERA}/${parameterize(make)}/${parameterize(model)}`;

export const pathForLens = ({ make, model }: Lens) =>
  make
    ? `${PREFIX_LENS}/${parameterize(make)}/${parameterize(model)}`
    : `${PREFIX_LENS}/${MISSING_FIELD}/${parameterize(model)}`;

export const pathForAlbum = (album: AlbumOrAlbumSlug) =>
  `${PREFIX_ALBUM}/${getAlbumSlug(album)}`;

export const pathForTag = (tag: string) =>
  `${PREFIX_TAG}/${tag}`;

export const pathForCategory = (category: string) =>
  `${PREFIX_CATEGORY}/${category}`;

export const pathForStudio = (studio: string) =>
  `${PREFIX_STUDIO}/${studio}`;

export const pathForPerformer = (performer: string) =>
  `${PREFIX_PERFORMER}/${performer}`;

export const pathForContentType = (contentType: string) =>
  `${PREFIX_CONTENT_TYPE}/${contentType}`;

export const pathForSearch = (query: string) => {
  const params = new URLSearchParams();
  params.set('query', query);
  return `${PATH_SEARCH}?${params.toString()}`;
};

export const pathForRecipe = (recipe: string) =>
  `${PREFIX_RECIPE}/${recipe}`;

export const pathForFilm = (film: string) =>
  `${PREFIX_FILM}/${film}`;

export const pathForFocalLength = (focal: number) =>
  `${PREFIX_FOCAL_LENGTH}/${focal}mm`;

// Image paths
const pathForImage = (path: string) =>
  `${path}/${IMAGE}`;

export const pathForMediaImage = (photo: MediaOrMediaId) =>
  pathForImage(pathForMedia({ photo }));

export const pathForCameraImage = (camera: Camera) =>
  pathForImage(pathForCamera(camera));

export const pathForLensImage = (lens: Lens) =>
  pathForImage(pathForLens(lens));

export const pathForAlbumImage = (album: AlbumOrAlbumSlug) =>
  pathForImage(pathForAlbum(album));

export const pathForTagImage = (tag: string) =>
  pathForImage(pathForTag(tag));

export const pathForCategoryImage = (category: string) =>
  pathForImage(pathForCategory(category));

export const pathForStudioImage = (studio: string) =>
  pathForImage(pathForStudio(studio));

export const pathForPerformerImage = (performer: string) =>
  pathForImage(pathForPerformer(performer));

export const pathForContentTypeImage = (contentType: string) =>
  pathForImage(pathForContentType(contentType));

export const pathForRecipeImage = (recipe: string) =>
  pathForImage(pathForRecipe(recipe));

export const pathForFilmImage = (film: string) =>
  pathForImage(pathForFilm(film));

export const pathForFocalLengthImage = (focal: number) =>
  pathForImage(pathForFocalLength(focal));

export const pathForYearImage = (year: string) =>
  pathForImage(pathForYear(year));

export const pathForRecentsImage = () =>
  pathForImage(PREFIX_RECENTS);

// Absolute paths
export const ABSOLUTE_PATH_GRID =
  `${getBaseUrl()}${PATH_GRID}`;

export const ABSOLUTE_PATH_FULL =
  `${getBaseUrl()}${PATH_FULL}`;

export const ABSOLUTE_PATH_FEED_JSON =
  `${getBaseUrl()}${PATH_FEED_JSON}`;

export const ABSOLUTE_PATH_RSS_XML =
  `${getBaseUrl()}${PATH_RSS_XML}`;

export const ABSOLUTE_PATH_HOME_IMAGE =
  `${getBaseUrl()}/home-image`;

export const absolutePathForMedia = (
  params: MediaPathParams,
  share?: boolean,
) =>
  `${getBaseUrl(share)}${pathForMedia(params)}`;

export const absolutePathForCamera= (camera: Camera, share?: boolean) =>
  `${getBaseUrl(share)}${pathForCamera(camera)}`;

export const absolutePathForLens= (lens: Lens, share?: boolean) =>
  `${getBaseUrl(share)}${pathForLens(lens)}`;
  
export const absolutePathForAlbum = (
  album: AlbumOrAlbumSlug,
  share?: boolean,
) =>
  `${getBaseUrl(share)}${pathForAlbum(album)}`;

export const absolutePathForTag = (tag: string, share?: boolean) =>
  `${getBaseUrl(share)}${pathForTag(tag)}`;

export const absolutePathForCategory = (category: string, share?: boolean) =>
  `${getBaseUrl(share)}${pathForCategory(category)}`;

export const absolutePathForStudio = (studio: string, share?: boolean) =>
  `${getBaseUrl(share)}${pathForStudio(studio)}`;

export const absolutePathForPerformer = (performer: string, share?: boolean) =>
  `${getBaseUrl(share)}${pathForPerformer(performer)}`;

export const absolutePathForContentType = (contentType: string, share?: boolean) =>
  `${getBaseUrl(share)}${pathForContentType(contentType)}`;

export const absolutePathForRecipe = (recipe: string, share?: boolean) =>
  `${getBaseUrl(share)}${pathForRecipe(recipe)}`;

export const absolutePathForFilm = (film: string, share?: boolean) =>
  `${getBaseUrl(share)}${pathForFilm(film)}`;

export const absolutePathForFocalLength = (focal: number, share?: boolean) =>
  `${getBaseUrl(share)}${pathForFocalLength(focal)}`;

export const absolutePathForYear = (year: string, share?: boolean) =>
  `${getBaseUrl(share)}${pathForYear(year)}`;

export const absolutePathForRecents = (share?: boolean) =>
  `${getBaseUrl(share)}${PREFIX_RECENTS}`;

export const absolutePathForMediaImage = (photo: MediaOrMediaId) =>
  `${absolutePathForMedia({ photo })}/${IMAGE}`;

export const absolutePathForCameraImage= (camera: Camera) =>
  `${absolutePathForCamera(camera)}/${IMAGE}`;

export const absolutePathForLensImage= (lens: Lens) =>
  `${absolutePathForLens(lens)}/${IMAGE}`;

export const absolutePathForAlbumImage = (album: AlbumOrAlbumSlug) =>
  `${absolutePathForAlbum(album)}/${IMAGE}`;

export const absolutePathForTagImage = (tag: string) =>
  `${absolutePathForTag(tag)}/${IMAGE}`;

export const absolutePathForCategoryImage = (category: string) =>
  `${absolutePathForCategory(category)}/${IMAGE}`;

export const absolutePathForStudioImage = (studio: string) =>
  `${absolutePathForStudio(studio)}/${IMAGE}`;

export const absolutePathForPerformerImage = (performer: string) =>
  `${absolutePathForPerformer(performer)}/${IMAGE}`;

export const absolutePathForContentTypeImage = (contentType: string) =>
  `${absolutePathForContentType(contentType)}/${IMAGE}`;

export const absolutePathForRecipeImage = (recipe: string) =>
  `${absolutePathForRecipe(recipe)}/${IMAGE}`;

export const absolutePathForFilmImage = (film: string) =>
  `${absolutePathForFilm(film)}/${IMAGE}`;

export const absolutePathForFocalLengthImage = (focal: number) =>
  `${absolutePathForFocalLength(focal)}/${IMAGE}`;
    
export const absolutePathForYearImage = (year: string) =>
  `${absolutePathForYear(year)}/${IMAGE}`;

export const absolutePathForRecentsImage = () =>
  `${absolutePathForRecents()}/${IMAGE}`;

// /[photoId]
export const isPathMedia = (pathname = '') => {
  // Single-segment root media detail path that is not a reserved prefix.
  const seg = pathname.split('/').filter(Boolean);
  if (seg.length !== 1) { return false; }
  const first = seg[0];
  const reserved = new Set([
    '', 'grid', 'full', 'admin', 'api', 'sign-in', 'setup', 'access-denied', 'og', 'home-image',
    'shot-on', 'lens', 'album', 'tag', 'category', 'studio', 'performer', 'content-type', 'recipe', 'film', 'focal', 'year', 'recents',
    'sitemap.xml', 'rss.xml', 'feed.json',
  ]);
  return !reserved.has(first);
};

// recents
export const isPathRecents = (pathname = '') =>
  new RegExp(`^${PREFIX_RECENTS}/?$`).test(pathname);

// recents/[photoId]
export const isPathRecentsMedia = (pathname = '') =>
  new RegExp(`^${PREFIX_RECENTS}/[^/]+/?$`).test(pathname);

// year/[year]
export const isPathYear = (pathname = '') =>
  new RegExp(`^${PREFIX_YEAR}/[^/]+/?$`).test(pathname);

// year/[year]/[photoId]
export const isPathYearMedia = (pathname = '') =>
  new RegExp(`^${PREFIX_YEAR}/[^/]+/[^/]+/?$`).test(pathname);

// shot-on/[make]/[model]
export const isPathCamera = (pathname = '') =>
  new RegExp(`^${PREFIX_CAMERA}/[^/]+/[^/]+/?$`).test(pathname);

// shot-on/[make]/[model]/[photoId]
export const isPathCameraMedia = (pathname = '') =>
  new RegExp(`^${PREFIX_CAMERA}/[^/]+/[^/]+/[^/]+/?$`).test(pathname);

// lens/[make]/[model]
export const isPathLens = (pathname = '') =>
  new RegExp(`^${PREFIX_LENS}/[^/]+/[^/]+/?$`).test(pathname);

// lens/[make]/[model]/[photoId]
export const isPathLensMedia = (pathname = '') =>
  new RegExp(`^${PREFIX_LENS}/[^/]+/[^/]+/[^/]+/?$`).test(pathname);

// album/[album]
export const isPathAlbum = (pathname = '') =>
  new RegExp(`^${PREFIX_ALBUM}/[^/]+/?$`).test(pathname);

// album/[album]/[photoId]
export const isPathAlbumMedia = (pathname = '') =>
  new RegExp(`^${PREFIX_ALBUM}/[^/]+/[^/]+/?$`).test(pathname);

// tag/[tag]
export const isPathTag = (pathname = '') =>
  new RegExp(`^${PREFIX_TAG}/[^/]+/?$`).test(pathname);

// tag/[tag]/[photoId]
export const isPathTagMedia = (pathname = '') =>
  new RegExp(`^${PREFIX_TAG}/[^/]+/[^/]+/?$`).test(pathname);

// recipe/[recipe]
export const isPathRecipe = (pathname = '') =>
  new RegExp(`^${PREFIX_RECIPE}/[^/]+/?$`).test(pathname);

// recipe/[recipe]/[photoId]
export const isPathRecipeMedia = (pathname = '') =>
  new RegExp(`^${PREFIX_RECIPE}/[^/]+/[^/]+/?$`).test(pathname);

// film/[film]
export const isPathFilm = (pathname = '') =>
  new RegExp(`^${PREFIX_FILM}/[^/]+/?$`).test(pathname);

// film/[film]/[photoId]
export const isPathFilmMedia = (pathname = '') =>
  new RegExp(`^${PREFIX_FILM}/[^/]+/[^/]+/?$`).test(pathname);

// focal/[focal]
export const isPathFocalLength = (pathname = '') =>
  new RegExp(`^${PREFIX_FOCAL_LENGTH}/[^/]+/?$`).test(pathname);

// focal/[focal]/[photoId]
export const isPathFocalLengthMedia = (pathname = '') =>
  new RegExp(`^${PREFIX_FOCAL_LENGTH}/[^/]+/[^/]+/?$`).test(pathname);

export const checkPathPrefix = (pathname = '', prefix: string) =>
  pathname.toLowerCase().startsWith(prefix);

export const isPathRoot = (pathname?: string) =>
  pathname === PATH_ROOT;

export const isPathGrid = (pathname?: string) =>
  checkPathPrefix(pathname, PATH_GRID);

export const isPathFull = (pathname?: string) =>
  checkPathPrefix(pathname, PATH_FULL);

export const isPathTopLevel = (pathname?: string) =>
  isPathRoot(pathname)||
  isPathGrid(pathname) ||
  isPathFull(pathname);

export const isPathSignIn = (pathname?: string) =>
  checkPathPrefix(pathname, PATH_SIGN_IN);

export const isPathAdmin = (pathname?: string) =>
  checkPathPrefix(pathname, PATH_ADMIN);

export const isPathTopLevelAdmin = (pathname?: string) =>
  PATHS_ADMIN.some(path => path === pathname);

export const isPathAdminMedia = (pathname?: string) =>
  checkPathPrefix(pathname, PATH_ADMIN_MEDIA);

export const isPathAdminInsights = (pathname?: string) =>
  checkPathPrefix(pathname, PATH_ADMIN_INSIGHTS);

export const isPathAdminStats = (pathname?: string) =>
  checkPathPrefix(pathname, PATH_ADMIN_STATS);

export const isPathAdminConfiguration = (pathname?: string) =>
  checkPathPrefix(pathname, PATH_ADMIN_CONFIGURATION);

export const isPathAdminInfo = (pathname?: string) =>
  isPathAdminInsights(pathname) ||
  isPathAdminStats(pathname) ||
  isPathAdminConfiguration(pathname);

export const isPathProtected = (pathname?: string) =>
  checkPathPrefix(pathname, PATH_ADMIN) ||
  checkPathPrefix(pathname, PATH_PROFILE) ||
  checkPathPrefix(pathname, PATH_FAVORITES) ||
  checkPathPrefix(pathname, PATH_VERIFY_LOGIN) ||
  checkPathPrefix(pathname, pathForTag(TAG_PRIVATE)) ||
  checkPathPrefix(pathname, PATH_OG);

export const getPathComponents = (
  pathname = '',
): (Omit<MediaSetCategory, 'album'> & {
  album?: string
  photoId?: string
}) => {
  // Root-based photo path: /[photoId]
  const maybeRootId = pathname.match(new RegExp(`^/([^/]+)`))?.[1];
  const reserved = new Set([
    'grid', 'full', 'admin', 'api', 'sign-in', 'sign-up', 'verify-email',
    'setup', 'access-denied', 'favorites',
    'password-reset', 'profile', 'og', 'home-image',
    'verify-login',
    'shot-on', 'lens', 'album', 'tag', 'recipe', 'film', 'focal', 'year', 'recents',
    'sitemap.xml', 'rss.xml', 'feed.json',
  ]);
  const photoIdFromRoot = (maybeRootId && !reserved.has(maybeRootId)) ? maybeRootId : undefined;
  const photoIdFromCamera = pathname.match(
    new RegExp(`^${PREFIX_CAMERA}/[^/]+/[^/]+/([^/]+)`))?.[1];
  const cameraMake = pathname.match(
    new RegExp(`^${PREFIX_CAMERA}/([^/]+)`))?.[1];
  const cameraModel = pathname.match(
    new RegExp(`^${PREFIX_CAMERA}/[^/]+/([^/]+)`))?.[1];
  const photoIdFromTag = pathname.match(
    new RegExp(`^${PREFIX_TAG}/[^/]+/([^/]+)`))?.[1];
  const photoIdFromFilm = pathname.match(
    new RegExp(`^${PREFIX_FILM}/[^/]+/([^/]+)`))?.[1];
  const photoIdFromFocalLength = pathname.match(
    new RegExp(`^${PREFIX_FOCAL_LENGTH}/[0-9]+mm/([^/]+)`))?.[1];
  const photoIdFromYear = pathname.match(
    new RegExp(`^${PREFIX_YEAR}/[^/]+/([^/]+)`))?.[1];
  const photoIdFromRecents = pathname.match(
    new RegExp(`^${PREFIX_RECENTS}/([^/]+)`))?.[1];
  const album = pathname.match(
    new RegExp(`^${PREFIX_ALBUM}/([^/]+)`))?.[1];
  const tag = pathname.match(
    new RegExp(`^${PREFIX_TAG}/([^/]+)`))?.[1];
  const film = pathname.match(
    new RegExp(`^${PREFIX_FILM}/([^/]+)`))?.[1] as string;
  const focalString = pathname.match(
    new RegExp(`^${PREFIX_FOCAL_LENGTH}/([0-9]+)mm`))?.[1];
  const year = pathname.match(
    new RegExp(`^${PREFIX_YEAR}/([^/]+)`))?.[1];
  const recent = isPathRecents(pathname) ? true : undefined;

  const camera = cameraMake && cameraModel
    ? { make: cameraMake, model: cameraModel }
    : undefined;

  const focal = focalString ? parseInt(focalString) : undefined;

  return {
    photoId: (
      photoIdFromRoot ||
      photoIdFromTag ||
      photoIdFromCamera ||
      photoIdFromFilm ||
      photoIdFromFocalLength ||
      photoIdFromYear ||
      photoIdFromRecents
    ),
    album,
    tag,
    camera,
    film,
    focal,
    year,
    recent,
  };
};

export const getEscapePath = (pathname?: string) => {
  const {
    photoId,
    recent,
    year,
    camera,
    lens,
    album,
    tag,
    recipe,
    film,
    focal,
  } = getPathComponents(pathname);

  if (
    (photoId && isPathMedia(pathname)) ||
    (recent && isPathRecents(pathname)) ||
    (year && isPathYear(pathname)) ||
    (camera && isPathCamera(pathname)) ||
    (lens && isPathLens(pathname)) ||
    (tag && isPathTag(pathname)) ||
    (film && isPathFilm(pathname)) ||
    (focal && isPathFocalLength(pathname)) ||
    (recipe && isPathRecipe(pathname))
  ) {
    return PATH_ROOT;
  } else if (recent && isPathRecentsMedia(pathname)) {
    return PREFIX_RECENTS;
  } else if (year && isPathYearMedia(pathname)) {
    return pathForYear(year);
  } else if (camera && isPathCameraMedia(pathname)) {
    return pathForCamera(camera);
  } else if (lens && isPathLensMedia(pathname)) {
    return pathForLens(lens);
  } else if (album && isPathAlbumMedia(pathname)) {
    return pathForAlbum(album);
  } else if (tag && isPathTagMedia(pathname)) {
    return pathForTag(tag);
  } else if (recipe && isPathRecipeMedia(pathname)) {
    return pathForRecipe(recipe);
  } else if (film && isPathFilmMedia(pathname)) {
    return pathForFilm(film);
  } else if (focal && isPathFocalLengthMedia(pathname)) {
    return pathForFocalLength(focal);
  }
};
