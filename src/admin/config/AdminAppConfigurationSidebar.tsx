'use client';

import clsx from 'clsx/lite';
import { getAdminConfigSections } from '.';
import { parameterize } from '@/utility/string';
import { useEffect, useState } from 'react';
import { CHECKLIST_SECTION_VISIBLE } from '@/components/ChecklistGroup';

export default function AdminAppConfigurationSidebar({
  simplifiedView,
  areInternalToolsEnabled,
}: {
  simplifiedView?: boolean
  areInternalToolsEnabled: boolean
}) {
  const [activeSection, setActiveSection] = useState('');
  useEffect(() => {
    const readHash = () => setActiveSection(window.location.hash.slice(1));
    const onVisible = (event: Event) => setActiveSection((event as CustomEvent<string>).detail);
    readHash();
    window.addEventListener('hashchange', readHash);
    window.addEventListener(CHECKLIST_SECTION_VISIBLE, onVisible);
    return () => {
      window.removeEventListener('hashchange', readHash);
      window.removeEventListener(CHECKLIST_SECTION_VISIBLE, onVisible);
    };
  }, []);

  return (
    <div className={clsx(
      'sticky top-0 pt-2.5 -mt-2.5',
      'space-y-1 text-sm',
    )}>
      {getAdminConfigSections(areInternalToolsEnabled, simplifiedView)
        .map(({ title }) => (
          <a
            key={title}
            href={`#${parameterize(title)}`}
            className={clsx(
              'block',
              parameterize(title) === activeSection
                ? 'text-main hover:text-main font-medium'
                : 'text-dim hover:text-main',
            )}
          >
            {title}
          </a>
        ))}
    </div>
  );
}
