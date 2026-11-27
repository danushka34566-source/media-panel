'use client';

import Container from '@/components/Container';
import ErrorNote from '@/components/ErrorNote';
import Note from '@/components/Note';
import FieldsetWithStatus from '@/components/FieldsetWithStatus';
import SubmitButtonWithStatus from '@/components/SubmitButtonWithStatus';
import LinkWithStatus from '@/components/LinkWithStatus';
import BackLink from '@/components/BackLink';
import { clsx } from 'clsx/lite';
import { FiUserPlus, FiMail, FiKey } from 'react-icons/fi';
import { useActionState, useState } from 'react';
import AuthHeading from './AuthHeading';
import AuthCodeField from './AuthCodeField';
import { SIGNUP_VERIFICATION_REQUESTED } from '.';
import {
  confirmPasswordResetAction,
  confirmProfileEmailChangeAction,
  requestPasswordResetAction,
  resendProfileEmailChangeCodeAction,
  resendSignUpVerificationAction,
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
        <FieldsetWithStatus label="Name" autoComplete="name" value={name} onChange={setName} />
        <FieldsetWithStatus label="Username" autoComplete="username" value={username} onChange={setUsername} />
        <FieldsetWithStatus label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} />
        <FieldsetWithStatus label="Password" type="password" autoComplete="new-password" value={password} onChange={setPassword} />
        <SubmitButtonWithStatus
          disabled={!name || !username || !email || !password}
          className="auth-flow-button w-full justify-center"
        >
          Create account
        </SubmitButtonWithStatus>
        {email && <LinkWithStatus
          href={`/verify-email?email=${encodeURIComponent(email)}`}
          className="block text-center text-sm underline underline-offset-4"
        >
          Resend an email verification code
        </LinkWithStatus>}
      </form>
    </AuthContainer>
  );
}

export function VerifyEmailForm({
  initialEmail,
  initialDeliveryFailed,
  initialDeliverySucceeded,
  isEmailChange = false,
}: {
  initialEmail?: string
  initialDeliveryFailed?: boolean
  initialDeliverySucceeded?: boolean
  isEmailChange?: boolean
}) {
  const [email, setEmail] = useState(initialEmail ?? '');
  const [code, setCode] = useState('');
  const [verificationError, setVerificationError] = useState<string>();
  const [delivery, setDelivery] = useState(initialDeliveryFailed
    ? {
      error: true,
      message: isEmailChange
        ? 'Could not send the verification email. Request another code below.'
        : 'Your account was created, but the verification email could not be sent. Request another code below.',
    }
    : initialDeliverySucceeded
      ? { error: false, message: 'Verification code sent. Check your email.' }
      : undefined);
  const [, verifyAction, isVerifying] = useActionState(
    async (_state: undefined, formData: FormData) => {
      const verify = isEmailChange ? confirmProfileEmailChangeAction : verifyEmailAction;
      setVerificationError(await verify(undefined, formData));
      return undefined;
    }, undefined);
  const [, resendAction, isResending] = useActionState(
    async (_state: undefined, formData: FormData) => {
      setDelivery(undefined);
      const resend = isEmailChange
        ? resendProfileEmailChangeCodeAction : resendSignUpVerificationAction;
      const response = await resend(undefined, formData);
      const isSent = response === 'SENT' || response === SIGNUP_VERIFICATION_REQUESTED;
      if (isSent) {
        setCode('');
        setVerificationError(undefined);
      }
      setDelivery({
        error: !isSent,
        message: response === 'SENT' ? 'Verification code sent. Check your email.' : response,
      });
      return undefined;
    }, undefined);
  return (
    <AuthContainer
      title={isEmailChange ? 'Verify your new email' : 'Email verification'}
      icon={<FiMail size={20} />}
      description="Enter the six-digit code sent to your inbox."
      action={<BackLink
        href={isEmailChange ? '/profile' : '/sign-in'}
        matchPath
        className="font-medium text-main underline underline-offset-4"
      >
        {isEmailChange ? 'Back to profile' : 'Back to sign in'}
      </BackLink>}
    >
      <form action={verifyAction} className="w-full space-y-5">
        {delivery && (delivery.error
          ? <ErrorNote>{delivery.message}</ErrorNote>
          : <Note role="status">{delivery.message}</Note>)}
        {verificationError && <ErrorNote>{verificationError}</ErrorNote>}
        <FieldsetWithStatus
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          readOnly={isEmailChange || isResending}
          onChange={value => {
            setEmail(value);
            setCode('');
            setVerificationError(undefined);
            setDelivery(undefined);
          }}
        />
        <AuthCodeField
          id="code"
          label="Verification code"
          value={code}
          onChange={value => {
            setCode(value);
            setVerificationError(undefined);
          }}
        />
        <SubmitButtonWithStatus
          disabled={!email || code.length < 6 || isResending}
          className="auth-flow-button w-full justify-center"
        >
          {isEmailChange ? 'Verify email' : 'Verify account'}
        </SubmitButtonWithStatus>
      </form>
      <form action={resendAction} className="w-full">
        <input type="hidden" name="email" value={email} />
        <SubmitButtonWithStatus
          disabled={!email || isVerifying}
          className="auth-flow-button w-full justify-center"
        >
          Resend verification code
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
          <FieldsetWithStatus label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} />
          <SubmitButtonWithStatus
            disabled={!email}
            className="auth-flow-button w-full justify-center"
          >
            Send reset code
          </SubmitButtonWithStatus>
        </form>
        : <form action={confirmAction} className="w-full space-y-5">
          {confirmResponse && <ErrorNote>{confirmResponse}</ErrorNote>}
          <FieldsetWithStatus label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} />
          <AuthCodeField
            id="code"
            label="Reset code"
            value={code}
            onChange={setCode}
          />
          <FieldsetWithStatus id="password" label="New password" type="password" autoComplete="new-password" value={password} onChange={setPassword} />
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
        'auth-flow-card w-full max-w-sm rounded-lg bg-content p-5 sm:p-6',
      )}
    >
      <AuthHeading icon={icon} title={title} description={description} action={action} />
      {children}
    </Container>
  );
}
