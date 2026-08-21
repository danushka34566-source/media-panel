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
      className={clsx(
        'w-[calc(100vw-1.5rem)] sm:w-[min(400px,90vw)]',
        'max-h-[calc(100dvh-2rem)] overflow-y-auto px-5 py-5 sm:px-6',
      )}
    >
      <div className="flex w-full items-start gap-3">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-dim text-main">
          <FiShield size={17} />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-main">Verify it’s you</h1>
          <p className="mt-1 text-sm leading-relaxed text-dim">
            Choose any available method, then enter its six-digit code.
          </p>
        </div>
      </div>
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
        <FieldsetWithStatus
          id="twoFactorCode"
          label="Verification code"
          value={twoFactorCode}
          onChange={value => setTwoFactorCode(
            value.replace(/\D/g, '').slice(0, 6),
          )}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
        />
        <SubmitButtonWithStatus
          disabled={twoFactorMethod === 'authenticator' && twoFactorCode.length < 6}
          className="w-full justify-center"
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
