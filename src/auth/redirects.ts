import { PATH_SIGN_IN, PATH_VERIFY_LOGIN } from '@/app/path';
import { getLocalPagePath } from '@/utility/url';
import { KEY_CALLBACK_URL } from './index';

export const getAuthCallbackPath = (value: unknown) => {
  const callback = getLocalPagePath(Array.isArray(value) ? value[0] : value);
  if (!callback) { return; }
  const pathname = decodeURIComponent(callback.split(/[?#]/, 1)[0])
    .replace(/\/+$/, '');
  if (pathname === PATH_SIGN_IN || pathname === PATH_VERIFY_LOGIN) { return; }
  return callback;
};

export const pathForAuthCallback = (pathname: string, callback?: string) =>
  callback
    ? `${pathname}?${new URLSearchParams({ [KEY_CALLBACK_URL]: callback })}`
    : pathname;
