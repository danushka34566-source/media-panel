'use client';

import { useAppState } from '@/app/AppState';
import SignInForm from '@/auth/SignInForm';
import clsx from 'clsx/lite';
import MediaUploadWithStatus from '@/media/MediaUploadWithStatus';
import { useAppText } from '@/i18n/state/client';

export default function SignInOrUploadClient({
  shouldResize,
  onLastUpload,
}: {
  shouldResize: boolean
  onLastUpload: () => Promise<void>
}) {
  const { isUserSignedIn, canUpload, isCheckingAuth } = useAppState();

  const appText = useAppText();

  return (
    <div className={clsx(
      'flex justify-center items-center flex-col gap-4',
      'min-h-[4.5rem]',
    )}>
      <div>
        {isCheckingAuth
          ? appText.utility.loading
          : canUpload
            ? appText.onboarding.setupFirstMedia
            : isUserSignedIn
              ? 'Your account does not have upload access.'
              : appText.onboarding.setupSignIn}
      </div>
      {!isCheckingAuth && isUserSignedIn === false &&
        <div className="flex justify-center my-2 sm:my-4">
          <SignInForm
            className="max-w-[90%] sm:max-w-none"
            includeTitle={false}
            shouldRedirect={false}
          />
        </div>}
      {canUpload &&
        <MediaUploadWithStatus
          inputId="admin-cta"
          shouldResize={shouldResize}
          onLastUpload={onLastUpload}
          showStatusText={false}
        />}
    </div>
  );
}
