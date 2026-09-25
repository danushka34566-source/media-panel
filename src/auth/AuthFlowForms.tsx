'use client';

import Container from '@/components/Container';
import ErrorNote from '@/components/ErrorNote';
import FieldsetWithStatus from '@/components/FieldsetWithStatus';
import SubmitButtonWithStatus from '@/components/SubmitButtonWithStatus';
import LinkWithStatus from '@/components/LinkWithStatus';
import { clsx } from 'clsx/lite';
import { FiUserPlus, FiMail, FiKey } from 'react-icons/fi';
import { useActionState, useState } from 'react';
import AuthHeading from './AuthHeading';
import AuthCodeField from './AuthCodeField';
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
    <AuthContainer
      title="Create your account"
      icon={<FiUserPlus size={20} />}
      action={<>Already have an account?{' '}
        <LinkWithStatus href="/sign-in" className="font-medium text-main underline underline-offset-4">Sign in</LinkWithStatus>
      </>}
    >
      <form action={action} className="w-full space-y-5">
        {response && <ErrorNote>{response}</ErrorNote>}
        <FieldsetWithStatus label="Name" value={name} onChange={setName} />
        <FieldsetWithStatus label="Username" value={username} onChange={setUsername} />
        <FieldsetWithStatus label="Email" type="email" value={email} onChange={setEmail} />
        <FieldsetWithStatus label="Password" type="password" value={password} onChange={setPassword} />
        <SubmitButtonWithStatus
          disabled={!name || !username || !email || !password}
          className="auth-flow-button w-full justify-center"
        >
          Create account
        </SubmitButtonWithStatus>
      </form>
    </AuthContainer>
  );
}

export function VerifyEmailForm({ initialEmail }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail ?? '');
  const [code, setCode] = useState('');
  const [response, action] = useActionState(verifyEmailAction, undefined);
  return (
    <AuthContainer
      title="Email verification"
      icon={<FiMail size={20} />}
      description="Enter the six-digit code sent to your inbox."
      action={<LinkWithStatus href="/sign-in" className="font-medium text-main underline underline-offset-4">Back to sign in</LinkWithStatus>}
    >
      <form action={action} className="w-full space-y-5">
        {response && <ErrorNote>{response}</ErrorNote>}
        <FieldsetWithStatus label="Email" type="email" value={email} onChange={setEmail} />
        <AuthCodeField
          id="code"
          label="Verification code"
          value={code}
          onChange={setCode}
        />
        <SubmitButtonWithStatus
          disabled={!email || code.length < 6}
          className="auth-flow-button w-full justify-center"
        >
          Verify account
        </SubmitButtonWithStatus>
      </form>
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
      title={codeSent ? 'Enter reset code' : 'Reset your password'}
      icon={<FiKey size={20} />}
      description={codeSent
        ? 'Enter the six-digit code from your email and choose a new password.'
        : 'We will email you a secure code to confirm this password change.'}
      action={<>Remember your password?{' '}
        <LinkWithStatus href="/sign-in" className="font-medium text-main underline underline-offset-4">Sign in</LinkWithStatus>
      </>}
    >
      {!codeSent
        ? <form action={requestAction} className="w-full space-y-5">
          {requestResponse && <ErrorNote>{requestResponse}</ErrorNote>}
          <FieldsetWithStatus label="Email" type="email" value={email} onChange={setEmail} />
          <SubmitButtonWithStatus
            disabled={!email}
            className="auth-flow-button w-full justify-center"
          >
            Send reset code
          </SubmitButtonWithStatus>
        </form>
        : <form action={confirmAction} className="w-full space-y-5">
          {confirmResponse && <ErrorNote>{confirmResponse}</ErrorNote>}
          <FieldsetWithStatus label="Email" type="email" value={email} onChange={setEmail} />
          <AuthCodeField
            id="code"
            label="Reset code"
            value={code}
            onChange={setCode}
          />
          <FieldsetWithStatus label="Password" type="password" value={password} onChange={setPassword} />
          <SubmitButtonWithStatus
            disabled={!email || code.length < 6 || !password}
            className="auth-flow-button w-full justify-center"
          >
            Reset password
          </SubmitButtonWithStatus>
        </form>}
    </AuthContainer>
  );
}

function AuthContainer({
  title,
  description,
  icon,
  action,
  children,
}: {
  title: string
  description?: string
  icon?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Container
      color="auth"
      className={clsx(
        'w-[min(400px,calc(100vw-1.5rem))]',
        'auth-flow-card rounded-3xl px-5 py-6 sm:px-8 sm:py-7',
      )}
    >
      <AuthHeading icon={icon} title={title} description={description} action={action} />
      {children}
    </Container>
  );
}
