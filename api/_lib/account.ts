import type { Db } from './db.js'

/**
 * Delete everything held for one person: the data in their personal workspace, their membership of any shared
 * one, the record of their open devices, and finally their sign-in itself (the Neon Auth tables live in the same
 * database, in the `neon_auth` schema). The login removal is best-effort: if the schema or its tables are not where
 * expected, the data is still gone and `authRemoved` says the login was not.
 */
export async function deleteAccount(db: Db, userId: string): Promise<{ authRemoved: boolean }> {
  await db.query('delete from devices where user_id = $1', [userId])
  // their connections go with them; the other side's address-book entry stays, as a plain contact
  await db.query('delete from connections where a_user = $1 or b_user = $1', [userId])
  await db.query('delete from notifications where user_id = $1 or from_user = $1', [userId])
  await db.query('delete from invite_attempts where user_id = $1', [userId])
  await db.query('delete from profiles where user_id = $1', [userId])
  await db.query('delete from workspace_members where user_id = $1', [userId])
  // entities go with their workspace (on delete cascade)
  await db.query('delete from workspaces where id = $1 and personal = true', [userId])
  // each step on its own: a table or column that is named differently must not stop the others
  const attempt = async (sql: string) => {
    try {
      await db.query(sql, [userId])
      return true
    } catch (e) {
      console.warn('account: login cleanup step failed:', (e as Error).message)
      return false
    }
  }
  await attempt('delete from neon_auth."session" where "userId" = $1')
  await attempt('delete from neon_auth."account" where "userId" = $1')
  const authRemoved = await attempt('delete from neon_auth."user" where id = $1')
  return { authRemoved }
}
