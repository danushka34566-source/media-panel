'use client';

import { pathForContentType } from '@/app/path';
import EntityLink, { EntityLinkExternalProps } from '@/components/entity/EntityLink';
import { CgFileDocument } from 'react-icons/cg';
import { formatMediaStringEntity } from '@/media/MediaStringEntity';

export default function MediaContentType({
  contentType,
  label,
  ...props
}: {
  contentType: string
  label?: string
} & EntityLinkExternalProps) {
  return (
    <EntityLink
      {...props}
      label={label ?? formatMediaStringEntity(contentType)}
      path={pathForContentType(contentType)}
      hoverQueryOptions={{ contentType }}
      icon={<CgFileDocument size={14} />}
    />
  );
}
