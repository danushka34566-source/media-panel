'use client';

import FieldsetWithStatus from '@/components/FieldsetWithStatus';
import Container from '@/components/Container';
import SubmitButtonWithStatus from '@/components/SubmitButtonWithStatus';
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  getAuthAction,
  signInAction,
  signInWithGoogleAction,
} from './actions';
import ErrorNote from '@/components/ErrorNote';
import Note from '@/components/Note';
import {
  KEY_CALLBACK_URL,
  KEY_2FA_CODE_SENT,
  KEY_CREDENTIALS_SIGN_IN_ERROR,
  KEY_CREDENTIALS_SUCCESS,
  parseTwoFactorResponse,
  type TwoFactorMethod,
} from '.';
import { useSearchParams } from 'next/navigation';
import { useAppState } from '@/app/AppState';
import { clsx } from 'clsx/lite';
import { PATH_ROOT } from '@/app/path';
import IconLock from '@/components/icons/IconLock';
import { useAppText } from '@/i18n/state/client';
import LinkWithStatus from '@/components/LinkWithStatus';
import { FiRefreshCw, FiShield } from 'react-icons/fi';
import { FcGoogle } from 'react-icons/fc';

export default function SignInForm({
  includeTitle = true,
  shouldRedirect = true,
  googleSignInEnabled = false,
  newRegistrationsEnabled = true,
  className,
}: {
  includeTitle?: boolean
  shouldRedirect?: boolean
  googleSignInEnabled?: boolean
  newRegistrationsEnabled?: boolean
  className?: string
}) {
  const params = useSearchParams();

  const { setUserEmail } = useAppState();

  const appText = useAppText();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorChallenge, setTwoFactorChallenge] =
    useState<ReturnType<typeof parseTwoFactorResponse>>();
  const [selectedTwoFactorMethod, setSelectedTwoFactorMethod] =
    useState<TwoFactorMethod>();
  const [response, action] = useActionState(signInAction, undefined);

  const emailRef = useRef<HTMLInputElement>(null);
  const twoFactorCodeRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timeout = setTimeout(() => emailRef.current?.focus(), 100);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (response === KEY_CREDENTIALS_SUCCESS) {
      setUserEmail?.(email);
    }
  }, [setUserEmail, response, email]);

  const latestTwoFactorChallenge = useMemo(
    () => parseTwoFactorResponse(response),
    [response],
  );
  const twoFactorState = latestTwoFactorChallenge ?? twoFactorChallenge;
  const twoFactorMethod: TwoFactorMethod =
    selectedTwoFactorMethod ?? twoFactorState?.preferred ?? 'email';
  const twoFactorMethods = twoFactorState?.available ?? [];
  const twoFactorMethodOptions = twoFactorMethods.map(method => ({
    value: method,
    label: method === 'authenticator'
      ? 'Authenticator app'
      : method === 'sms' ? 'Mobile (SMS)' : 'Email',
  }));

  useEffect(() => {
    if (latestTwoFactorChallenge) {
      // Preserve the verification screen when a submitted code is invalid.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTwoFactorChallenge(latestTwoFactorChallenge);
    }
  }, [latestTwoFactorChallenge]);

  useEffect(() => {
    return () => {
      // Capture user email before unmounting
      getAuthAction().then(auth =>
        setUserEmail?.(auth?.user?.email ?? undefined));
    };
  }, [setUserEmail]);

  const isFormValid =
    email.length > 0 && password.length > 0 &&
    (!twoFactorState || twoFactorCode.length === 6);
  const needsTwoFactor = Boolean(twoFactorState);
  const verificationInstruction = twoFactorMethod === 'sms'
    ? appText.auth.enterSmsCode
    : twoFactorMethod === 'email'
      ? appText.auth.enterEmailCode
      : appText.auth.enterAuthenticatorCode;
  const codeSentMessage = twoFactorMethod === 'sms'
    ? appText.auth.newSmsCodeSent
    : appText.auth.newEmailCodeSent;

  useEffect(() => {
    if (needsTwoFactor) {
      const timeout = setTimeout(
        () => twoFactorCodeRef.current?.focus(),
        100,
      );
      return () => clearTimeout(timeout);
    }
  }, [needsTwoFactor]);

  return (
    <Container
      className={clsx(
        'w-[calc(100vw-1.5rem)] sm:w-[min(400px,90vw)]',
        'px-6 py-6',
        className,
      )}
    >
      {includeTitle &&
        <div className="flex w-full flex-col items-center text-center">
          <span className={clsx(
            'mb-3 inline-flex size-11 items-center justify-center rounded-full',
            needsTwoFactor ? 'bg-dim text-main' : 'text-main',
          )}>
            {needsTwoFactor
              ? <FiShield size={21} />
              : <IconLock className="translate-y-[0.5px]" />}
          </span>
          <h1 className="text-2xl font-semibold text-main">
            {needsTwoFactor ? appText.auth.verifyTitle : appText.auth.signIn}
          </h1>
          {needsTwoFactor &&
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-dim">
              {verificationInstruction}
            </p>}
        </div>}
      <form action={action} className="w-full">
        <div className={clsx(
          'space-y-5 w-full',
          includeTitle && 'mt-6',
        )}>
          {response === KEY_CREDENTIALS_SIGN_IN_ERROR &&
            <ErrorNote>
              {needsTwoFactor
                ? appText.auth.invalidVerificationCode
                : appText.auth.invalidEmailPassword}
            </ErrorNote>}
          {needsTwoFactor &&
            <Note>
              {twoFactorState?.state === KEY_2FA_CODE_SENT
                ? codeSentMessage
                : appText.auth.enterCurrentCode}
            </Note>}
          <div className="space-y-4 w-full">
            {needsTwoFactor
              ? <>
                <input type="hidden" name="email" value={email} />
                <input type="hidden" name="password" value={password} />
                <FieldsetWithStatus
                  id="twoFactorMethod"
                  label="Verification method"
                  note="Email is always available; SMS requires a verified mobile number."
                  value={twoFactorMethod}
                  onChange={value => {
                    setSelectedTwoFactorMethod(value as TwoFactorMethod);
                    setTwoFactorCode('');
                  }}
                  selectOptions={twoFactorMethodOptions}
                />
                <FieldsetWithStatus
                  id="twoFactorCode"
                  label={appText.auth.verificationCode}
                  inputRef={twoFactorCodeRef}
                  value={twoFactorCode}
                  onChange={value => setTwoFactorCode(
                    value.replace(/\D/g, '').slice(0, 6),
                  )}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                />
              </>
              : <>
                <FieldsetWithStatus
                  id="email"
                  inputRef={emailRef}
                  label={appText.auth.email}
                  value={email}
                  onChange={setEmail}
                />
                <FieldsetWithStatus
                  id="password"
                  label={appText.auth.password}
                  type="password"
                  value={password}
                  onChange={setPassword}
                />
              </>}
            {shouldRedirect &&
              <input
                type="hidden"
                name={KEY_CALLBACK_URL}
                value={params.get(KEY_CALLBACK_URL)?.startsWith('/') &&
                  !params.get(KEY_CALLBACK_URL)?.startsWith('//')
                  ? params.get(KEY_CALLBACK_URL)!
                  : PATH_ROOT}
              />}
          </div>
          {needsTwoFactor
            ? <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              <SubmitButtonWithStatus
                disabled={!isFormValid}
                primary
                className="w-full justify-center rounded-lg"
              >
                {appText.auth.verifyCode}
              </SubmitButtonWithStatus>
              {twoFactorMethod !== 'authenticator' &&
                <SubmitButtonWithStatus
                  name="intent"
                  value="resend-2fa"
                  icon={<FiRefreshCw size={15} />}
                  onClick={() => setTwoFactorCode('')}
                  className={clsx(
                    'w-full justify-center rounded-lg border border-medium',
                    'bg-dim px-4 text-main transition-colors hover:bg-medium',
                  )}
                >
                  {appText.auth.resendCode}
                </SubmitButtonWithStatus>}
            </div>
            : <SubmitButtonWithStatus
              disabled={!isFormValid}
              primary
              className="w-full justify-center rounded-lg"
            >
              {appText.auth.signIn}
            </SubmitButtonWithStatus>}
        </div>
      </form>
      {!needsTwoFactor && googleSignInEnabled && <>
        <div
          className="flex w-full items-center gap-3 text-xs uppercase text-dim"
        >
          <span className="h-px flex-1 bg-medium" />
          <span>{appText.auth.or}</span>
          <span className="h-px flex-1 bg-medium" />
        </div>
        <form action={signInWithGoogleAction} className="w-full">
          <SubmitButtonWithStatus
            icon={<FcGoogle size={18} />}
            className={clsx(
              'w-full justify-center rounded-lg border border-medium',
              'bg-dim text-main transition-colors hover:bg-medium',
            )}
          >
            {appText.auth.continueWithGoogle}
          </SubmitButtonWithStatus>
        </form>
      </>}
      {!needsTwoFactor &&
        <div className={clsx(
          'flex w-full gap-3 text-sm',
          newRegistrationsEnabled ? 'justify-between' : 'justify-end',
        )}>
          {newRegistrationsEnabled &&
            <LinkWithStatus href="/sign-up" className="link">
              {appText.auth.createAccount}
            </LinkWithStatus>}
          <LinkWithStatus href="/password-reset" className="link">
            {appText.auth.forgotPassword}
          </LinkWithStatus>
        </div>}
    </Container>
  );
}
