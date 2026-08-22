import { NextResponse } from 'next/server';
import {
  BASE_URL,
  META_DESCRIPTION,
  NAV_CAPTION,
  PORTFOLIO_URL,
  TEMPLATE_DESCRIPTION,
  TEMPLATE_REPO_NAME,
  TEMPLATE_REPO_OWNER,
  TEMPLATE_REPO_URL,
  TEMPLATE_TITLE,
} from '@/app/config';

export const dynamic = 'force-dynamic';

const publicUrl = (value?: string) => {
  if (!value) { return undefined; }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
};

export async function GET() {
  // The landing page has separate destinations for the source repository and
  // the running panel: GitHub opens the repository, while Media Panel opens
  // this deployment's public URL.
  const repoUrl = publicUrl(BASE_URL);
  const portfolioUrl = publicUrl(PORTFOLIO_URL);
  const githubUrl = publicUrl(TEMPLATE_REPO_URL);

  return NextResponse.json({
    // The worker landing page title identifies the template/application. The
    // deployed site's domain is separate metadata and must not replace it.
    title: TEMPLATE_TITLE,
    kicker: NAV_CAPTION || 'Personal media library',
    description: META_DESCRIPTION || TEMPLATE_DESCRIPTION,
    ownerName: TEMPLATE_REPO_OWNER,
    repoName: TEMPLATE_REPO_NAME,
    repoUrl,
    githubUrl,
    portfolioUrl,
  }, {
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  });
}
