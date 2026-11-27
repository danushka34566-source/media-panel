/**
 * A nearby-media result can omit its requested item when a category changes
 * or when the cached result predates registration. Check the primary row
 * independently before deciding that the detail route is unavailable.
 * A failed primary read must reject so the route can show its retry UI.
 */
export const resolveDetailPrimary = async <T extends { id: string, hidden?: boolean }>(
  photoId: string,
  nearbyPhotos: T[],
  loadPrimary: (includeHidden: boolean) => Promise<T | undefined>,
  {
    hidden = 'exclude',
    shouldRefresh,
  }: {
    hidden?: 'exclude' | 'only' | 'include'
    shouldRefresh?: (photo: T) => boolean
  } = {},
) => {
  const nearbyPhoto = nearbyPhotos.find(photo => photo.id === photoId);
  if (nearbyPhoto && !shouldRefresh?.(nearbyPhoto)) {
    return { photo: nearbyPhoto, photos: nearbyPhotos };
  }
  const freshPhoto = await loadPrimary(hidden !== 'exclude').catch(error => {
    if (nearbyPhoto) { return nearbyPhoto; }
    throw error;
  });
  const photo = freshPhoto && (
    hidden === 'include' || Boolean(freshPhoto.hidden) === (hidden === 'only')
  ) ? freshPhoto : undefined;
  if (nearbyPhoto) {
    return {
      photo,
      photos: photo
        ? nearbyPhotos.map(item => item.id === photoId ? photo : item)
        : nearbyPhotos.filter(item => item.id !== photoId),
    };
  }
  return {
    photo,
    // Neighbours from a filtered set are not valid for an item that has
    // left that set. Render the primary alone instead of wrong chevrons.
    photos: photo ? [photo] : nearbyPhotos,
  };
};
