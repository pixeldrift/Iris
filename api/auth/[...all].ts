import { auth } from '../_lib/auth'

/** Everything under /api/auth/*: sign up, sign in, sign out, session. Handled by Better Auth. */
const handler = (request: Request) => auth.handler(request)
export const GET = handler
export const POST = handler
