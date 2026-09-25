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
import IconMedia from '@/components/icons/IconMedia';
import AuthHeading from './AuthHeading';
import AuthCodeField from './AuthCodeField';
import AuthVerificationMethodPicker from './AuthVerificationMethodPicker';
import { useAppText } from '@/i18n/state/client';
import LinkWithStatus from '@/components/LinkWithStatus';
import { FiRefreshCw, FiShield } from 'react-icons/fi';
import { FaGoogle } from 'react-icons/fa';

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
  const codeSent = twoFactorState?.state === KEY_2FA_CODE_SENT &&
    twoFactorState.preferred === twoFactorMethod;
  const showCode = twoFactorMethod === 'authenticator' || codeSent;
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
      color={includeTitle ? 'auth' : 'gray-border'}
      className={clsx(
        'w-[min(400px,calc(100vw-1.5rem))]',
        includeTitle
          ? 'auth-flow-card rounded-3xl px-6 py-7 sm:px-8'
          : 'rounded-2xl bg-content px-6 py-7 shadow-lg sm:px-8',
        className,
      )}
    >
      {includeTitle &&
        <AuthHeading
          icon={needsTwoFactor
            ? <FiShield size={21} />
            : <IconMedia size={23} />}
          title={needsTwoFactor ? appText.auth.verifyTitle : appText.auth.signIn}
          description={needsTwoFactor ? verificationInstruction : undefined}
          action={!needsTwoFactor && newRegistrationsEnabled
            ? <LinkWithStatus
              href="/sign-up"
              className="font-medium text-main underline underline-offset-4"
            >
              {appText.auth.createAccount}
            </LinkWithStatus>
            : undefined}
        />}
      <form action={action} className="w-full">
        <div className={clsx(
          'space-y-5 w-full',
          includeTitle && 'mt-2',
        )}>
          {response === KEY_CREDENTIALS_SIGN_IN_ERROR &&
            <ErrorNote>
              {needsTwoFactor
                ? appText.auth.invalidVerificationCode
                : appText.auth.invalidEmailPassword}
            </ErrorNote>}
          {needsTwoFactor &&
            <Note>
              {codeSent
                ? codeSentMessage
                : appText.auth.enterCurrentCode}
            </Note>}
          <div className="space-y-4 w-full">
            {needsTwoFactor
              ? <>
                <input type="hidden" name="email" value={email} />
                <input type="hidden" name="password" value={password} />
              </>
              : <>
                <FieldsetWithStatus
                  id="email"
                  inputRef={emailRef}
                  label={appText.auth.email}
                  value={email}
                  onChange={setEmail}
                />
                <div>
                  <FieldsetWithStatus
                    id="password"
                    label={appText.auth.password}
                    type="password"
                    value={password}
                    onChange={setPassword}
                  />
                  {includeTitle &&
                    <div className="mt-1.5 text-right font-sans text-xs">
                      <LinkWithStatus
                        href="/password-reset"
                        className="text-medium underline underline-offset-4"
                      >
                        {appText.auth.forgotPassword}
                      </LinkWithStatus>
                    </div>}
                </div>
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
            ? <AuthVerificationMethodPicker
              method={twoFactorMethod}
              availableMethods={twoFactorMethods}
              onChange={method => {
                setSelectedTwoFactorMethod(method);
                setTwoFactorCode('');
              }}
            >
              <div className="space-y-4">
                {showCode && <AuthCodeField
                  id="twoFactorCode"
                  label={appText.auth.verificationCode}
                  inputRef={twoFactorCodeRef}
                  value={twoFactorCode}
                  onChange={setTwoFactorCode}
                />}
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                  <SubmitButtonWithStatus
                    disabled={showCode && !isFormValid}
                    primary={!includeTitle}
                    className={includeTitle ? 'auth-flow-button w-full justify-center' : 'w-full justify-center rounded-lg'}
                  >
                    {showCode
                      ? appText.auth.verifyCode
                      : twoFactorMethod === 'sms' ? 'Send SMS code' : 'Send email code'}
                  </SubmitButtonWithStatus>
                  {showCode && twoFactorMethod !== 'authenticator' &&
                    <SubmitButtonWithStatus
                      name="intent"
                      value="resend-2fa"
                      icon={<FiRefreshCw size={15} />}
                      hideText="never"
                      onClick={() => setTwoFactorCode('')}
                      className="auth-flow-button w-full justify-center"
                    >
                      {appText.auth.resendCode}
                    </SubmitButtonWithStatus>}
                </div>
              </div>
            </AuthVerificationMethodPicker>
            : <SubmitButtonWithStatus
              disabled={!isFormValid}
              primary={!includeTitle}
              className={includeTitle ? 'auth-flow-button w-full justify-center' : 'w-full justify-center rounded-lg'}
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
            icon={<FaGoogle size={16} />}
            hideText="never"
            className="auth-flow-button w-full justify-center"
          >
            {appText.auth.continueWithGoogle}
          </SubmitButtonWithStatus>
        </form>
      </>}
      {!needsTwoFactor && !includeTitle &&
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
