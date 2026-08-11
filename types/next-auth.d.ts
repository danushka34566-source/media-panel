declare module 'next-auth' {
  interface User {
    id?: string
    role?: string
    twoFactorPending?: boolean
    status?: string
  }

  interface Session {
    user?: {
      id?: string
      role?: string
      twoFactorPending?: boolean
      status?: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: string
    twoFactorPending?: boolean
    loginVerificationNonce?: string
    status?: string
  }
}

export {};
