import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { deleteAccount } from './account'
import { applySync } from './sync'

const SCHEMA = readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8')
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
})

describe('deleting an account', () => {
  it('removes that person\'s data and devices and leaves everyone else alone', async () => {
    const t = (id: string) => ({ kind: 'task' as const, id, data: { id, title: id }, updatedAt: 1 })
    await applySync(db, 'ann', { cursors: {}, changes: [t('a1'), t('a2')], device: { id: 'd1', label: 'phone' }, active: true })
    await applySync(db, 'bob', { cursors: {}, changes: [t('b1')] })
    const out = await deleteAccount(db, 'ann')
    expect(out.authRemoved).toBe(false) // no neon_auth schema in this test database
    expect(((await applySync(db, 'ann', { cursors: {}, changes: [] })).changes)).toEqual([])
    expect(((await applySync(db, 'bob', { cursors: {}, changes: [] })).changes).map((c) => c.id)).toEqual(['b1'])
    const dev = await db.query('select count(*)::int as n from devices where user_id = $1', ['ann'])
    expect((dev.rows[0] as { n: number }).n).toBe(0)
  })
})
