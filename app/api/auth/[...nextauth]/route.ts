import { GET as authGet, POST as authPost } from '@/auth/server';
import { isLocalAuthBypassRequested } from '@/auth/local-audit-bypass';
import { NextRequest, NextResponse } from 'next/server';

const blockedInAuditMode = () => NextResponse.json(
  { error: 'Auth endpoints are disabled in local audit mode' },
  { status: 403 },
);

export const GET = (request: NextRequest) =>
  isLocalAuthBypassRequested() ? blockedInAuditMode() : authGet(request);

export const POST = (request: NextRequest) =>
  isLocalAuthBypassRequested() ? blockedInAuditMode() : authPost(request);
