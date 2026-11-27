import { CategoryQueryMeta } from '@/category';

type YearWithMeta = { year: string } & CategoryQueryMeta;

export type Years = YearWithMeta[];

export const isValidMediaYear = (year: string) =>
  /^-?\d+$/.test(year) && Number.isSafeInteger(Number(year));
