import { betterAuth } from 'better-auth'
import { getPool } from './db'

/**
 * Accounts: Better Auth with email + password, storing users and sessions in the same Neon database.
 * Sessions are httpOnly cookies on the app's own origin, so the web app and /api share them.
 */
export const auth = betterAuth({
  database: getPool(),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [process.env.BETTER_AUTH_URL, process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`, process.env.VERCEL_BRANCH_URL && `https://${process.env.VERCEL_BRANCH_URL}`, 'http://localhost:3000', 'http://localhost:5173'].filter(
    (x): x is string => !!x,
  ),
  emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
})
