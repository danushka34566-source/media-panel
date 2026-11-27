import 'server-only';

const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
const RESEND_TEST_RECIPIENT = 'delivered@resend.dev';

type EmailMessage = {
  to: string
  subject: string
  text: string
};

const getResendConfiguration = () => ({
  apiKey: process.env.RESEND_API_KEY?.trim(),
  from: process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    'Media Panel <onboarding@resend.dev>',
});

const postResendEmail = (
  apiKey: string,
  from: string,
  { to, subject, text }: EmailMessage,
  signal?: AbortSignal,
) => fetch(RESEND_EMAILS_URL, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ from, to: [to], subject, text }),
  signal,
});

export const sendAuthEmail = async (message: EmailMessage) => {
  const { apiKey, from } = getResendConfiguration();
  if (!apiKey) { throw new Error('Email verification is not configured'); }
  const response = await postResendEmail(
    apiKey, from, message, AbortSignal.timeout(10_000),
  );
  if (!response.ok) { throw new Error('Unable to send verification email'); }
};

export const getLoginVerificationEmailError = async () => {
  const { apiKey, from } = getResendConfiguration();
  if (!apiKey) {
    return 'Set RESEND_API_KEY before enabling sign-in verification.';
  }

  const sender = (from.match(/<([^<>]+)>$/)?.[1] ?? from).trim();
  const domain = sender.match(/^[^\s@<>]+@([^\s@<>]+\.[^\s@<>]+)$/)?.[1]
    .toLowerCase();
  if (!domain || domain === 'resend.dev' || domain.endsWith('.resend.dev')) {
    return 'Set RESEND_FROM_EMAIL to an address on a domain verified in Resend ' +
      'before enabling sign-in verification.';
  }

  const unavailable = 'Could not check email delivery with Resend. ' +
    'Try again before enabling sign-in verification.';
  try {
    // Resend delivers this test address internally without a real recipient.
    const response = await postResendEmail(apiKey, from, {
      to: RESEND_TEST_RECIPIENT,
      subject: 'Media Panel sign-in verification check',
      text: 'This is a simulated email delivery check for Media Panel.',
    }, AbortSignal.timeout(5_000));
    if (response.ok) { return; }
    if ([400, 401, 403, 422].includes(response.status)) {
      return 'Resend rejected the email delivery test. Check that RESEND_API_KEY ' +
        'can send from the verified domain in RESEND_FROM_EMAIL.';
    }
    return unavailable;
  } catch {
    return unavailable;
  }
};
