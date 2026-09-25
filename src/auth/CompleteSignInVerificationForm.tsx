'use client';

import Container from '@/components/Container';
import ErrorNote from '@/components/ErrorNote';
import FieldsetWithStatus from '@/components/FieldsetWithStatus';
import SubmitButtonWithStatus from '@/components/SubmitButtonWithStatus';
import { useActionState, useState } from 'react';
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
import Note from '@/components/Note';
import { FiShield } from 'react-icons/fi';
import AuthHeading from './AuthHeading';
import AuthCodeField from './AuthCodeField';

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
  const [response, action] = useActionState(
    completePendingSignInVerificationAction,
    undefined,
  );

  const twoFactorState = parseTwoFactorResponse(response);
  const twoFactorMethod = selectedTwoFactorMethod ??
    twoFactorState?.preferred ??
    defaultMethod;
  const methodOptions = (
    twoFactorState?.available ?? availableMethods
  ).map(method => ({
    value: method,
    label: method === 'authenticator'
      ? 'Authenticator app'
      : method === 'sms' ? 'Mobile (SMS)' : 'Email',
  }));

  return (
    <Container
      color="auth"
      className={clsx(
        'w-[calc(100vw-1.5rem)] sm:w-[min(400px,90vw)]',
        'auth-flow-card rounded-3xl px-5 py-6 sm:px-8 sm:py-7',
      )}
    >
      <AuthHeading
        icon={<FiShield size={21} />}
        title="Verify it's you"
        description="Choose an available method, then enter its six-digit code."
      />
      <form action={action} className="w-full space-y-4">
        {response && response !== KEY_CREDENTIALS_SUCCESS && !twoFactorState &&
          <ErrorNote>{response}</ErrorNote>}
        {twoFactorState &&
          <Note>
            {twoFactorState.state === KEY_2FA_CODE_SENT
              ? 'Enter the verification code that was sent to you.'
              : 'Choose a verification method to continue.'}
          </Note>}
        <FieldsetWithStatus
          id="twoFactorMethod"
          label="Verification method"
          note="Email is always available; SMS requires a verified mobile number."
          value={twoFactorMethod}
          onChange={value => {
            setSelectedTwoFactorMethod(value as TwoFactorMethod);
            setTwoFactorCode('');
          }}
          selectOptions={methodOptions}
        />
        <AuthCodeField
          id="twoFactorCode"
          label="Verification code"
          value={twoFactorCode}
          onChange={setTwoFactorCode}
        />
        <SubmitButtonWithStatus
          disabled={twoFactorMethod === 'authenticator' && twoFactorCode.length < 6}
          primary
          className="w-full justify-center rounded-xl"
        >
          {twoFactorCode.length < 6 && twoFactorMethod !== 'authenticator'
            ? twoFactorMethod === 'sms' ? 'Send SMS code' : 'Send email code'
            : 'Verify and continue'}
        </SubmitButtonWithStatus>
      </form>
      <form action={signOutAction} className="w-full">
        <SubmitButtonWithStatus styleAs="link" className="w-full justify-center">
          Sign out
        </SubmitButtonWithStatus>
      </form>
    </Container>
  );
}
