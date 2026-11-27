import { auth } from './src/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  isLocalAuditReadApiPath,
  isLocalAuthBypassRequested,
  isLoopbackHostname,
} from './src/auth/local-audit-bypass';

export function proxy(req: NextRequest, res:NextResponse) {
  const isApiRequest = req.nextUrl.pathname.startsWith('/api/');
  if (isLocalAuthBypassRequested()) {
    if (!isLoopbackHostname(req.nextUrl.hostname)) {
      return NextResponse.json(
        { error: 'Local audit mode is bound to loopback' },
        { status: 403 },
      );
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return NextResponse.json(
        { error: 'Local audit mode is read-only' },
        { status: 403 },
      );
    }
    if (isApiRequest && !isLocalAuditReadApiPath(req.nextUrl.pathname)) {
      return NextResponse.json(
        { error: 'This API is unavailable in local audit mode' },
        { status: 403 },
      );
    }
    if (req.nextUrl.pathname === '/admin' ||
        req.nextUrl.pathname.startsWith('/admin/')) {
      return NextResponse.json(
        { error: 'Admin pages are disabled in local audit mode because they can write to the configured database' },
        { status: 403 },
      );
    }
    if (isApiRequest) { return NextResponse.next(); }
  }
  // Preserve the previous API behavior when the local audit mode is off.
  if (isApiRequest) { return NextResponse.next(); }
  // The crawler policy is public and handles site visibility separately.
  if (req.nextUrl.pathname === '/robots.txt') { return NextResponse.next(); }
  return auth(
    req as unknown as NextApiRequest,
    res as unknown as NextApiResponse,
  );
}

export const config = {
  // Excludes:
  // - /_next/static*
  // - /favicon.ico + /favicons/*
  matcher: ['/((?!_next/static|favicon.ico$|favicons/).*)'],
};
