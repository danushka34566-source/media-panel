import { fireEvent, render, screen } from '@testing-library/react';
import { revalidatePath } from 'next/cache';
import SiteAccessConfigurationForm from '@/admin/config/SiteAccessConfigurationForm';
import { getSiteAccessSettings, saveSiteAccessSettings } from '@/auth/site-access';
import { saveSiteAccessSettingsAction } from '@/auth/site-access-actions';
import { SITE_ACCESS_SETTINGS_DEFAULTS } from '@/auth/site-access-schema';

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('../src/app/path', () => ({
  PATH_ADMIN_CONFIGURATION: '/admin/configuration',
}));
jest.mock('../src/auth/server', () => ({
  runAuthenticatedAdminServerAction: (callback: () => Promise<unknown>) =>
    callback(),
}));
jest.mock('../src/auth/site-access', () => ({
  getSiteAccessSettings: jest.fn(),
  saveSiteAccessSettings: jest.fn(),
}));

const environmentKeys = [
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'RESEND_FROM',
] as const;
const originalEnvironment = environmentKeys.map(key => process.env[key]);
let fetchMock: jest.SpiedFunction<typeof fetch>;

const submitSettings = (requiresVerification: boolean) => {
  const formData = new FormData();
  formData.set('siteVisibility', 'private');
  if (requiresVerification) { formData.set('loginVerificationRequired', 'on'); }
  return saveSiteAccessSettingsAction({}, formData);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getSiteAccessSettings)
    .mockReset().mockResolvedValue(SITE_ACCESS_SETTINGS_DEFAULTS);
  environmentKeys.forEach(key => { delete process.env[key]; });
  fetchMock = jest.spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('Unexpected fetch'));
});

afterEach(() => {
  fetchMock.mockRestore();
  environmentKeys.forEach((key, index) => {
    const value = originalEnvironment[index];
    if (value === undefined) { delete process.env[key]; }
    else { process.env[key] = value; }
  });
});

it('shows a form error and leaves verification disabled without a key', async () => {
  render(<SiteAccessConfigurationForm settings={SITE_ACCESS_SETTINGS_DEFAULTS} />);

  fireEvent.click(screen.getByRole('switch', { name: 'Sign-in verification' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save access settings' }));

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Set RESEND_API_KEY');
  expect(fetchMock).not.toHaveBeenCalled();
  expect(saveSiteAccessSettings).not.toHaveBeenCalled();
  expect(revalidatePath).not.toHaveBeenCalled();
});

it.each([undefined, 'Media Panel <onboarding@resend.dev>', 'invalid'])(
  'rejects missing, test-only, and malformed senders (%s)',
  async (from) => {
    process.env.RESEND_API_KEY = 're_test_key';
    if (from !== undefined) { process.env.RESEND_FROM_EMAIL = from; }

    await expect(submitSettings(true)).resolves.toEqual({
      error: expect.stringContaining('domain verified in Resend'),
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveSiteAccessSettings).not.toHaveBeenCalled();
  },
);

it('rejects configuration when Resend declines the sending test', async () => {
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.RESEND_FROM_EMAIL = 'Media Panel <panel@example.com>';
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));

  await expect(submitSettings(true)).resolves.toEqual({
    error: expect.stringContaining('Resend rejected the email delivery test'),
  });
  expect(saveSiteAccessSettings).not.toHaveBeenCalled();
});

it('reports a retry when Resend cannot be reached', async () => {
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.RESEND_FROM_EMAIL = 'panel@example.com';
  fetchMock.mockRejectedValueOnce(new Error('network failure'));

  await expect(submitSettings(true)).resolves.toEqual({
    error: expect.stringContaining('Try again'),
  });
  expect(saveSiteAccessSettings).not.toHaveBeenCalled();
});

it.each(['RESEND_FROM_EMAIL', 'RESEND_FROM'] as const)(
  'enables verification when the %s configuration passes the test',
  async (senderKey) => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env[senderKey] = 'Media Panel <panel@example.com>';
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(submitSettings(true)).resolves.toEqual({ saved: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [[url, request]] = fetchMock.mock.calls;
    expect(url).toBe('https://api.resend.com/emails');
    expect(request).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer re_test_key' },
    });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      from: 'Media Panel <panel@example.com>',
      to: ['delivered@resend.dev'],
    });
    expect(saveSiteAccessSettings).toHaveBeenCalledWith({
      siteVisibility: 'private',
      newRegistrationsEnabled: false,
      loginVerificationRequired: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/configuration');
  },
);

it('saves settings with verification disabled without email configuration', async () => {
  await expect(submitSettings(false)).resolves.toEqual({ saved: true });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(saveSiteAccessSettings).toHaveBeenCalledWith({
    siteVisibility: 'private',
    newRegistrationsEnabled: false,
    loginVerificationRequired: false,
  });
});

it('saves unrelated changes without testing mail when verification is already on', async () => {
  jest.mocked(getSiteAccessSettings).mockResolvedValue({
    ...SITE_ACCESS_SETTINGS_DEFAULTS,
    loginVerificationRequired: true,
  });

  await expect(submitSettings(true)).resolves.toEqual({ saved: true });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(saveSiteAccessSettings).toHaveBeenCalledWith({
    siteVisibility: 'private',
    newRegistrationsEnabled: false,
    loginVerificationRequired: true,
  });
});
