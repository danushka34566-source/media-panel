'use client';

import { useActionState, useState } from 'react';
import Container from '@/components/Container';
import ErrorNote from '@/components/ErrorNote';
import FieldsetWithStatus from '@/components/FieldsetWithStatus';
import SubmitButtonWithStatus from '@/components/SubmitButtonWithStatus';
import LinkWithStatus from '@/components/LinkWithStatus';
import { setupSuperAdminAction, setupWithGoogleAction } from './actions';
import { PATH_SIGN_IN } from '@/app/path';

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
    <Container className="w-[calc(100vw-1.5rem)] space-y-5 px-6 py-5 sm:w-[min(420px,90vw)]">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl text-main">Set up Media Panel</h1>
        <p className="text-sm text-dim">
          Create the first super admin. This account controls administrators,
          users, and destructive actions.
        </p>
      </div>
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
          className="w-full justify-center"
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
          <SubmitButtonWithStatus className="w-full justify-center">
            Set up super admin with Google
          </SubmitButtonWithStatus>
        </form>
      </>}
      <p className="text-center text-sm text-dim">
        Already completed setup?{' '}
        <LinkWithStatus href={PATH_SIGN_IN} className="link">Sign in</LinkWithStatus>
      </p>
    </Container>
  );
}
