'use client';

import { pathForStudio } from '@/app/path';
import EntityLink, { EntityLinkExternalProps } from '@/components/entity/EntityLink';
import { LuClapperboard } from 'react-icons/lu';

export default function MediaStudio({
  studio,
  ...props
}: {
  studio: string
} & EntityLinkExternalProps) {
  return (
    <EntityLink
      {...props}
      label={studio}
      path={pathForStudio(studio)}
      hoverQueryOptions={{ studio }}
      icon={<LuClapperboard size={14} className="translate-y-[-0.5px]" />}
    />
  );
}
