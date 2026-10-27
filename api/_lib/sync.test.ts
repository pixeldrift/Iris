import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { applySync, BadRequest, parseRequest, type Change } from './sync'

let db: PGlite
const task = (id: string, title: string, updatedAt: number): Change => ({ kind: 'task', id, data: { id, title }, updatedAt })

beforeAll(async () => {
  db = new PGlite()
  await db.exec(readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8'))
  for (const id of ['ann', 'bob']) {
    await db.query(`insert into "user" (id, name, email, "emailVerified", "updatedAt") values ($1, $1, $1 || '@x.test', false, now())`, [id])
  }
})

describe('sync', () => {
  it('stores pushed changes and hands them to another device', async () => {
    const a = await applySync(db, 'ann', { cursor: 0, changes: [task('t1', 'Milk', 10), task('t2', 'Eggs', 10)] })
    expect(a.changes.map((c) => c.id)).toEqual(['t1', 't2'])
    const b = await applySync(db, 'ann', { cursor: 0, changes: [] })
    expect(b.changes).toHaveLength(2)
    // a device that has seen everything gets nothing back
    expect((await applySync(db, 'ann', { cursor: b.cursor, changes: [] })).changes).toEqual([])
  })

  it('last write wins per entity, and an older write cannot undo a newer one', async () => {
    await applySync(db, 'ann', { cursor: 0, changes: [task('t3', 'Newer', 50)] })
    await applySync(db, 'ann', { cursor: 0, changes: [task('t3', 'Older', 40)] })
    const r = await applySync(db, 'ann', { cursor: 0, changes: [] })
    expect(r.changes.find((c) => c.id === 't3')?.data).toMatchObject({ title: 'Newer' })
    await applySync(db, 'ann', { cursor: 0, changes: [task('t3', 'Newest', 60)] })
    expect((await applySync(db, 'ann', { cursor: 0, changes: [] })).changes.find((c) => c.id === 't3')?.data).toMatchObject({ title: 'Newest' })
  })

  it('deletions travel as tombstones', async () => {
    const before = (await applySync(db, 'ann', { cursor: 0, changes: [] })).cursor
    await applySync(db, 'ann', { cursor: before, changes: [{ kind: 'task', id: 't1', data: null, updatedAt: 99 }] })
    const after = await applySync(db, 'ann', { cursor: before, changes: [] })
    expect(after.changes).toEqual([{ kind: 'task', id: 't1', data: null, updatedAt: 99 }])
  })

  it('keeps each person\'s data to themselves', async () => {
    await applySync(db, 'bob', { cursor: 0, changes: [task('b1', 'Bob only', 5)] })
    const ann = await applySync(db, 'ann', { cursor: 0, changes: [] })
    expect(ann.changes.some((c) => c.id === 'b1')).toBe(false)
  })

  it('pages large pulls', async () => {
    const many = Array.from({ length: 500 }, (_, i) => task(`p${i}`, 'x', 1))
    await applySync(db, 'bob', { cursor: 0, changes: many })
    await applySync(db, 'bob', { cursor: 0, changes: Array.from({ length: 10 }, (_, i) => task(`q${i}`, 'x', 1)) })
    const first = await applySync(db, 'bob', { cursor: 0, changes: [] })
    expect(first.more).toBe(true)
    const second = await applySync(db, 'bob', { cursor: first.cursor, changes: [] })
    expect(first.changes.length + second.changes.length).toBe(511)
    expect(second.more).toBe(false)
  })
})

describe('request validation', () => {
  it('rejects nonsense', () => {
    expect(() => parseRequest(null)).toThrow(BadRequest)
    expect(() => parseRequest({ cursor: -1 })).toThrow(BadRequest)
    expect(() => parseRequest({ changes: [{ kind: 'nope', id: 'a', data: {}, updatedAt: 1 }] })).toThrow(BadRequest)
    expect(() => parseRequest({ changes: [{ kind: 'task', id: 'a', data: [], updatedAt: 1 }] })).toThrow(BadRequest)
    expect(() => parseRequest({ changes: Array.from({ length: 501 }, () => task('a', 'b', 1)) })).toThrow(BadRequest)
  })
  it('accepts a normal one', () => {
    expect(parseRequest({ cursor: 3, changes: [task('a', 'b', 1)] }).changes).toHaveLength(1)
  })
})
