'use client';

import { useState, type ReactNode } from 'react';
import type { TwoFactorMethod } from '.';

export default function AuthVerificationMethodPicker({
  name = 'twoFactorMethod',
  method,
  availableMethods,
  onChange,
  children,
}: {
  name?: string
  method: TwoFactorMethod
  availableMethods: TwoFactorMethod[]
  onChange: (method: TwoFactorMethod) => void
  children: ReactNode
}) {
  const [showMethods, setShowMethods] = useState(false);

  return <>
    <input type="hidden" name={name} value={method} />
    {showMethods && availableMethods.length > 1
      ? <div className="space-y-2">
        <p className="text-center text-sm font-medium text-main">Verification methods</p>
        <div className="flex flex-col gap-2">
          {availableMethods.map(option => <button
            key={option}
            type="button"
            className="auth-flow-button w-full justify-center"
            onClick={() => {
              onChange(option);
              setShowMethods(false);
            }}
          >
            {option === 'authenticator'
              ? 'Authenticator app'
              : option === 'sms' ? 'SMS verification code' : 'Email verification code'}
          </button>)}
        </div>
      </div>
      : <>
        {children}
        {availableMethods.length > 1 && <button
          type="button"
          className="auth-method-link mx-auto block text-sm underline underline-offset-4"
          onClick={() => setShowMethods(true)}
        >
          View other verification methods
        </button>}
      </>}
  </>;
}
