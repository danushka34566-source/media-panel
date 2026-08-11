import { removeUrlProtocol } from '@/utility/url';
import type { NextConfig } from 'next';
import { RemotePattern } from 'next/dist/shared/lib/image-config';
import path from 'path';

const HOSTNAME_CLOUDFLARE_R2 =
  process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_DOMAIN;
const HOSTNAME_DRIVE_STORAGE = process.env.DRIVE_STORAGE_BASE_URL
  ? new URL(process.env.DRIVE_STORAGE_BASE_URL).hostname
  : undefined;

const generateRemotePattern = (
  hostname: string,
  port?: string,
  useSSL = true,
): RemotePattern => ({
  protocol: useSSL ? 'https' : 'http',
  hostname: removeUrlProtocol(hostname)!,
  port,
  pathname: '/**',
});

const remotePatterns: RemotePattern[] = [];

if (HOSTNAME_CLOUDFLARE_R2) {
  remotePatterns.push(generateRemotePattern(HOSTNAME_CLOUDFLARE_R2));
}
if (HOSTNAME_DRIVE_STORAGE) {
  remotePatterns.push(generateRemotePattern(HOSTNAME_DRIVE_STORAGE));
}
const LOCALE = process.env.NEXT_PUBLIC_LOCALE || 'en-us';
const LOCALE_ALIAS = './date-fns-locale-alias';
const LOCALE_DYNAMIC = `i18n/locales/${LOCALE}`;

const IMAGE_QUALITY =
  process.env.NEXT_PUBLIC_IMAGE_QUALITY
    ? parseInt(process.env.NEXT_PUBLIC_IMAGE_QUALITY)
    : 75;

const nextConfig: NextConfig = {
  env: {
    DRIVE_STORAGE_BASE_URL: process.env.DRIVE_STORAGE_BASE_URL,
    NEXT_PUBLIC_DRIVE_STORAGE_PROJECT_ID: process.env.NEXT_PUBLIC_DRIVE_STORAGE_PROJECT_ID,
    NEXT_PUBLIC_DRIVE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_DRIVE_STORAGE_BUCKET,
  },
  serverExternalPackages: [
    'fluent-ffmpeg',
    'ffmpeg-static',
    'ffprobe-static',
  ],
  outputFileTracingIncludes: {
    '/**/convertUploadToMedia': [
      './node_modules/ffmpeg-static/ffmpeg',
      './node_modules/ffprobe-static/bin/ffprobe',
    ],
  },
  images: {
    imageSizes: [200],
    qualities: [75, IMAGE_QUALITY],
    remotePatterns,
    minimumCacheTTL: 31536000,
  },
  turbopack: {
    root: __dirname,
    resolveAlias: {
      [LOCALE_ALIAS]: `@/${LOCALE_DYNAMIC}`,
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      [LOCALE_ALIAS]: path.resolve(__dirname, `src/${LOCALE_DYNAMIC}`),
    };
    return config;
  },
};

module.exports = process.env.ANALYZE === 'true'
  ? require('@next/bundle-analyzer')()(nextConfig)
  : nextConfig;

