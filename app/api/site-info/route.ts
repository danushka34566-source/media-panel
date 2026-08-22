import { NextResponse } from 'next/server';
import {
  META_DESCRIPTION,
  NAV_CAPTION,
  NAV_TITLE,
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
  const repoUrl = publicUrl(TEMPLATE_REPO_URL);
  const portfolioUrl = publicUrl(PORTFOLIO_URL);
  const githubUrl = publicUrl(`https://github.com/${TEMPLATE_REPO_OWNER}`);

  return NextResponse.json({
    title: NAV_TITLE || TEMPLATE_TITLE,
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
