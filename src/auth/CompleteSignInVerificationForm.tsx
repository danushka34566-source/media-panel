'use client';

import Container from '@/components/Container';
import ErrorNote from '@/components/ErrorNote';
import SubmitButtonWithStatus from '@/components/SubmitButtonWithStatus';
import { useActionState, useEffect, useRef, useState } from 'react';
import { FiShield } from 'react-icons/fi';
import {
  completePendingSignInVerificationAction,
  signOutAction,
} from './actions';
import {
  KEY_2FA_CODE_SENT,
  KEY_2FA_CODE_AVAILABLE,
  KEY_CREDENTIALS_SUCCESS,
  parseTwoFactorResponse,
  type TwoFactorMethod,
} from '.';
import { clsx } from 'clsx/lite';
import AuthCodeField from './AuthCodeField';
import AuthHeading from './AuthHeading';
import AuthVerificationMethodPicker from './AuthVerificationMethodPicker';
import { PATH_SIGN_IN } from '@/app/path';
import { useAppText } from '@/i18n/state/client';

export default function CompleteSignInVerificationForm({
  defaultMethod,
  availableMethods,
  callbackUrl,
}: {
  defaultMethod: TwoFactorMethod
  availableMethods: TwoFactorMethod[]
  callbackUrl?: string
}) {
  const appText = useAppText();
  const codeRef = useRef<HTMLInputElement>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [selectedTwoFactorMethod, setSelectedTwoFactorMethod] =
    useState<TwoFactorMethod>();
  const [codeEntryMethod, setCodeEntryMethod] = useState<TwoFactorMethod>();
  const resendRequestedRef = useRef(false);
  const [signOutError, setSignOutError] = useState('');
  const [response, action, isActionPending] = useActionState(
    completePendingSignInVerificationAction,
    undefined,
  );

  const twoFactorState = parseTwoFactorResponse(response);
  const verificationError = twoFactorState?.error ?? (
    response && response !== KEY_CREDENTIALS_SUCCESS && !twoFactorState
      ? response
      : undefined
  );
  useEffect(() => {
    if (
      twoFactorState?.state === KEY_2FA_CODE_SENT ||
      twoFactorState?.state === KEY_2FA_CODE_AVAILABLE
    ) {
      // Keep code entry visible if verification returns an error or is
      // re-entered during a delivery cooldown.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCodeEntryMethod(twoFactorState.preferred);
    }
  }, [twoFactorState?.state, twoFactorState?.preferred]);
  useEffect(() => {
    if (isActionPending || !resendRequestedRef.current) { return; }
    if (twoFactorState?.state === KEY_2FA_CODE_SENT) {
      // Do not discard a valid code until a replacement is confirmed.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTwoFactorCode('');
    }
    resendRequestedRef.current = false;
  }, [isActionPending, twoFactorState?.state]);
  const methods = twoFactorState?.available ?? availableMethods;
  const twoFactorMethod = selectedTwoFactorMethod &&
    methods.includes(selectedTwoFactorMethod)
    ? selectedTwoFactorMethod
    : twoFactorState?.preferred ?? defaultMethod;
  const codeAvailable = twoFactorState?.state === KEY_2FA_CODE_AVAILABLE &&
    twoFactorState.preferred === twoFactorMethod;
  const hasDeliveryError = twoFactorState?.state !== KEY_2FA_CODE_SENT &&
    twoFactorState?.state !== KEY_2FA_CODE_AVAILABLE &&
    twoFactorState?.error &&
    twoFactorState.preferred === twoFactorMethod;
  const codeSent = !hasDeliveryError && (
    (twoFactorState?.state === KEY_2FA_CODE_SENT &&
    twoFactorState.preferred === twoFactorMethod) ||
    codeEntryMethod === twoFactorMethod
  );
  const showCode = twoFactorMethod === 'authenticator' || codeSent || codeAvailable;

  useEffect(() => {
    if (showCode) { codeRef.current?.focus(); }
  }, [showCode, twoFactorMethod]);

  return (
    <Container
      color="auth"
      className={clsx(
        'auth-flow-card w-full max-w-sm rounded-lg bg-content p-5 sm:p-6',
      )}
    >
      <AuthHeading
        icon={<FiShield size={21} />}
        title={appText.auth.verifyTitle}
      />
      <form action={action} className="w-full space-y-4">
        {callbackUrl && <input
          type="hidden"
          name="callbackUrl"
          value={callbackUrl}
        />}
        {verificationError && <ErrorNote>{verificationError}</ErrorNote>}
        <AuthVerificationMethodPicker
          method={twoFactorMethod}
          availableMethods={methods}
          onChange={method => {
            setSelectedTwoFactorMethod(method);
            setTwoFactorCode('');
            resendRequestedRef.current = false;
          }}
        >
          <div className="space-y-4">
            {showCode && <>
              <AuthCodeField
                id="twoFactorCode"
                label={appText.auth.verificationCode}
                description={twoFactorMethod === 'authenticator'
                  ? appText.auth.enterAuthenticatorCode
                  : twoFactorMethod === 'sms'
                    ? appText.auth.enterSmsCode
                    : appText.auth.enterEmailCode}
                inputRef={codeRef}
                value={twoFactorCode}
                onChange={setTwoFactorCode}
              />
            </>}
            <SubmitButtonWithStatus
              disabled={showCode && twoFactorCode.length < 6}
              className="auth-flow-button w-full justify-center"
            >
              {showCode
                ? 'Verify and continue'
                : twoFactorMethod === 'sms' ? 'Send SMS code' : 'Send email code'}
            </SubmitButtonWithStatus>
            {(codeSent || codeAvailable) && twoFactorMethod !== 'authenticator' &&
              <SubmitButtonWithStatus
                name="intent"
                value="resend-2fa"
                onClick={() => { resendRequestedRef.current = true; }}
                className="auth-flow-button w-full justify-center"
              >
                {appText.auth.resendCode}
              </SubmitButtonWithStatus>}
          </div>
        </AuthVerificationMethodPicker>
      </form>
      {signOutError && <ErrorNote>{signOutError}</ErrorNote>}
      <form action={async () => {
        setSignOutError('');
        try {
          await signOutAction();
          window.location.replace(PATH_SIGN_IN);
        } catch {
          setSignOutError('Could not sign out. Please try again.');
        }
      }} className="w-full">
        <SubmitButtonWithStatus styleAs="link" className="w-full justify-center">
          Sign out
        </SubmitButtonWithStatus>
      </form>
    </Container>
  );
}
