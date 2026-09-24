/**
 * A nearby-media result can omit its requested item when a category changes
 * or when the cached result predates registration. Check the primary row
 * independently before deciding that the detail route is unavailable.
 * A failed primary read must reject so the route can show its retry UI.
 */
export const resolveDetailPrimary = async <T extends { id: string }>(
  photoId: string,
  nearbyPhotos: T[],
  loadPrimary: () => Promise<T | undefined>,
) => {
  const nearbyPhoto = nearbyPhotos.find(photo => photo.id === photoId);
  if (nearbyPhoto) {
    return { photo: nearbyPhoto, photos: nearbyPhotos };
  }
  const photo = await loadPrimary();
  return {
    photo,
    // Neighbours from a filtered set are not valid for an item that has
    // left that set. Render the primary alone instead of wrong chevrons.
    photos: photo ? [photo] : nearbyPhotos,
  };
};
