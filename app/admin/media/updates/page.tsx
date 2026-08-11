import AdminMediaUpdateClient from '@/admin/AdminMediaUpdateClient';
import { AI_CONTENT_GENERATION_ENABLED } from '@/app/config';
import { getMediaInNeedOfUpdate } from '@/media/query';

export const maxDuration = 60;

export default async function AdminUpdatesPage() {
  const photos = await getMediaInNeedOfUpdate()
    .catch(() => []);

  return (
    <AdminMediaUpdateClient {...{
      photos,
      hasAiTextGeneration: AI_CONTENT_GENERATION_ENABLED,
    }} />
  );
}

