'use client';

import Container from '@/components/Container';
import ErrorNote from '@/components/ErrorNote';
import FieldsetWithStatus from '@/components/FieldsetWithStatus';
import SubmitButtonWithStatus from '@/components/SubmitButtonWithStatus';
import LinkWithStatus from '@/components/LinkWithStatus';
import { clsx } from 'clsx/lite';
import { useActionState, useState } from 'react';
import {
  confirmPasswordResetAction,
  requestPasswordResetAction,
  signUpAction,
  verifyEmailAction,
} from './actions';

export function SignUpForm() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [response, action] = useActionState(signUpAction, undefined);
  return (
    <AuthContainer title="Create account">
      <form action={action} className="w-full space-y-5">
        {response && <ErrorNote>{response}</ErrorNote>}
        <FieldsetWithStatus label="Name" value={name} onChange={setName} />
        <FieldsetWithStatus label="Username" value={username} onChange={setUsername} />
        <FieldsetWithStatus label="Email" type="email" value={email} onChange={setEmail} />
        <FieldsetWithStatus label="Password" type="password" value={password} onChange={setPassword} />
        <SubmitButtonWithStatus disabled={!name || !username || !email || !password}>
          Create account
        </SubmitButtonWithStatus>
      </form>
      <LinkWithStatus href="/sign-in" className="link text-sm">
        Already have an account? Sign in
      </LinkWithStatus>
    </AuthContainer>
  );
}

export function VerifyEmailForm({ initialEmail }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail ?? '');
  const [code, setCode] = useState('');
  const [response, action] = useActionState(verifyEmailAction, undefined);
  return (
    <AuthContainer
      title="Verify email"
      description="Enter the six-digit code sent to your inbox."
    >
      <form action={action} className="w-full space-y-5">
        {response && <ErrorNote>{response}</ErrorNote>}
        <FieldsetWithStatus label="Email" type="email" value={email} onChange={setEmail} />
        <FieldsetWithStatus
          id="code"
          label="Verification code"
          value={code}
          onChange={value => setCode(value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
        />
        <SubmitButtonWithStatus
          disabled={!email || code.length < 6}
          className="w-full justify-center"
        >
          Verify account
        </SubmitButtonWithStatus>
      </form>
      <LinkWithStatus href="/sign-in" className="link text-sm">
        Back to sign in
      </LinkWithStatus>
    </AuthContainer>
  );
}

export function PasswordResetForm({
  initialEmail,
  codeSent,
}: {
  initialEmail?: string
  codeSent?: boolean
}) {
  const [email, setEmail] = useState(initialEmail ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [requestResponse, requestAction] =
    useActionState(requestPasswordResetAction, undefined);
  const [confirmResponse, confirmAction] =
    useActionState(confirmPasswordResetAction, undefined);
  return (
    <AuthContainer
      title={codeSent ? 'Enter reset code' : 'Reset password'}
      description={codeSent
        ? 'Enter the six-digit code from your email and choose a new password.'
        : 'We will email you a secure code to confirm this password change.'}
    >
      {!codeSent
        ? <form action={requestAction} className="w-full space-y-5">
          {requestResponse && <ErrorNote>{requestResponse}</ErrorNote>}
          <FieldsetWithStatus label="Email" type="email" value={email} onChange={setEmail} />
          <SubmitButtonWithStatus
            disabled={!email}
            className="w-full justify-center"
          >
            Send reset code
          </SubmitButtonWithStatus>
        </form>
        : <form action={confirmAction} className="w-full space-y-5">
          {confirmResponse && <ErrorNote>{confirmResponse}</ErrorNote>}
          <FieldsetWithStatus label="Email" type="email" value={email} onChange={setEmail} />
          <FieldsetWithStatus
            id="code"
            label="Reset code"
            value={code}
            onChange={value => setCode(value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
          />
          <FieldsetWithStatus label="Password" type="password" value={password} onChange={setPassword} />
          <SubmitButtonWithStatus
            disabled={!email || code.length < 6 || !password}
            className="w-full justify-center"
          >
            Reset password
          </SubmitButtonWithStatus>
        </form>}
      <LinkWithStatus href="/sign-in" className="link text-sm">
        Back to sign in
      </LinkWithStatus>
    </AuthContainer>
  );
}

function AuthContainer({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Container
      className={clsx(
        'w-[calc(100vw-1.5rem)] sm:w-[min(400px,90vw)]',
        'max-h-[calc(100dvh-2rem)] overflow-y-auto px-5 py-5 sm:px-6',
      )}
    >
      <div className="self-start">
        <h1 className="text-xl font-semibold text-main sm:text-2xl">
          {title}
        </h1>
        {description &&
          <p className="mt-1 text-sm leading-relaxed text-dim">
            {description}
          </p>}
      </div>
      {children}
    </Container>
  );
}
