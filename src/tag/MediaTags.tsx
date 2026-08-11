import MediaTag from '@/tag/MediaTag';
import { isTagFavs } from '.';
import MediaFavs from './MediaFavs';
import { EntityLinkExternalProps } from '@/components/entity/EntityLink';
import { Fragment } from 'react';

export default function MediaTags({
  tags,
  tagCounts = {},
  contrast,
  prefetch,
  className,
}: {
  tags: string[]
  tagCounts?: Record<string, number>
} & EntityLinkExternalProps) {
  return (
    <div className={['flex flex-wrap gap-x-3 gap-y-1', className].filter(Boolean).join(' ')}>
      {tags.map(tag =>
        <Fragment key={tag}>
          {isTagFavs(tag)
            ? <MediaFavs {...{
              contrast,
              prefetch,
              hoverCount: tagCounts[tag],
              className: 'shrink-0',
            }} />
            : <MediaTag {...{
              tag,
              contrast,
              prefetch,
              hoverCount: tagCounts[tag],
              className: 'shrink-0',
            }} />}
        </Fragment>)}
    </div>
  );
}
