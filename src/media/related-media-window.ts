export const getRelatedMediaWindow = <T extends { id: string }>(
  photos: T[],
  selectedId: string,
  limit: number,
): T[] => {
  const selectedIndex = photos.findIndex(photo => photo.id === selectedId);
  if (selectedIndex < 0) { return photos.slice(0, limit); }
  const following = photos.slice(selectedIndex + 1, selectedIndex + 1 + limit);
  const missing = limit - following.length;
  const preceding = missing > 0
    ? photos.slice(Math.max(0, selectedIndex - missing), selectedIndex)
    : [];
  return [...preceding, ...following];
};
