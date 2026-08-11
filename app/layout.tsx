import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { clsx } from 'clsx/lite';
import {
  BASE_URL,
  DEFAULT_THEME,
  META_DESCRIPTION,
  META_TITLE,
  HTML_LANG,
  SITE_FEEDS_ENABLED,
  ADMIN_DEBUG_TOOLS_ENABLED,
  PAGE_SCRIPT_URLS,
} from '@/app/config';
import AppStateProvider from '@/app/AppStateProvider';
import ToasterWithThemes from '@/toast/ToasterWithThemes';
import MediaEscapeHandler from '@/media/MediaEscapeHandler';
import { Metadata } from 'next/types';
import { ThemeProvider } from 'next-themes';
import Nav from '@/app/Nav';
import Footer from '@/app/Footer';
import SwrConfigClient from '@/swr/SwrConfigClient';
import { revalidatePath } from 'next/cache';
import ThemeColors from '@/app/ThemeColors';
import AppTextProvider from '@/i18n/state/AppTextProvider';
import SharedHoverProvider from '@/components/shared-hover/SharedHoverProvider';
import { PATH_FEED_JSON, PATH_RSS_XML } from '@/app/path';
import SelectMediaProvider from '@/admin/select/SelectMediaProvider';
import Script from 'next/script';
import MobilePullGesture from '@/app/MobilePullGesture';
import DeferredGlobalFeatures from '@/app/DeferredGlobalFeatures';
import { authCachedSafe } from '@/auth/cache';

import '../tailwind.css';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

// Keep server rendering next to the Neon database in AWS Singapore. Without
// this, Vercel was executing dynamic routes in iad1 and adding a trans-Pacific
// database round trip to every uncached page request.
export const preferredRegion = 'sin1';

export const metadata: Metadata = {
  title: META_TITLE,
  description: META_DESCRIPTION,
  ...BASE_URL && { metadataBase: new URL(BASE_URL) },
  openGraph: {
    title: META_TITLE,
    description: META_DESCRIPTION,
  },
  twitter: {
    title: META_TITLE,
    description: META_DESCRIPTION,
  },
  icons: [{
    url: '/favicon.ico',
    rel: 'icon',
    type: 'image/png',
    sizes: '180x180',
  }, {
    url: '/favicons/light.png',
    rel: 'icon',
    media: '(prefers-color-scheme: light)',
    type: 'image/png',
    sizes: '32x32',
  }, {
    url: '/favicons/dark.png',
    rel: 'icon',
    media: '(prefers-color-scheme: dark)',
    type: 'image/png',
    sizes: '32x32',
  }, {
    url: '/favicons/apple-touch-icon.png',
    rel: 'icon',
    type: 'image/png',
    sizes: '180x180',
  }],
  ...SITE_FEEDS_ENABLED && {
    alternates: {
      types: {
        'application/rss+xml': PATH_RSS_XML,
        'application/json': PATH_FEED_JSON,
      },
    },
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await authCachedSafe();
  return (
    <html
      lang={HTML_LANG}
      // Suppress hydration errors due to next-themes behavior
      suppressHydrationWarning className={cn("font-sans", geist.variable)}
    >
      <body className={clsx(
        // Center on large screens
        '3xl:flex flex-col items-center',
      )}>
        <AppStateProvider
          areAdminDebugToolsEnabled={ADMIN_DEBUG_TOOLS_ENABLED}
          initialAuth={session}
        >
          <AppTextProvider>
            <SelectMediaProvider>
              <ThemeColors />
              <ThemeProvider attribute="class" defaultTheme={DEFAULT_THEME}>
                <SwrConfigClient>
                  <SharedHoverProvider>
                    <MobilePullGesture />
                    <DeferredGlobalFeatures
                      onLastUpload={async () => {
                        'use server';
                        revalidatePath('/admin', 'layout');
                      }}
                    />
                    <div className={clsx(
                      'mx-3 mb-3',
                      'lg:mx-6 lg:mb-6',
                    )}>
                      <Nav session={session} />
                      <main>
                        <div className={clsx(
                          'min-h-[16rem] sm:min-h-[30rem]',
                          'mb-12',
                          'space-y-5',
                        )}>
                          {children}
                        </div>
                      </main>
                      <Footer />
                    </div>
                  </SharedHoverProvider>
                </SwrConfigClient>
                <Analytics debug={false} />
                <SpeedInsights debug={false} />
                <MediaEscapeHandler />
                <ToasterWithThemes />
              </ThemeProvider>
            </SelectMediaProvider>
          </AppTextProvider>
        </AppStateProvider>
        {PAGE_SCRIPT_URLS.map(url => <Script key={url} src={url} />)}
      </body>
    </html>
  );
}
