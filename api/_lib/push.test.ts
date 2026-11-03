import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { dueForPush, removeSubscription, rezone, saveSubscription, sweep, type Payload } from './push'
import type { Task } from '../../src/core/types'

const SCHEMA = readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8')
let db: PGlite
const NOW = Date.UTC(2026, 5, 10, 15, 0)
const task = (o: Partial<Task>) => ({ id: 't', title: 'Pay rent', status: 'open', kind: 'todo', remindAt: null, reminded: false, ...o }) as unknown as Task
const sub = (endpoint: string) => ({ subscription: { endpoint, keys: { p256dh: 'p', auth: 'a' } }, timeZone: 'America/Chicago' })

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
})

describe('push', () => {
  it('the bundled core is current', () => {
    const before = readFileSync(new URL('./core.gen.js', import.meta.url), 'utf8')
    execFileSync('node', ['scripts/bundle-core.mjs'])
    expect(readFileSync(new URL('./core.gen.js', import.meta.url), 'utf8')).toBe(before)
  })

  it('rezone reads a wall-clock time in the person’s zone', () => {
    const asServer = new Date(2026, 5, 10, 9, 0).getTime() // 9:00 on the server clock
    expect(rezone(asServer, 'America/Chicago')).toBe(Date.UTC(2026, 5, 10, 14, 0)) // 9:00 CDT
  })

  it('finds due reminders, skips done, reminded and stale ones', () => {
    const tasks = [
      task({ id: 'a', remindAt: NOW - 120_000 }),
      task({ id: 'b', remindAt: NOW - 120_000, reminded: true }),
      task({ id: 'c', remindAt: NOW - 120_000, status: 'done' }),
      task({ id: 'd', remindAt: NOW - 5 * 3_600_000 }),
      task({ id: 'e', remindAt: NOW - 5_000 }), // the open app gets a moment first
      task({ id: 'f', remindAt: NOW + 60_000 }),
    ]
    expect(dueForPush(tasks, NOW, 'UTC').map((d) => d.payload.id)).toEqual(['a'])
  })

  it('pushes an event alert once, in the person’s time zone', async () => {
    const ev = task({ id: 'ev', kind: 'event', title: 'Dentist', day: '2026-06-10', time: '10:15', alerts: [15] })
    // 10:15 in Chicago = 15:15 UTC; the 15-minute alert is due at 15:00 UTC
    expect(dueForPush([ev], NOW + 40_000, 'America/Chicago')[0].payload).toMatchObject({ id: 'ev', body: 'Starts in 15 minutes' })
    expect(dueForPush([ev], NOW - 3_600_000, 'America/Chicago')).toEqual([])
  })

  it('sweeps: sends once to each device, never twice, and forgets dead addresses', async () => {
    await saveSubscription(db, 'ann', sub('https://push.example/1'))
    await saveSubscription(db, 'ann', sub('https://push.example/2'))
    await db.query(`insert into workspaces (id, personal) values ('ann', true)`)
    await db.query(`insert into workspace_members (workspace_id, user_id) values ('ann','ann')`)
    const t = task({ id: 'x', remindAt: NOW - 120_000 })
    await db.query(`insert into entities (workspace_id, kind, id, data, updated_at, seq) values ('ann','task','x',$1,1,1)`, [JSON.stringify(t)])
    const got: Payload[] = []
    const send = async (s: { endpoint: string }, p: Payload) => (got.push(p), s.endpoint.endsWith('/2') ? ('gone' as const) : ('ok' as const))
    expect(await sweep(db, send, NOW)).toEqual({ sent: 1, removed: 1 })
    expect(got).toHaveLength(2)
    expect(await sweep(db, send, NOW + 60_000)).toEqual({ sent: 0, removed: 0 })
    expect((await db.query('select 1 from push_subscriptions')).rows).toHaveLength(1)
  })

  it('validates and removes subscriptions', async () => {
    await expect(saveSubscription(db, 'ann', { subscription: { endpoint: 'http://x', keys: {} } })).rejects.toThrow()
    await removeSubscription(db, 'ann', 'https://push.example/1')
    expect((await db.query('select 1 from push_subscriptions')).rows).toHaveLength(0)
  })
})
