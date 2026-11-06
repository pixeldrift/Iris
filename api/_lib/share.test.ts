import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { accept, BadRequest, groupDeleted, createShare, Forbidden, handleShare, inviteConnection, inviteLink, leave, notifyAdded, notifyAssigned, remove, retire, setRole, shareState, stop } from './share'
import { applySync, type Change } from './sync'

const SCHEMA = readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8')
let db: PGlite
const as = (id: string) => ({ userId: id })
const task = (id: string, title: string): Change => ({ kind: 'task', id, data: { id, title }, updatedAt: 10 })

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
  for (const [id, first] of [['ann', 'Ann'], ['bob', 'Bob'], ['cat', 'Cat']]) await db.query("insert into profiles (user_id, email, details) values ($1, $2, $3::jsonb)", [id, `${id}@example.com`, JSON.stringify({ first })])
  await db.query("insert into connections (id, a_user, b_user, status) values ('c1', 'ann', 'bob', 'accepted')")
})

const share = async () => (await createShare(db, as('ann'), { name: 'Trip', rootFolderId: `f-${Math.random()}` })).workspaceId

describe('sharing a group', () => {
  it('invites a connection, who accepts and then sees and edits the group; strangers cannot be invited', async () => {
    const ws = await share()
    await expect(inviteConnection(db, as('ann'), { workspaceId: ws, toUserId: 'cat' })).rejects.toBeInstanceOf(Forbidden) // not connected
    await inviteConnection(db, as('ann'), { workspaceId: ws, toUserId: 'bob', role: 'editor' })
    const st = await shareState(db, as('bob'))
    expect(st.invites).toHaveLength(1)
    expect(st.invites[0]).toMatchObject({ name: 'Trip', from: 'Ann' })
    expect(st.news[0].kind).toBe('share-invite')
    await accept(db, as('bob'), { inviteId: st.invites[0].id })
    // sync: Ann writes into the shared workspace, Bob (an editor) sees it and can add his own
    await applySync(db, 'ann', { cursors: {}, changes: [{ ...task('t1', 'Book flights'), workspaceId: ws }] })
    const bob = await applySync(db, 'bob', { cursors: {}, changes: [{ ...task('t2', 'Pack'), workspaceId: ws }] })
    expect(bob.changes.map((c) => c.id).sort()).toEqual(['t1', 't2'])
    expect(bob.rejected).toEqual([])
    const view = (await shareState(db, as('ann'))).shares.find((s) => s.workspaceId === ws)!
    expect(view.members.map((m) => m.name).sort()).toEqual(['Bob', 'You'])
    // the owner was told
    expect((await shareState(db, as('ann'))).news.some((n) => n.kind === 'share-joined' && n.from === 'Bob')).toBe(true)
  })

  it('a viewer can read but not write; the owner changes roles', async () => {
    const ws = await share()
    await inviteConnection(db, as('ann'), { workspaceId: ws, toUserId: 'bob', role: 'viewer' })
    await accept(db, as('bob'), { inviteId: (await shareState(db, as('bob'))).invites[0].id })
    const w = await applySync(db, 'bob', { cursors: {}, changes: [{ ...task('v1', 'nope'), workspaceId: ws }] })
    expect(w.rejected).toHaveLength(1)
    await expect(setRole(db, as('bob'), { workspaceId: ws, userId: 'bob', role: 'editor' })).rejects.toBeInstanceOf(Forbidden)
    await setRole(db, as('ann'), { workspaceId: ws, userId: 'bob', role: 'editor' })
    expect((await applySync(db, 'bob', { cursors: {}, changes: [{ ...task('v2', 'ok'), workspaceId: ws }] })).rejected).toEqual([])
  })

  it('a link works once, and a wrong or reused token does not', async () => {
    const ws = await share()
    const { token } = await inviteLink(db, as('ann'), { workspaceId: ws })
    await accept(db, as('cat'), { token })
    expect((await shareState(db, as('cat'))).shares.some((s) => s.workspaceId === ws)).toBe(true)
    await expect(accept(db, as('bob'), { token })).rejects.toBeInstanceOf(BadRequest)
    await expect(accept(db, as('bob'), { token: 'nonsense' })).rejects.toBeInstanceOf(BadRequest)
  })

  it('removing someone without a copy cuts them off at once, and tells them', async () => {
    const ws = await share()
    await inviteConnection(db, as('ann'), { workspaceId: ws, toUserId: 'bob' })
    await accept(db, as('bob'), { inviteId: (await shareState(db, as('bob'))).invites[0].id })
    await applySync(db, 'ann', { cursors: {}, changes: [{ ...task('r1', 'secret'), workspaceId: ws }] })
    await remove(db, as('ann'), { workspaceId: ws, userId: 'bob', allowCopy: false })
    const after = await applySync(db, 'bob', { cursors: {}, changes: [] })
    expect(after.changes.some((c) => c.id === 'r1')).toBe(false)
    expect((await shareState(db, as('bob'))).news[0]).toMatchObject({ kind: 'share-removed', extra: 'none', info: 'Trip' })
  })

  it('removing someone with a copy allowed leaves them read-only until they decide; then they leave', async () => {
    const ws = await share()
    await inviteConnection(db, as('ann'), { workspaceId: ws, toUserId: 'bob' })
    await accept(db, as('bob'), { inviteId: (await shareState(db, as('bob'))).invites[0].id })
    await applySync(db, 'ann', { cursors: {}, changes: [{ ...task('k1', 'keepsake'), workspaceId: ws }] })
    await remove(db, as('ann'), { workspaceId: ws, userId: 'bob', allowCopy: true })
    const s = (await shareState(db, as('bob'))).shares.find((x) => x.workspaceId === ws)!
    expect(s).toMatchObject({ status: 'leaving', canCopy: true, role: 'viewer' })
    // still readable (so the app can copy it) but not writable
    const read = await applySync(db, 'bob', { cursors: {}, changes: [{ ...task('k2', 'edit'), workspaceId: ws }] })
    expect(read.changes.some((c) => c.id === 'k1')).toBe(true)
    expect(read.rejected).toHaveLength(1)
    await leave(db, as('bob'), { workspaceId: ws })
    expect((await applySync(db, 'bob', { cursors: {}, changes: [] })).changes.some((c) => c.id === 'k1')).toBe(false)
    // (the owner is not told "left" about someone who was removed: they already know)
    expect((await shareState(db, as('ann'))).news.some((n) => n.kind === 'share-left' && n.workspaceId === ws)).toBe(false)
  })

  it('stopping sharing applies the choice to everyone; a member who simply leaves tells the owner', async () => {
    const ws = await share()
    await inviteConnection(db, as('ann'), { workspaceId: ws, toUserId: 'bob' })
    await accept(db, as('bob'), { inviteId: (await shareState(db, as('bob'))).invites[0].id })
    const { token } = await inviteLink(db, as('ann'), { workspaceId: ws })
    await accept(db, as('cat'), { token })
    await leave(db, as('cat'), { workspaceId: ws })
    expect((await shareState(db, as('ann'))).news.some((n) => n.kind === 'share-left' && n.from === 'Cat')).toBe(true)
    expect((await stop(db, as('ann'), { workspaceId: ws, allowCopy: true })).ended).toBe(1)
    expect((await shareState(db, as('bob'))).shares.find((x) => x.workspaceId === ws)?.status).toBe('leaving')
    await expect(leave(db, as('ann'), { workspaceId: ws })).rejects.toBeInstanceOf(BadRequest) // the owner keeps the group
  })

  it('tells someone a task was given to them, only within a group both are in', async () => {
    const ws = await share()
    await inviteConnection(db, as('ann'), { workspaceId: ws, toUserId: 'bob' })
    await accept(db, as('bob'), { inviteId: (await shareState(db, as('bob'))).invites[0].id })
    await notifyAssigned(db, as('ann'), { workspaceId: ws, userId: 'bob', taskId: 'tx', title: 'Book flights' })
    expect((await shareState(db, as('bob'))).news[0]).toMatchObject({ kind: 'assigned', info: 'Book flights', extra: 'tx', from: 'Ann' })
    await expect(notifyAssigned(db, as('ann'), { workspaceId: ws, userId: 'cat', taskId: 'tx', title: 'x' })).rejects.toBeInstanceOf(Forbidden)
  })

  it('refuses a second share of the same group, and unknown actions', async () => {
    await createShare(db, as('bob'), { name: 'Once', rootFolderId: 'same' })
    await expect(createShare(db, as('bob'), { name: 'Twice', rootFolderId: 'same' })).rejects.toBeInstanceOf(BadRequest)
    await expect(handleShare(db, as('bob'), { action: 'nope' })).rejects.toBeInstanceOf(BadRequest)
  })

  it('tells the other members when a task is added, and lets the owner close an emptied group so it can be shared afresh', async () => {
    const root = `again-${Math.random()}`
    const ws = (await createShare(db, as('ann'), { name: 'Again', rootFolderId: root })).workspaceId
    await inviteConnection(db, as('ann'), { workspaceId: ws, toUserId: 'bob' })
    await accept(db, as('bob'), { inviteId: (await shareState(db, as('bob'))).invites[0].id })
    await notifyAdded(db, as('ann'), { workspaceId: ws, taskId: 'new1', title: 'Pick a hotel' })
    expect((await shareState(db, as('bob'))).news[0]).toMatchObject({ kind: 'task-added', info: 'Pick a hotel', from: 'Ann' })
    // she cannot close it while Bob is in it; once he is out, she can, and the same group can be shared again from scratch
    await expect(retire(db, as('ann'), { workspaceId: ws })).rejects.toBeInstanceOf(Forbidden)
    await remove(db, as('ann'), { workspaceId: ws, userId: 'bob', allowCopy: false })
    await retire(db, as('ann'), { workspaceId: ws })
    expect((await shareState(db, as('ann'))).shares.some((x) => x.workspaceId === ws)).toBe(false)
    const again = await createShare(db, as('ann'), { name: 'Again', rootFolderId: root })
    expect(again.workspaceId).not.toBe(ws)
  })
})

