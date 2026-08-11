'use client';

import { pathForPerformer } from '@/app/path';
import EntityLink, { EntityLinkExternalProps } from '@/components/entity/EntityLink';
import { FaRegUserCircle } from 'react-icons/fa';

export default function MediaPerformer({
  performer,
  ...props
}: {
  performer: string
} & EntityLinkExternalProps) {
  return (
    <EntityLink
      {...props}
      label={performer}
      path={pathForPerformer(performer)}
      hoverQueryOptions={{ performer }}
      icon={<FaRegUserCircle size={14} />}
    />
  );
}
