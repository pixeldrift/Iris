import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { deleteAccount } from './account'
import { BadRequest, connectState, disconnect, invite, putProfile, respond, setShares, TooMany } from './connect'
import type { Caller } from './verify'

let db: PGlite
const ann: Caller = { userId: 'ann', email: 'Ann@Example.com', emailVerified: true }
const bob: Caller = { userId: 'bob', email: 'bob@example.com', emailVerified: true }
const cy: Caller = { userId: 'cy', email: 'cy@example.com', emailVerified: false }
const details = (first: string, extra: Record<string, string> = {}) => ({ first, last: 'Test', phone: '555-0100', email: `${first.toLowerCase()}@example.com`, address: '1 Main St', birthday: '1990-04-02', ...extra })

beforeAll(async () => {
  db = new PGlite()
  await db.exec(readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8'))
  await putProfile(db, ann, { details: details('Ann') })
  await putProfile(db, bob, { details: details('Bob') })
  await putProfile(db, cy, { details: details('Cy') })
})

describe('connections', () => {
  it('answers the same whether or not the address belongs to anyone', async () => {
    const known = await invite(db, ann, { email: 'bob@example.com', personId: 'p-bob', shares: ['name', 'email'] })
    const unknown = await invite(db, ann, { email: 'nobody@example.com', shares: ['name'] })
    const unverified = await invite(db, ann, { email: 'cy@example.com', shares: ['name'] })
    expect(known).toEqual(unknown)
    expect(unverified).toEqual(unknown)
    // …and nothing is shown to the sender beyond "pending"
    const s = await connectState(db, ann)
    expect(s.connections).toHaveLength(1)
    expect(s.connections[0]).toMatchObject({ status: 'pending-out', userId: null, name: null, fields: {} })
  })

  it('only a verified address that has not hidden itself can be matched', async () => {
    await putProfile(db, { userId: 'dee', email: 'dee@example.com', emailVerified: true }, { details: details('Dee'), findable: false })
    await invite(db, ann, { email: 'dee@example.com', shares: [] })
    expect((await connectState(db, { userId: 'dee' })).notifications).toHaveLength(0)
    expect((await connectState(db, cy)).notifications).toHaveLength(0)
  })

  it('the person asked sees who is asking, and accepting shares only what each side chose', async () => {
    const s = await connectState(db, bob)
    expect(s.unread).toBe(1)
    expect(s.connections[0]).toMatchObject({ status: 'pending-in', name: 'Ann Test', email: 'ann@example.com', fields: {} })
    await respond(db, bob, { id: s.connections[0].id, action: 'accept', shares: ['name', 'phone'], personId: 'p-ann' })
    const a = await connectState(db, ann)
    const c = a.connections[0]
    expect(c).toMatchObject({ status: 'accepted', userId: 'bob', personId: 'p-bob', theirShares: ['name', 'phone'], myShares: ['name', 'email'] })
    // Bob shared name and phone: no email, address or birthday leaves the server
    expect(c.fields).toEqual({ first: 'Bob', last: 'Test', phone: '555-0100' })
    const b = (await connectState(db, bob)).connections[0]
    expect(b.fields).toEqual({ first: 'Ann', last: 'Test', email: 'ann@example.com' })
    expect(a.notifications.some((n) => n.kind === 'accepted' && n.from === 'Bob Test')).toBe(true)
  })

  it('what is shared can be changed, and updates flow through', async () => {
    const id = (await connectState(db, bob)).connections[0].id
    await setShares(db, bob, { id, shares: ['name', 'birthday'] })
    expect((await connectState(db, ann)).connections[0].fields).toEqual({ first: 'Bob', last: 'Test', birthday: '1990-04-02' })
    await putProfile(db, bob, { details: details('Bob', { birthday: '1991-01-01' }) })
    expect((await connectState(db, ann)).connections[0].fields.birthday).toBe('1991-01-01')
  })

  it('a declined or blocked request looks pending to the sender, and does not come back', async () => {
    await putProfile(db, { userId: 'eli', email: 'eli@example.com', emailVerified: true }, { details: details('Eli') })
    await invite(db, ann, { email: 'eli@example.com', shares: ['name'] })
    const eli = { userId: 'eli' }
    const req = (await connectState(db, eli)).connections[0]
    await respond(db, eli, { id: req.id, action: 'block' })
    expect((await connectState(db, eli)).connections).toHaveLength(0)
    expect((await connectState(db, ann)).connections.find((c) => c.id === req.id)?.status).toBe('pending-out')
    await invite(db, ann, { email: 'eli@example.com', shares: ['name'] })
    expect((await connectState(db, eli)).notifications.filter((n) => n.kind === 'request')).toHaveLength(1)
    await expect(respond(db, eli, { id: req.id, action: 'accept' })).rejects.toBeInstanceOf(BadRequest)
  })

  it('disconnecting ends it for both; deleting an account removes the connection', async () => {
    const id = (await connectState(db, ann)).connections.find((c) => c.status === 'accepted')!.id
    await disconnect(db, ann, { id })
    expect((await connectState(db, bob)).connections.find((c) => c.id === id)).toMatchObject({ status: 'ended', fields: {}, endedByMe: false })
    await invite(db, ann, { email: 'bob@example.com', personId: 'p-bob2', shares: ['name'] }) // a fresh request after it ended
    expect((await connectState(db, bob)).connections.some((c) => c.status === 'pending-in')).toBe(true)
    await deleteAccount(db, 'ann')
    expect((await connectState(db, bob)).connections).toHaveLength(0)
  })

  it('slows down someone asking about many addresses', async () => {
    await putProfile(db, { userId: 'zed', email: 'zed@example.com', emailVerified: true })
    for (let i = 0; i < 25; i++) await invite(db, { userId: 'zed', email: 'zed@example.com' }, { email: `x${i}@example.com`, shares: [] })
    await expect(invite(db, { userId: 'zed' }, { email: 'one-more@example.com', shares: [] })).rejects.toBeInstanceOf(TooMany)
  })
})
