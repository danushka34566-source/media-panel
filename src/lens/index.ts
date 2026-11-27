import { Media } from '@/media';
import { MakeModelTextLength, parameterize } from '@/utility/string';
import { formatAppleLensText, isLensApple } from '../platforms/apple';
import { MISSING_FIELD } from '@/app/path';
import { formatGoogleLensText, isLensGoogle } from '../platforms/google-pixel';
import { CategoryQueryMeta } from '@/category';

const LENS_PLACEHOLDER: Lens = { make: 'Lens', model: 'Model' };

export type Lens = {
  make?: string
  model: string
};

type LensWithMediaId = Lens & { photoId: string };

export interface LensProps {
  params: Promise<Lens>
}

export interface LensMediaProps {
  params: Promise<LensWithMediaId>
}

export type LensWithMeta = {
  lensKey: string
  lens: Lens
} & CategoryQueryMeta;

export type Lenses = LensWithMeta[];

export const lensFromRouteSegments = ({ make, model }: Lens): Lens =>
  make === MISSING_FIELD ? { model } : { make, model };

const lensFromPageSegments = ({ make, model }: Lens): Lens =>
  lensFromRouteSegments({
    make: make === undefined ? undefined : decodeURIComponent(make),
    model: decodeURIComponent(model),
  });

export const getLensFromParams = async (params: Promise<Lens>): Promise<Lens> =>
  lensFromPageSegments(await params);

export const getLensMediaFromParams = async (
  params: Promise<LensWithMediaId>,
): Promise<LensWithMediaId> => {
  const { photoId, ...lens } = await params;
  return { ...lensFromPageSegments(lens), photoId };
};

export const safelyGenerateLensStaticParams = (
  lenses: Lenses,
) =>
  lenses.map(({ lens: { make, model } }) => ({
    make: make ? parameterize(make) : MISSING_FIELD,
    model: parameterize(model),
  }));

// Support keys for make-only and model-only lens queries
export const createLensKey = ({ make, model }: Partial<Lens>) =>
  parameterize(`${make ?? 'ANY'}-${model ?? 'ANY'}`);

export const formatLensParams = ({
  make,
  model,
}: {
  make?: string,
  model: string,
}): Lens => ({
  make: make ? parameterize(make) : undefined,
  model: parameterize(model),
});

export const sortLensesWithCount = (
  a: LensWithMeta,
  b: LensWithMeta,
) => {
  const aText = formatLensText(a.lens);
  const bText = formatLensText(b.lens);
  return aText.localeCompare(bText);
};

export const lensFromMedia = (
  photo: Media | undefined,
  fallback?: Lens,
): Lens =>
  photo?.lensModel
    ? { make: photo.lensMake, model: photo.lensModel }
    : fallback ?? LENS_PLACEHOLDER;

export const formatLensText = (
  lens: Lens,
  length: MakeModelTextLength = 'medium',
) => {
  const { make, model: modelRaw } = lens;

  // Capture simple make without modifiers like 'Corporation' or 'Company'
  const makeSimple = make?.match(/^(\S+)/)?.[1];
  const doesModelStartWithMake = (
    makeSimple &&
    modelRaw.toLocaleLowerCase().startsWith(makeSimple.toLocaleLowerCase())
  );

  const model = isLensApple(lens)
    ? formatAppleLensText(modelRaw, length !== 'short')
    : isLensGoogle(lens)
      ? formatGoogleLensText(modelRaw, length !== 'short')
      : doesModelStartWithMake
        ? modelRaw.replace(makeSimple, '').trim()
        : modelRaw;

  switch (length) {
    case 'long':
      return make ? `${make} ${modelRaw}` : modelRaw;
    case 'medium':
    case 'short':
      return model;
  }
};
