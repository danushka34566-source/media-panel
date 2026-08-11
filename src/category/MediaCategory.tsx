'use client';

import { pathForCategory } from '@/app/path';
import EntityLink, { EntityLinkExternalProps } from '@/components/entity/EntityLink';
import IconFolder from '@/components/icons/IconFolder';
import { formatMediaStringEntity } from '@/media/MediaStringEntity';

export default function MediaCategory({
  category,
  label,
  ...props
}: {
  category: string
  label?: string
} & EntityLinkExternalProps) {
  return (
    <EntityLink
      {...props}
      label={label ?? formatMediaStringEntity(category)}
      path={pathForCategory(category)}
      hoverQueryOptions={{ category }}
      icon={<IconFolder size={14} className="translate-y-[-0.5px]" />}
    />
  );
}
