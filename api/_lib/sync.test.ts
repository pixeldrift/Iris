import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { applySync, BadRequest, parseRequest, type Change, type SyncRequest } from './sync'

const SCHEMA = readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8')
let db: PGlite
const task = (id: string, title: string, updatedAt: number, workspaceId?: string): Change => ({ kind: 'task', id, data: { id, title }, updatedAt, ...(workspaceId ? { workspaceId } : {}) })
// shorthand: `me` is both the user id and the id of their personal workspace
const sync = (me: string, req: Partial<SyncRequest> & { cursor?: number }) => applySync(db, me, { cursors: req.cursor !== undefined ? { [me]: req.cursor } : (req.cursors ?? {}), changes: req.changes ?? [], device: req.device, active: req.active })
const seq = (r: { cursors: Record<string, number> }, me: string) => r.cursors[me] ?? 0

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
})

describe('sync', () => {
  it('stores pushed changes and hands them to another device', async () => {
    const a = await sync('ann', { changes: [task('t1', 'Milk', 10), task('t2', 'Eggs', 10)] })
    expect(a.changes.map((c) => c.id)).toEqual(['t1', 't2'])
    const b = await sync('ann', {})
    expect(b.changes).toHaveLength(2)
    expect((await sync('ann', { cursor: seq(b, 'ann') })).changes).toEqual([])
  })

  it('last write wins per entity, and an older write cannot undo a newer one', async () => {
    await sync('ann', { changes: [task('t3', 'Newer', 50)] })
    await sync('ann', { changes: [task('t3', 'Older', 40)] })
    expect((await sync('ann', {})).changes.find((c) => c.id === 't3')?.data).toMatchObject({ title: 'Newer' })
    await sync('ann', { changes: [task('t3', 'Newest', 60)] })
    const r = (await sync('ann', {})).changes.find((c) => c.id === 't3')
    expect(r?.data).toMatchObject({ title: 'Newest' })
    expect(r?.rev).toBe(2) // written twice (the older write did not count)
    expect(r?.updatedBy).toBe('ann')
  })

  it('deletions travel as tombstones', async () => {
    const before = seq(await sync('ann', {}), 'ann')
    await sync('ann', { changes: [{ kind: 'task', id: 't1', data: null, updatedAt: 99 }] })
    const after = await sync('ann', { cursor: before })
    expect(after.changes).toMatchObject([{ kind: 'task', id: 't1', data: null, updatedAt: 99 }])
  })

  it("keeps each person's data to themselves", async () => {
    await sync('bob', { changes: [task('b1', 'Bob only', 5)] })
    expect((await sync('ann', {})).changes.some((c) => c.id === 'b1')).toBe(false)
  })

  it('pages large pulls', async () => {
    await sync('cy', { changes: Array.from({ length: 500 }, (_, i) => task(`p${i}`, 'x', 1)) })
    await sync('cy', { changes: Array.from({ length: 10 }, (_, i) => task(`q${i}`, 'x', 1)) })
    const first = await sync('cy', {})
    expect(first.more).toBe(true)
    const second = await sync('cy', { cursor: seq(first, 'cy') })
    expect(first.changes.length + second.changes.length).toBe(510)
    expect(second.more).toBe(false)
  })
})

describe('devices open at once', () => {
  it('counts other active devices, not itself, not hidden ones', async () => {
    const solo = await sync('dee', { device: { id: 'laptop' }, active: true })
    expect(solo.peers).toBe(0)
    await sync('dee', { device: { id: 'phone' }, active: true })
    expect((await sync('dee', { device: { id: 'laptop' }, active: true })).peers).toBe(1)
    // a hidden tab does not check in: it sees the two active devices, and nobody sees it
    expect((await sync('dee', { device: { id: 'tablet' }, active: false })).peers).toBe(2)
    expect((await sync('dee', { device: { id: 'laptop' }, active: true })).peers).toBe(1)
  })

  it('forgets a device that has gone quiet', async () => {
    await sync('eve', { device: { id: 'a' }, active: true })
    await sync('eve', { device: { id: 'b' }, active: true })
    await db.query(`update devices set last_seen = now() - interval '5 minutes' where user_id = 'eve' and device_id = 'b'`)
    expect((await sync('eve', { device: { id: 'a' }, active: true })).peers).toBe(0)
  })
})

