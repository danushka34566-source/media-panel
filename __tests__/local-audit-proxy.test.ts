import type { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth/server';
import { proxy, config } from '../proxy';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (_body: unknown, init: { status: number }) => ({ status: init.status }),
    next: () => ({ status: 200 }),
  },
}));
jest.mock('../src/auth/server', () => ({ auth: jest.fn() }));

const env = process.env as unknown as Record<string, string | undefined>;
const oldNodeEnv = env.NODE_ENV;
const oldBypass = env.MEDIA_PANEL_LOCAL_AUTH_BYPASS;

afterEach(() => {
  jest.clearAllMocks();
  if (oldNodeEnv === undefined) { delete env.NODE_ENV; }
  else { env.NODE_ENV = oldNodeEnv; }
  if (oldBypass === undefined) { delete env.MEDIA_PANEL_LOCAL_AUTH_BYPASS; }
  else { env.MEDIA_PANEL_LOCAL_AUTH_BYPASS = oldBypass; }
});

const runProxy = (url: string, method = 'GET') => {
  const nextUrl = new URL(url);
  return proxy({ nextUrl, method } as unknown as NextRequest,
    undefined as unknown as NextResponse) as unknown as { status: number };
};

it('denies admin pages and write-capable NextAuth APIs in local audit mode', () => {
  env.NODE_ENV = 'development';
  env.MEDIA_PANEL_LOCAL_AUTH_BYPASS = '1';

  expect(runProxy('http://localhost/admin/processing').status).toBe(403);
  expect(runProxy('http://localhost/api/auth/providers').status).toBe(200);
  expect(runProxy('http://localhost/api/auth/session').status).toBe(200);
  expect(runProxy('http://localhost/api/auth/callback/google').status).toBe(403);
  expect(auth).not.toHaveBeenCalled();
});

it('allows only the intended read API in local-audit mode', () => {
  env.NODE_ENV = 'development';
  env.MEDIA_PANEL_LOCAL_AUTH_BYPASS = '1';

  expect(runProxy('http://localhost/api/site-info').status).toBe(200);
  expect(runProxy('http://localhost/api/site-info', 'POST').status).toBe(403);
});

it('keeps normal API requests outside NextAuth middleware', () => {
  env.NODE_ENV = 'production';
  delete env.MEDIA_PANEL_LOCAL_AUTH_BYPASS;

  expect(runProxy('http://media.example/api/site-info').status).toBe(200);
  expect(auth).not.toHaveBeenCalled();
  expect(config.matcher[0]).not.toContain('api$');
});

it('exempts robots.txt and retains sitemap and manifest authorization', () => {
  env.NODE_ENV = 'production';
  delete env.MEDIA_PANEL_LOCAL_AUTH_BYPASS;

  expect(runProxy('http://media.example/robots.txt').status).toBe(200);
  expect(auth).not.toHaveBeenCalled();

  runProxy('http://media.example/sitemap.xml');
  runProxy('http://media.example/site.webmanifest');
  runProxy('http://media.example/robots.txt/anything');
  expect(auth).toHaveBeenCalledTimes(3);
});
