import { unstable_noStore } from 'next/cache';
import {
  getStorageMediaUrls,
  getStorageUploadUrls,
} from '@/media/storage/list';

export const getStorageUploadUrlsNoStore: typeof getStorageUploadUrls =
  (...args) => {
    unstable_noStore();
    return getStorageUploadUrls(...args);
  };

export const getStorageMediaUrlsNoStore: typeof getStorageMediaUrls =
  (...args) => {
    unstable_noStore();
    return getStorageMediaUrls(...args);
  };