describe('presence and clearing news', () => {
  it('says who has the app open, and clears news without touching an invitation', async () => {
    const ws = (await createShare(db, as('ann'), { name: 'Live', rootFolderId: `live-${Math.random()}` })).workspaceId
    await inviteConnection(db, as('ann'), { workspaceId: ws, toUserId: 'bob' })
    await accept(db, as('bob'), { inviteId: (await shareState(db, as('bob'))).invites[0].id })
    await applySync(db, 'bob', { cursors: {}, changes: [], device: { id: 'bob-phone' }, active: true })
    const view = (await shareState(db, as('ann'))).shares.find((x) => x.workspaceId === ws)!
    expect(view.members.find((m) => m.name === 'Bob')?.active).toBe(true)
    expect(view.members.find((m) => m.name === 'You')?.active).toBe(false) // (Ann has no device checking in)
    await db.query("update devices set last_seen = now() - interval '5 minutes' where user_id = 'bob'")
    expect((await shareState(db, as('ann'))).shares.find((x) => x.workspaceId === ws)!.members.find((m) => m.name === 'Bob')?.active).toBe(false)
    // news is cleared one at a time or all at once; an invitation that has not been answered stays
    await notifyAssigned(db, as('ann'), { workspaceId: ws, userId: 'bob', taskId: 'z', title: 'A' })
    await notifyAssigned(db, as('ann'), { workspaceId: ws, userId: 'bob', taskId: 'y', title: 'B' })
    const news = (await shareState(db, as('bob'))).news
    const one = news.find((n) => n.kind === 'assigned')!
    await handleShare(db, as('bob'), { action: 'clear', id: one.id })
    expect((await shareState(db, as('bob'))).news.some((n) => n.id === one.id)).toBe(false)
    await handleShare(db, as('bob'), { action: 'clear' })
    expect((await shareState(db, as('bob'))).news.filter((n) => n.kind === 'assigned')).toHaveLength(0)
  })
})