describe('workspaces (the groundwork for sharing)', () => {
  it("everyone gets a personal workspace, and reads come back tagged with it", async () => {
    const r = await sync('fay', { changes: [task('f1', 'Mine', 1)] })
    expect(r.workspaces).toEqual([{ id: 'fay', name: '', personal: true, role: 'owner' }])
    expect(r.changes[0].workspaceId).toBe('fay')
  })

  it('a shared workspace is read and written by its members, per role', async () => {
    await sync('gus', {})
    await sync('hal', {})
    await db.query(`insert into workspaces (id, name) values ('team', 'Team')`)
    await db.query(`insert into workspace_members (workspace_id, user_id, role) values ('team', 'gus', 'owner'), ('team', 'hal', 'viewer')`)
    const wrote = await sync('gus', { changes: [task('s1', 'Shared', 5, 'team')] })
    expect(wrote.rejected).toEqual([])
    // hal (a viewer) sees it, with its workspace, but cannot change it
    const hal = await sync('hal', {})
    expect(hal.changes.find((c) => c.id === 's1')).toMatchObject({ workspaceId: 'team', updatedBy: 'gus' })
    const denied = await sync('hal', { changes: [task('s1', 'Hal edit', 99, 'team'), task('s2', 'Hal new', 99, 'team')] })
    expect(denied.rejected.map((x) => x.id)).toEqual(['s1', 's2'])
    expect((await sync('gus', {})).changes.find((c) => c.id === 's1')?.data).toMatchObject({ title: 'Shared' })
    // an editor can; and outsiders cannot reach it at all
    await db.query(`update workspace_members set role = 'editor' where workspace_id = 'team' and user_id = 'hal'`)
    expect((await sync('hal', { changes: [task('s1', 'Hal edit', 99, 'team')] })).rejected).toEqual([])
    expect((await sync('gus', {})).changes.find((c) => c.id === 's1')).toMatchObject({ updatedBy: 'hal' })
    expect((await sync('zed', { changes: [task('s3', 'Intruder', 1, 'team')] })).rejected).toHaveLength(1)
    expect((await sync('zed', {})).changes.some((c) => c.id === 's1')).toBe(false)
  })

  it('collaborators in a shared workspace count as peers', async () => {
    await sync('gus', { device: { id: 'g1' }, active: true })
    expect((await sync('hal', { device: { id: 'h1' }, active: true })).peers).toBeGreaterThanOrEqual(1)
  })

  it('keeps a cursor per workspace', async () => {
    const first = await sync('gus', {})
    expect(Object.keys(first.cursors).sort()).toEqual(['gus', 'team'])
    const again = await sync('gus', { cursors: first.cursors })
    expect(again.changes).toEqual([])
  })
})

describe('upgrading the first version of the schema', () => {
  it('turns user-owned rows into personal-workspace rows, keeping order and data', async () => {
    const old = new PGlite()
    await old.exec(`
      create sequence entities_seq;
      create table entities (user_id text not null, kind text not null check (kind in ('task','folder','person')), id text not null, data jsonb,
        updated_at bigint not null, deleted boolean not null default false, seq bigint not null default nextval('entities_seq'), primary key (user_id, kind, id));
      create index entities_pull_idx on entities (user_id, seq);
      insert into entities (user_id, kind, id, data, updated_at) values ('ivy', 'task', 'old1', '{"id":"old1","title":"Before"}', 7);
    `)
    await old.exec(SCHEMA)
    await old.exec(SCHEMA) // and again: safe to re-run
    const r = await applySync(old, 'ivy', { cursors: {}, changes: [] })
    expect(r.changes).toMatchObject([{ id: 'old1', workspaceId: 'ivy', data: { title: 'Before' }, updatedAt: 7 }])
    expect(r.workspaces[0]).toMatchObject({ id: 'ivy', personal: true })
  })
})

describe('request validation', () => {
  it('rejects nonsense', () => {
    expect(() => parseRequest(null)).toThrow(BadRequest)
    expect(() => parseRequest({ cursors: { a: -1 } })).toThrow(BadRequest)
    expect(() => parseRequest({ changes: [{ kind: 'nope', id: 'a', data: {}, updatedAt: 1 }] })).toThrow(BadRequest)
    expect(() => parseRequest({ changes: [{ kind: 'task', id: 'a', data: [], updatedAt: 1 }] })).toThrow(BadRequest)
    expect(() => parseRequest({ changes: Array.from({ length: 501 }, () => task('a', 'b', 1)) })).toThrow(BadRequest)
    expect(() => parseRequest({ device: { id: '' } })).toThrow(BadRequest)
  })
  it('accepts a normal one, and the older single-cursor form', () => {
    expect(parseRequest({ cursors: { me: 3 }, changes: [task('a', 'b', 1)], device: { id: 'd' }, active: true }).changes).toHaveLength(1)
    expect(parseRequest({ cursor: 5, changes: [] }, 'me').cursors).toEqual({ me: 5 })
  })
})
