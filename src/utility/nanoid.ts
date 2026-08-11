import { customAlphabet } from 'nanoid';

const NANOID_LENGTH = 8;

const NANOID_ALPHABET =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUMERIC_NANOID_ALPHABET = '0123456789';
const MEDIA_NANOID_LENGTH = 12;

export const generateNanoid =
  customAlphabet(NANOID_ALPHABET, NANOID_LENGTH);

export const generateMediaNanoid =
  customAlphabet(NUMERIC_NANOID_ALPHABET, MEDIA_NANOID_LENGTH);