describe('deleting a shared group', () => {
  it('tells the others, and closes the share when it is the group the share began with', async () => {
    const ws = (await createShare(db, as('ann'), { name: 'Doomed', rootFolderId: `d-${Math.random()}` })).workspaceId
    await inviteConnection(db, as('ann'), { workspaceId: ws, toUserId: 'bob' })
    await accept(db, as('bob'), { inviteId: (await shareState(db, as('bob'))).invites[0].id })
    // a group inside it, deleted by Bob: Ann is told, the share carries on
    await groupDeleted(db, as('bob'), { workspaceId: ws, name: 'Side', root: false })
    expect((await shareState(db, as('ann'))).news.find((n) => n.kind === 'share-folder-deleted')).toMatchObject({ info: 'Side', from: 'Bob' })
    expect((await shareState(db, as('ann'))).shares.some((x) => x.workspaceId === ws)).toBe(true)
    // the whole group, deleted by Ann: Bob is told, and it is gone for him
    await groupDeleted(db, as('ann'), { workspaceId: ws, name: 'Doomed', root: true })
    const bob = await shareState(db, as('bob'))
    expect(bob.news.find((n) => n.kind === 'share-deleted')).toMatchObject({ info: 'Doomed', from: 'Ann' })
    expect(bob.shares.some((x) => x.workspaceId === ws)).toBe(false)
  })
})
