'use client';

import {
  PATH_ADMIN_CONFIGURATION,
  PATH_ADMIN_INSIGHTS,
  PATH_ADMIN_STATS,
} from '@/app/path';
import ResponsiveText from '@/components/primitives/ResponsiveText';
import clsx from 'clsx/lite';
import ClearCacheButton from '@/admin/ClearCacheButton';
import { usePathname } from 'next/navigation';
import { useAppState } from '@/app/AppState';
import InsightsIndicatorDot from './insights/InsightsIndicatorDot';
import LinkWithLoaderBackground from '@/components/LinkWithLoaderBackground';
import MaskedScroll from '@/components/MaskedScroll';

const ADMIN_INFO_PAGES = [{
  title: 'App Insights',
  titleShort: 'Insights',
  path: PATH_ADMIN_INSIGHTS,
}, {
  title: 'Stats',
  titleShort: 'Stats',
  path: PATH_ADMIN_STATS,
}, {
  title: 'Configuration',
  titleShort: 'Config',
  path: PATH_ADMIN_CONFIGURATION,
}];

export default function AdminInfoNav({
  includeInsights,
}: {
  includeInsights: boolean
}) {
  const pathname = usePathname();
  const { canManageConfiguration, insightsIndicatorStatus } = useAppState();

  const pages = ADMIN_INFO_PAGES.filter(({ path }) =>
    (path !== PATH_ADMIN_INSIGHTS || includeInsights) &&
    (path !== PATH_ADMIN_CONFIGURATION || canManageConfiguration));

  const hasMultiplePages = pages.length > 1;

  return (
    <div className="flex min-w-0 items-center gap-4 min-h-9">
      <MaskedScroll
        className="grow min-w-0 -mx-1"
        direction="horizontal"
      >
        <div className={clsx(
          'flex min-w-max items-center gap-1.5 px-1 md:gap-3',
        )}>
          {pages
            .map(({ title, titleShort, path }) =>
              <LinkWithLoaderBackground
                key={path}
                href={path}
                className={clsx(
                  'relative inline-flex shrink-0 whitespace-nowrap',
                  hasMultiplePages
                    ? pathname === path
                      ? 'font-medium'
                      : 'text-dim'
                    : undefined,
                  'hover:text-main active:text-dim',
                )}
              >
                <ResponsiveText shortText={titleShort}>
                  {title}
                </ResponsiveText>
                {title === 'App Insights' && insightsIndicatorStatus &&
                  <InsightsIndicatorDot
                    size="small"
                    top={4}
                    right={-2}
                  />}
              </LinkWithLoaderBackground>)}
        </div>
      </MaskedScroll>
      <ClearCacheButton />
    </div>
  );
}
