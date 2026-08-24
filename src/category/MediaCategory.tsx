'use client';

import { pathForCategory } from '@/app/path';
import EntityLink, { EntityLinkExternalProps } from '@/components/entity/EntityLink';
import IconFolder from '@/components/icons/IconFolder';
import { formatMediaStringEntity } from '@/media/MediaStringEntity';
import { useAppState } from '@/app/AppState';
import AdminMediaLibraryValueMenu from '@/media/AdminMediaLibraryValueMenu';

export default function MediaCategory({
  category,
  label,
  showAdminMenu,
  ...props
}: {
  category: string
  label?: string
  showAdminMenu?: boolean
} & EntityLinkExternalProps) {
  const { isUserSignedIn } = useAppState();
  const count = props.hoverCount ?? 0;
  return (
    <EntityLink
      {...props}
      label={label ?? formatMediaStringEntity(category)}
      path={pathForCategory(category)}
      hoverQueryOptions={{ category }}
      icon={<IconFolder size={14} className="translate-y-[-0.5px]" />}
      hoverCount={count}
      action={showAdminMenu && isUserSignedIn &&
        <AdminMediaLibraryValueMenu type="category" value={category} count={count} />}
    />
  );
}
