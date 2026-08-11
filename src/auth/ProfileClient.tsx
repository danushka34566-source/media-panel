'use client';

import { clsx } from 'clsx/lite';
import { useRouter } from 'next/navigation';
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import {
  FiCheck,
  FiKey,
  FiLink,
  FiLock,
  FiShield,
  FiSmartphone,
  FiPlay,
} from 'react-icons/fi';
import Container from '@/components/Container';
import ErrorNote from '@/components/ErrorNote';
import FieldsetWithStatus from '@/components/FieldsetWithStatus';
import SubmitButtonWithStatus from '@/components/SubmitButtonWithStatus';
import LoaderButton from '@/components/primitives/LoaderButton';
import UserAvatar from '@/components/UserAvatar';
import SriLankaMobileInput, {
  sriLankaMobileDigits,
} from '@/components/SriLankaMobileInput';
import type { AppUser } from './users';
import { useAppState } from '@/app/AppState';
import {
  confirmTotpSetupAction,
  disableTotpAction,
  linkGoogleAccountAction,
  removeMobileAction,
  requestMobileVerificationAction,
  saveProfileAction,
  setTwoFactorAction,
  startTotpSetupAction,
  unlinkGoogleAccountAction,
  verifyMobileAction,
} from './actions';

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Unable to read file'));
    reader.onerror = () => reject(new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });

const statusClassName = (active: boolean) => clsx(
  'inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs',
  active
    ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-300',
);

function SectionTitle({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-dim text-main">
        {icon}
      </span>
      <div>
        <h2 className="font-semibold text-main">{title}</h2>
        <p className="text-sm text-dim">{description}</p>
      </div>
    </div>
  );
}

