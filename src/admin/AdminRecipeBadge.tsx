import { photoLabelForCount } from '@/media';
import { clsx } from 'clsx/lite';
import Badge from '@/components/Badge';
import MediaRecipe from '@/recipe/MediaRecipe';
import { getAppText } from '@/i18n/state/server';

export default async function AdminRecipeBadge({
  recipe,
  count,
  hideBadge,
}: {
  recipe: string,
  count: number,
  hideBadge?: boolean,
}) {
  const appText = await getAppText();

  const renderBadgeContent = () =>
    <div className={clsx(
      'inline-flex items-center gap-2',
    )}>
      <MediaRecipe {...{ recipe }} hoverType="image" />
      <div className="text-dim uppercase">
        <span>{count}</span>
        <span className="hidden xs:inline-block">
          &nbsp;
          {photoLabelForCount(count, appText)}
        </span>
      </div>
    </div>;

  return (
    hideBadge
      ? renderBadgeContent()
      : <Badge className="py-[3px]!">{renderBadgeContent()}</Badge>
  );
}
