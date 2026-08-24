'use client';

import { pathForPerformer } from '@/app/path';
import EntityLink, { EntityLinkExternalProps } from '@/components/entity/EntityLink';
import { FaRegUserCircle } from 'react-icons/fa';
import { useAppState } from '@/app/AppState';
import AdminMediaLibraryValueMenu from '@/media/AdminMediaLibraryValueMenu';

export default function MediaPerformer({
  performer,
  showAdminMenu,
  ...props
}: {
  performer: string
  showAdminMenu?: boolean
} & EntityLinkExternalProps) {
  const { isUserSignedIn } = useAppState();
  const count = props.hoverCount ?? 0;
  return (
    <EntityLink
      {...props}
      label={performer}
      path={pathForPerformer(performer)}
      hoverQueryOptions={{ performer }}
      icon={<FaRegUserCircle size={14} />}
      hoverCount={count}
      action={showAdminMenu && isUserSignedIn &&
        <AdminMediaLibraryValueMenu type="performer" value={performer} count={count} />}
    />
  );
}
