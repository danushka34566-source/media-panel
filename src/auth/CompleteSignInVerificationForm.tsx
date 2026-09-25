'use client';

import Container from '@/components/Container';
import ErrorNote from '@/components/ErrorNote';
import SubmitButtonWithStatus from '@/components/SubmitButtonWithStatus';
import { useActionState, useEffect, useState } from 'react';
import {
  completePendingSignInVerificationAction,
  signOutAction,
} from './actions';
import {
  KEY_2FA_CODE_SENT,
  KEY_CREDENTIALS_SUCCESS,
  parseTwoFactorResponse,
  type TwoFactorMethod,
} from '.';
import { clsx } from 'clsx/lite';
import AuthCodeField from './AuthCodeField';
import AuthVerificationMethodPicker from './AuthVerificationMethodPicker';
import { PATH_SIGN_IN } from '@/app/path';

export default function CompleteSignInVerificationForm({
  defaultMethod,
  availableMethods,
}: {
  defaultMethod: TwoFactorMethod
  availableMethods: TwoFactorMethod[]
}) {
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [selectedTwoFactorMethod, setSelectedTwoFactorMethod] =
    useState<TwoFactorMethod>();
  const [sentMethod, setSentMethod] = useState<TwoFactorMethod>();
  const [signOutError, setSignOutError] = useState('');
  const [response, action] = useActionState(
    completePendingSignInVerificationAction,
    undefined,
  );

  const twoFactorState = parseTwoFactorResponse(response);
  useEffect(() => {
    if (twoFactorState?.state === KEY_2FA_CODE_SENT) {
      // Keep the entry field visible if verification returns an error.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSentMethod(twoFactorState.preferred);
    }
  }, [twoFactorState?.state, twoFactorState?.preferred]);
  const twoFactorMethod = selectedTwoFactorMethod ??
    twoFactorState?.preferred ??
    defaultMethod;
  const methods = twoFactorState?.available ?? availableMethods;
  const codeSent = (twoFactorState?.state === KEY_2FA_CODE_SENT &&
    twoFactorState.preferred === twoFactorMethod) ||
    sentMethod === twoFactorMethod;
  const showCode = twoFactorMethod === 'authenticator' || codeSent;

  return (
    <Container
      color="auth"
      className={clsx(
        'auth-flow-card w-full max-w-sm rounded-lg bg-content p-5 sm:p-6',
      )}
    >
      <form action={action} className="w-full space-y-4">
        {response && response !== KEY_CREDENTIALS_SUCCESS && !twoFactorState &&
          <ErrorNote>{response}</ErrorNote>}
        <AuthVerificationMethodPicker
          method={twoFactorMethod}
          availableMethods={methods}
          onChange={method => {
            setSelectedTwoFactorMethod(method);
            setTwoFactorCode('');
          }}
        >
          <div className="space-y-4">
            {showCode && <>
              <AuthCodeField
                id="twoFactorCode"
                label="Verification code"
                description={twoFactorMethod === 'authenticator'
                  ? 'Enter the code from your authenticator app.'
                  : `Enter the code sent to your ${twoFactorMethod === 'sms' ? 'phone' : 'email'}.`}
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
