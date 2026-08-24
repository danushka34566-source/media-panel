'use client';

import { pathForStudio } from '@/app/path';
import EntityLink, { EntityLinkExternalProps } from '@/components/entity/EntityLink';
import { LuClapperboard } from 'react-icons/lu';
import { useAppState } from '@/app/AppState';
import AdminMediaLibraryValueMenu from '@/media/AdminMediaLibraryValueMenu';

export default function MediaStudio({
  studio,
  showAdminMenu,
  ...props
}: {
  studio: string
  showAdminMenu?: boolean
} & EntityLinkExternalProps) {
  const { isUserSignedIn } = useAppState();
  const count = props.hoverCount ?? 0;
  return (
    <EntityLink
      {...props}
      label={studio}
      path={pathForStudio(studio)}
      hoverQueryOptions={{ studio }}
      icon={<LuClapperboard size={14} className="translate-y-[-0.5px]" />}
      hoverCount={count}
      action={showAdminMenu && isUserSignedIn &&
        <AdminMediaLibraryValueMenu type="studio" value={studio} count={count} />}
    />
  );
}
