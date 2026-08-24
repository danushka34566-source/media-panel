'use client';

import { pathForContentType } from '@/app/path';
import EntityLink, { EntityLinkExternalProps } from '@/components/entity/EntityLink';
import { CgFileDocument } from 'react-icons/cg';
import { formatMediaStringEntity } from '@/media/MediaStringEntity';
import { useAppState } from '@/app/AppState';
import AdminMediaLibraryValueMenu from '@/media/AdminMediaLibraryValueMenu';

export default function MediaContentType({
  contentType,
  label,
  showAdminMenu,
  ...props
}: {
  contentType: string
  label?: string
  showAdminMenu?: boolean
} & EntityLinkExternalProps) {
  const { isUserSignedIn } = useAppState();
  const count = props.hoverCount ?? 0;
  return (
    <EntityLink
      {...props}
      label={label ?? formatMediaStringEntity(contentType)}
      path={pathForContentType(contentType)}
      hoverQueryOptions={{ contentType }}
      icon={<CgFileDocument size={14} />}
      hoverCount={count}
      action={showAdminMenu && isUserSignedIn &&
        <AdminMediaLibraryValueMenu type="contentType" value={contentType} count={count} />}
    />
  );
}
