import { auth } from './src/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import type { NextApiRequest, NextApiResponse } from 'next';

export function proxy(req: NextRequest, res:NextResponse) {
  return auth(
    req as unknown as NextApiRequest,
    res as unknown as NextApiResponse,
  );
}

export const config = {
  // Excludes:
  // - /api + /api/auth*
  // - /_next/static*
  // - /favicon.ico + /favicons/*
  matcher: ['/((?!api$|api/auth|_next/static|favicon.ico$|favicons/).*)'],
};
