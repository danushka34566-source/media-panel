const DATABASE_QUOTA_PATTERNS = [
  /exceeded the compute time quota/i,
  /compute time quota/i,
  /http status 402/i,
];

const EMBEDDED_PROVIDER_MESSAGE_REGEX = /"message":"((?:\\.|[^"])*)"/i;

export const errorToMessage = (
  error: unknown,
  fallback = 'Unknown error',
) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  const message = `${error ?? ''}`.trim();
  return message || fallback;
};

const extractEmbeddedProviderMessage = (message: string) => {
  const normalized = message.trim();
  const embeddedMatch = normalized.match(EMBEDDED_PROVIDER_MESSAGE_REGEX);
  if (!embeddedMatch?.[1]) {
    return normalized;
  }

  try {
    return JSON.parse(`"${embeddedMatch[1]}"`) as string;
  } catch {
    return embeddedMatch[1].replace(/\\"/g, '"');
  }
};

const isDatabaseQuotaExceededMessage = (message: string) =>
  DATABASE_QUOTA_PATTERNS.some(pattern => pattern.test(message));

export const isDatabaseQuotaExceededError = (error: unknown) => {
  const rawMessage = errorToMessage(error, '');
  const providerMessage = extractEmbeddedProviderMessage(rawMessage);
  return (
    isDatabaseQuotaExceededMessage(rawMessage) ||
    isDatabaseQuotaExceededMessage(providerMessage)
  );
};

export const normalizeDatabaseErrorMessage = (
  error: unknown,
  fallback = 'Database request failed',
) => {
  if (isDatabaseQuotaExceededError(error)) {
    return 'Database quota exceeded. Wait for the Neon quota to reset or upgrade the database plan.';
  }

  const rawMessage = errorToMessage(error, fallback);
  return extractEmbeddedProviderMessage(rawMessage) || fallback;
};
