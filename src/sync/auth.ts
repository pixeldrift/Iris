import { createAuthClient } from 'better-auth/react'

/** Talks to /api/auth/* on the same origin (sessions are httpOnly cookies). */
export const authClient = createAuthClient()
