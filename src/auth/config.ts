const isConfigured = (value?: string) => {
  const normalized = value?.trim();
  return Boolean(
    normalized &&
    !/^(replace-with|your-|example|change-me)/i.test(normalized),
  );
};

export const isGoogleAuthConfigured = () =>
  isConfigured(process.env.AUTH_GOOGLE_ID) &&
  isConfigured(process.env.AUTH_GOOGLE_SECRET);
