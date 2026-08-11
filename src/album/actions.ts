'use server';

import { runAuthenticatedAdminServerAction } from '@/auth/server';
import {
  addMediaAlbumIds,
  deleteAlbum,
  updateAlbum,
  getAlbumsWithMeta,
  getAlbumTitlesForMedia,
} from './query';
import { revalidateAllKeysAndPaths } from '@/media/cache';
import { redirect } from 'next/navigation';
import { PATH_ADMIN_ALBUMS, PATH_ROOT, pathForAlbum } from '@/app/path';
import { convertFormDataToAlbum } from './form';
import { Album } from '.';
import { createAlbumsAndGetIds } from './server';

export const getAlbumsWithMetaAction = async () =>
  runAuthenticatedAdminServerAction(async () => {
    try {
      return await getAlbumsWithMeta();
    } catch (error) {
      console.error('Error fetching albums with metadata', error);
      return [];
    }
  });

export const getAlbumTitlesForMediaAction = async (photoId: string) =>
  runAuthenticatedAdminServerAction(async () => {
    try {
      return await getAlbumTitlesForMedia(photoId);
    } catch (error) {
      console.error(`Error fetching album titles for photo ${photoId}`, error);
      return [];
    }
  });

export const updateAlbumAction = async (formData: FormData) =>
  runAuthenticatedAdminServerAction(async () => {
    const album = convertFormDataToAlbum(formData);
    await updateAlbum(album);
    revalidateAllKeysAndPaths();
    redirect(PATH_ADMIN_ALBUMS);
  });

export const deleteAlbumFormAction = async (formData: FormData) =>
  runAuthenticatedAdminServerAction(async () => {
    const albumId = formData.get('album') as string;
    await deleteAlbum(albumId);
    revalidateAllKeysAndPaths();
  }, 'delete');

export const deleteAlbumAction = async (
  album: Album,
  currentPath?: string,
) =>
  runAuthenticatedAdminServerAction(async () => {
    await deleteAlbum(album.id);
    revalidateAllKeysAndPaths();
    if (currentPath === pathForAlbum(album)) {
      redirect(PATH_ROOT);
    }
  }, 'delete');

export const addMediaToAlbumsAction = async (
  photoIds: string[],
  albumTitles: string[],
) =>
  runAuthenticatedAdminServerAction(async () => {
    const albumIds = await createAlbumsAndGetIds(albumTitles);
    await addMediaAlbumIds(photoIds, albumIds);
    revalidateAllKeysAndPaths();
  });
