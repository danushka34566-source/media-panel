import type { MetadataRoute } from 'next';
import { BASE_URL } from '@/app/config';
import {
  PATH_ACCESS_DENIED,
  PATH_ADMIN,
  PATH_API,
  PATH_FAVORITES,
  PATH_OG,
  PATH_PROFILE,
  PATH_ROOT,
  PATH_SETUP,
  PATH_SIGN_IN,
  PATH_SITEMAP,
  PATH_VERIFY_LOGIN,
  pathForTag,
} from '@/app/path';
import { isLocalAuthBypassRequested } from '@/auth/local-audit-bypass';
import { getSiteAccessSettingsForAuthorization } from '@/auth/site-access';
import { TAG_PRIVATE } from '@/tag';

export const dynamic = 'force-dynamic';

const blockedCrawlPaths = [
  PATH_ACCESS_DENIED,
  PATH_ADMIN,
  PATH_API,
  PATH_FAVORITES,
  PATH_OG,
  PATH_PROFILE,
  PATH_SETUP,
  PATH_SIGN_IN,
  PATH_VERIFY_LOGIN,
  pathForTag(TAG_PRIVATE),
  '/password-reset',
  '/sign-up',
  '/verify-email',
].flatMap(path => [`${path}$`, `${path}?`, `${path}/`]);

export default async function robots(): Promise<MetadataRoute.Robots> {
  if (
    isLocalAuthBypassRequested() ||
    (await getSiteAccessSettingsForAuthorization()).siteVisibility === 'private'
  ) {
    return { rules: { userAgent: '*', disallow: PATH_ROOT } };
  }

  return {
    rules: {
      userAgent: '*',
      allow: PATH_ROOT,
      disallow: blockedCrawlPaths,
    },
    sitemap: BASE_URL ? new URL(PATH_SITEMAP, BASE_URL).href : undefined,
  };
}
