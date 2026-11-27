/**
 * Parse an admin list page without allowing malformed values or a page-size
 * multiplication to produce an imprecise database OFFSET.
 */
export const getAdminPageNumber = (
  page: string | string[] | undefined,
  pageSize: number,
) => {
  const value = Array.isArray(page) ? page[0] : page;
  const normalized = value?.trim();
  if (!normalized || !/^\d+$/.test(normalized)) { return 1; }

  const parsed = Number(normalized);
  const offset = (parsed - 1) * pageSize;
  return Number.isSafeInteger(parsed) && parsed > 0 && Number.isSafeInteger(offset)
    ? parsed
    : 1;
};
