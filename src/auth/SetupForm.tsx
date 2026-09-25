'use client';

import { useActionState, useState } from 'react';
import Container from '@/components/Container';
import ErrorNote from '@/components/ErrorNote';
import FieldsetWithStatus from '@/components/FieldsetWithStatus';
import SubmitButtonWithStatus from '@/components/SubmitButtonWithStatus';
import LinkWithStatus from '@/components/LinkWithStatus';
import { setupSuperAdminAction, setupWithGoogleAction } from './actions';
import { PATH_SIGN_IN } from '@/app/path';
import { FiShield } from 'react-icons/fi';
import AuthHeading from './AuthHeading';

export default function SetupForm({
  googleSignInEnabled = false,
}: {
  googleSignInEnabled?: boolean
}) {
  const [response, action] = useActionState(setupSuperAdminAction, undefined);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  return (
    <Container
      color="auth"
      className="auth-flow-card w-full max-w-sm space-y-5 rounded-3xl p-5 sm:p-6"
    >
      <AuthHeading
        icon={<FiShield size={21} />}
        title="Set up Media Panel"
        description="Create the first super admin to manage users and access."
        action={<>Already completed setup?{' '}
          <LinkWithStatus href={PATH_SIGN_IN} className="font-medium text-main underline underline-offset-4">Sign in</LinkWithStatus>
        </>}
      />
      {response && <ErrorNote>{response}</ErrorNote>}
      <form action={action} className="space-y-4">
        <FieldsetWithStatus id="name" label="Name" value={name} onChange={setName} required />
        <FieldsetWithStatus id="email" label="Email" type="email" value={email} onChange={setEmail} required />
        <FieldsetWithStatus id="username" label="Username (optional)" value={username} onChange={setUsername} />
        <FieldsetWithStatus id="password" label="Password" type="password" value={password} onChange={setPassword} required />
        <FieldsetWithStatus
          id="confirmPassword"
          label="Confirm password"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          required
        />
        <SubmitButtonWithStatus
          className="auth-flow-button w-full justify-center"
          disabled={!name || !email || !password || !confirmPassword}
        >
          Create super admin
        </SubmitButtonWithStatus>
      </form>
      {googleSignInEnabled && <>
        <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-dim">
          <span className="h-px flex-1 bg-medium" />
          <span>or</span>
          <span className="h-px flex-1 bg-medium" />
        </div>
        <form action={setupWithGoogleAction}>
          <SubmitButtonWithStatus className="auth-flow-button w-full justify-center">
            Set up super admin with Google
          </SubmitButtonWithStatus>
        </form>
      </>}
    </Container>
  );
}