export default function ProfileClient({
  user,
  googleSignInEnabled = false,
}: {
  user: AppUser
  googleSignInEnabled?: boolean
}) {
  const { videoPreviewMode = 'smart', setVideoPreviewMode } = useAppState();
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [username, setUsername] = useState(user.username ?? '');
  const [profileImageUrl, setProfileImageUrl] =
    useState(user.profileImageUrl ?? '');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUnlinkPassword, setNewUnlinkPassword] = useState('');
  const [confirmUnlinkPassword, setConfirmUnlinkPassword] = useState('');
  const [mobileNumber, setMobileNumber] = useState(
    sriLankaMobileDigits(user.mobileNumber),
  );
  const [mobileCode, setMobileCode] = useState('');
  const [isEditingMobile, setIsEditingMobile] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [totpSetup, setTotpSetup] = useState<{
    secret: string
    uri: string
  }>();
  const [totpQrCode, setTotpQrCode] = useState<string>();
  const [totpResponse, setTotpResponse] = useState<string>();
  const [isTotpEnabled, setIsTotpEnabled] = useState(user.totpEnabled);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [profileResponse, profileAction] =
    useActionState(saveProfileAction, undefined);
  const [mobileRequestResponse, mobileRequestAction] =
    useActionState(requestMobileVerificationAction, undefined);
  const [mobileVerifyResponse, mobileVerifyAction] =
    useActionState(verifyMobileAction, undefined);
  const [twoFactorResponse, twoFactorAction] =
    useActionState(setTwoFactorAction, undefined);
  const [unlinkResponse, unlinkAction] =
    useActionState(unlinkGoogleAccountAction, undefined);

  const totpAction = async (formData: FormData) => {
    const response = await confirmTotpSetupAction(undefined, formData);
    setTotpResponse(response);
    if (response === 'SAVED') {
      setIsTotpEnabled(true);
      setTotpSetup(undefined);
      setTotpQrCode(undefined);
      setTotpCode('');
      router.refresh();
    }
  };

  const removeTotpAction = async () => {
    await disableTotpAction();
    setIsTotpEnabled(false);
    setTotpResponse(undefined);
    setTotpSetup(undefined);
    setTotpQrCode(undefined);
    setTotpCode('');
    router.refresh();
  };

  useEffect(() => {
    if (
      profileResponse === 'SAVED' ||
      mobileVerifyResponse === 'SAVED' ||
      twoFactorResponse === 'SAVED' ||
      unlinkResponse === 'SAVED'
    ) {
      router.refresh();
    }
  }, [
    mobileVerifyResponse,
    profileResponse,
    router,
    twoFactorResponse,
    unlinkResponse,
  ]);

  useEffect(() => {
    if (!totpSetup) { return; }
    void import('qrcode').then(({ toDataURL }) =>
      toDataURL(totpSetup.uri, { width: 320, margin: 1 })
        .then(setTotpQrCode),
    );
  }, [totpSetup]);

  const showError = (response?: string) =>
    response && response !== 'SAVED' && !response.startsWith('SENT:');
  const mobileVerificationNumber = mobileRequestResponse?.startsWith('SENT:')
    ? mobileRequestResponse.slice('SENT:'.length)
    : mobileNumber;
  const isMobileVerified =
    user.mobileVerified || mobileVerifyResponse === 'SAVED';
  const verifiedMobileNumber = mobileVerifyResponse === 'SAVED'
    ? mobileVerificationNumber
    : user.mobileNumber;
  const showMobileSetup =
    !isMobileVerified ||
    isEditingMobile ||
    mobileNumber !== sriLankaMobileDigits(verifiedMobileNumber);
  const showTotpSetup = !isTotpEnabled || Boolean(totpSetup);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Container centered={false} className="items-stretch">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <button
            type="button"
            className={clsx(
              'size-20 shrink-0 overflow-hidden rounded-full p-0',
              user.googleLinked && 'cursor-default',
            )}
            onClick={() => !user.googleLinked && fileRef.current?.click()}
            title={user.googleLinked
              ? 'Profile image is managed by Google'
              : 'Upload profile image'}
          >
            <UserAvatar
              name={name}
              email={email}
              profileImageUrl={profileImageUrl || undefined}
              sizeClass="size-20"
              textClassName="text-xl"
              showInitialsFallback
            />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold text-main">{name}</h1>
            <p className="truncate text-sm text-dim">{email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className={statusClassName(user.status === 'active')}>
                {user.status}
              </span>
              <span className={statusClassName(user.emailVerified)}>
                {user.emailVerified ? <FiCheck /> : null}
                Email {user.emailVerified ? 'verified' : 'unverified'}
              </span>
              <span className={statusClassName(user.twoFactorEnabled)}>
                2FA {user.twoFactorEnabled ? 'on' : 'off'}
              </span>
            </div>
          </div>
          {!user.googleLinked &&
            <div className="flex shrink-0 flex-wrap gap-2">
              <LoaderButton onClick={() => fileRef.current?.click()}>
                {profileImageUrl ? 'Change photo' : 'Add photo'}
              </LoaderButton>
              {profileImageUrl &&
                <LoaderButton onClick={() => setProfileImageUrl('')}>
                  Remove
                </LoaderButton>}
            </div>}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async event => {
              const file = event.target.files?.[0];
              if (file) { setProfileImageUrl(await readFileAsDataUrl(file)); }
            }}
          />
        </div>
      </Container>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {(user.googleLinked || googleSignInEnabled) &&
          <Container centered={false} className="items-stretch">
            <SectionTitle
              icon={<FiPlay size={16} />}
              title="Video previews"
              description="Choose how previews play while browsing media."
            />
            <div className="grid gap-2">
              {([
                ['off', 'Off'],
                ['smart', 'Smart nearby rows'],
                ['all', 'All visible'],
              ] as const).map(([value, label]) =>
                <label key={value} className="flex cursor-pointer items-center gap-3 rounded-md border border-medium p-3">
                  <input
                    type="radio"
                    name="videoPreviewMode"
                    value={value}
                    checked={videoPreviewMode === value}
                    onChange={() => setVideoPreviewMode?.(value)}
                  />
                  <span className="font-medium text-main">{label}</span>
                </label>)}
            </div>
          </Container>}
          <Container centered={false} className="items-stretch">
            <SectionTitle
              icon={<FiKey size={16} />}
              title="Account details"
              description="Your identity and password sign-in details."
            />
            <form action={profileAction} className="grid gap-4 sm:grid-cols-2">
              {showError(profileResponse) &&
                <div className="sm:col-span-2">
                  <ErrorNote>{profileResponse}</ErrorNote>
                </div>}
              <FieldsetWithStatus label="Name" value={name} onChange={setName} />
              <FieldsetWithStatus
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                readOnly={user.googleLinked}
                note={user.googleLinked ? 'Managed by Google' : undefined}
              />
              <FieldsetWithStatus
                label="Username"
                value={username}
                onChange={setUsername}
                note="Optional"
              />
              <FieldsetWithStatus
                id="password"
                label={user.hasPassword ? 'New password' : 'Create password'}
                type="password"
                value={password}
                onChange={setPassword}
                note={user.hasPassword ? 'Leave blank to keep it' : 'Recommended'}
              />
              <input
                type="hidden"
                name="profileImageUrl"
                value={profileImageUrl}
              />
              <SubmitButtonWithStatus
                className="justify-center sm:col-span-2"
                onFormSubmitToastMessage="Profile saved"
              >
                Save changes
              </SubmitButtonWithStatus>
            </form>
          </Container>

          <Container centered={false} className="items-stretch">
            <SectionTitle
              icon={<FiLink size={16} />}
              title="Sign-in methods"
              description="Keep at least one secure way to access your account."
            />
            {user.googleLinked
              ? <div className="space-y-4">
                <div className="flex items-start justify-between gap-3 rounded-md border border-medium p-3">
                  <div>
                    <div className="font-medium text-main">Google</div>
                    <p className="text-sm text-dim">
                      Connected. Your Google name, email, and photo update at sign-in.
                    </p>
                  </div>
                  <span className={statusClassName(true)}><FiCheck /> Linked</span>
                </div>
                <form action={unlinkAction} className="space-y-3 rounded-md border border-red-200 p-3 dark:border-red-900">
                  <div>
                    <div className="font-medium text-red-600 dark:text-red-400">
                      Unlink Google
                    </div>
                    <p className="text-sm text-dim">
                      {user.hasPassword
                        ? 'Confirm your password so this account keeps a working sign-in method.'
                        : 'This Google-only account needs a password before it can be unlinked.'}
                    </p>
                  </div>
                  {showError(unlinkResponse) && <ErrorNote>{unlinkResponse}</ErrorNote>}
                  {user.hasPassword
                    ? <FieldsetWithStatus
                      id="currentPassword"
                      label="Current password"
                      type="password"
                      value={currentPassword}
                      onChange={setCurrentPassword}
                    />
                    : <div className="grid gap-3 sm:grid-cols-2">
                      <FieldsetWithStatus
                        id="newPassword"
                        label="Create password"
                        type="password"
                        value={newUnlinkPassword}
                        onChange={setNewUnlinkPassword}
                      />
                      <FieldsetWithStatus
                        id="confirmPassword"
                        label="Confirm password"
                        type="password"
                        value={confirmUnlinkPassword}
                        onChange={setConfirmUnlinkPassword}
                      />
                    </div>}
                  <SubmitButtonWithStatus
                    confirmText="Unlink Google from this account?"
                    className="border-red-300 text-red-600 dark:border-red-800 dark:text-red-400"
                  >
                    Unlink Google
                  </SubmitButtonWithStatus>
                </form>
              </div>
              : <div className="flex items-center justify-between gap-4 rounded-md border border-medium p-3">
                <div>
                  <div className="font-medium text-main">Google</div>
                  <p className="text-sm text-dim">
                    Add Google as another secure sign-in method.
                  </p>
                </div>
                <form action={linkGoogleAccountAction}>
                  <SubmitButtonWithStatus>Link Google</SubmitButtonWithStatus>
                </form>
              </div>}
          </Container>
        </div>

        <div className="space-y-4">
          <Container centered={false} className="items-stretch">
            <SectionTitle
              icon={<FiShield size={16} />}
              title="Security overview"
              description="Verification and sign-in protection at a glance."
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['Password', user.hasPassword],
                ['Google account', user.googleLinked],
                ['Verified mobile', isMobileVerified],
                ['Authenticator', user.totpEnabled],
              ].map(([label, enabled]) =>
                <div
                  key={`${label}`}
                  className="flex items-center justify-between rounded-md border border-medium px-3 py-2 text-sm"
                >
                  <span className="text-main">{label}</span>
                  <span className={statusClassName(Boolean(enabled))}>
                    {enabled ? 'Ready' : 'Not set'}
                  </span>
                </div>,
              )}
            </div>
          </Container>

          <Container centered={false} className="items-stretch">
            <SectionTitle
              icon={<FiSmartphone size={16} />}
              title="Mobile verification"
              description="Use a verified Sri Lankan number for SMS codes."
            />
            {isMobileVerified && !showMobileSetup
              ? <div className="space-y-3">
                <div className="flex items-center justify-between rounded-md border border-medium p-3">
                  <div>
                    <div className="font-medium text-main">
                      {verifiedMobileNumber}
                    </div>
                    <div className="text-sm text-dim">Verified mobile number</div>
                  </div>
                  <span className={statusClassName(true)}><FiCheck /> Verified</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <LoaderButton onClick={() => setIsEditingMobile(true)}>
                    Change number
                  </LoaderButton>
                  <form action={removeMobileAction}>
                    <SubmitButtonWithStatus
                      styleAs="link"
                      confirmText="Remove this verified mobile number?"
                    >
                      Remove
                    </SubmitButtonWithStatus>
                  </form>
                </div>
              </div>
              : <div className="space-y-4">
                <form action={mobileRequestAction} className="space-y-3">
                  {showError(mobileRequestResponse) &&
                    <ErrorNote>{mobileRequestResponse}</ErrorNote>}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <SriLankaMobileInput
                      value={mobileNumber}
                      onChange={setMobileNumber}
                      className="flex-1"
                    />
                    <SubmitButtonWithStatus>Send code</SubmitButtonWithStatus>
                  </div>
                </form>
                {(mobileRequestResponse?.startsWith('SENT:') || mobileCode) &&
                  <form action={mobileVerifyAction} className="space-y-3">
                    {showError(mobileVerifyResponse) &&
                      <ErrorNote>{mobileVerifyResponse}</ErrorNote>}
                    <input
                      type="hidden"
                      name="mobileNumber"
                      value={mobileVerificationNumber}
                    />
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <FieldsetWithStatus
                        id="code"
                        label="6-digit code"
                        value={mobileCode}
                        onChange={value => setMobileCode(
                          value.replace(/\D/g, '').slice(0, 6),
                        )}
                        className="flex-1"
                      />
                      <SubmitButtonWithStatus disabled={mobileCode.length < 6}>
                        Verify
                      </SubmitButtonWithStatus>
                    </div>
                  </form>}
              </div>}
          </Container>

          <Container centered={false} className="items-stretch">
            <SectionTitle
              icon={<FiLock size={16} />}
              title="Two-factor authentication"
              description="Protect sign-in with an authenticator or verified mobile."
            />
            <div className="flex flex-wrap gap-2">
              <form action={twoFactorAction} className="space-y-2">
                {showError(twoFactorResponse) &&
                  <ErrorNote>{twoFactorResponse}</ErrorNote>}
                <input
                  type="hidden"
                  name="enabled"
                  value={user.twoFactorEnabled ? 'false' : 'true'}
                />
                <SubmitButtonWithStatus>
                  {user.twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
                </SubmitButtonWithStatus>
              </form>
              {isTotpEnabled &&
                <form action={removeTotpAction}>
                  <SubmitButtonWithStatus
                    styleAs="link"
                    confirmText="Remove this authenticator?"
                  >
                    Remove authenticator
                  </SubmitButtonWithStatus>
                </form>}
            </div>
            <div className="space-y-4 rounded-md border border-medium p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-main">Authenticator app</div>
                  <div className="text-sm text-dim">
                    One-time codes that work without mobile service.
                  </div>
                </div>
                <span className={statusClassName(isTotpEnabled)}>
                  {isTotpEnabled ? 'Enabled' : 'Not set'}
                </span>
              </div>
              {showTotpSetup &&
                <LoaderButton
                  isLoading={isPending}
                  onClick={() => startTransition(async () => {
                    setTotpResponse(undefined);
                    setTotpQrCode(undefined);
                    setTotpSetup(await startTotpSetupAction());
                    setTotpCode('');
                  })}
                >
                  {isTotpEnabled ? 'Replace authenticator' : 'Set up authenticator'}
                </LoaderButton>}
              {showTotpSetup && totpSetup &&
                <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                  <div className="rounded-md bg-white p-2">
                    {totpQrCode
                      ? <img
                        alt="Authenticator QR code"
                        src={totpQrCode}
                        className="aspect-square w-full object-contain"
                      />
                      : <div className="aspect-square animate-pulse bg-gray-100" />}
                  </div>
                  <form action={totpAction} className="space-y-3">
                    {showError(totpResponse) && <ErrorNote>{totpResponse}</ErrorNote>}
                    <div>
                      <div className="mb-1 text-xs text-dim">Manual setup key</div>
                      <div className="break-all rounded-md bg-dim p-2 font-mono text-xs">
                        {totpSetup.secret}
                      </div>
                    </div>
                    <FieldsetWithStatus
                      id="code"
                      label="Authenticator code"
                      value={totpCode}
                      onChange={setTotpCode}
                    />
                    <SubmitButtonWithStatus disabled={totpCode.length < 6}>
                      Confirm authenticator
                    </SubmitButtonWithStatus>
                  </form>
                </div>}
            </div>
          </Container>
        </div>
      </div>
    </div>
  );
}
