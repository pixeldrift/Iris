import { describe, expect, it } from 'vitest'
import { emptyMemory, hashOf, keyOf, localChanges, remoteToApply, type Entity } from './diff'

const task = (id: string, title: string): Entity => ({ kind: 'task', id, data: { id, title } })

describe('localChanges', () => {
  it('pushes everything the first time', () => {
    const { changes } = localChanges([task('a', 'A'), task('b', 'B')], emptyMemory(), 100)
    expect(changes.map((c) => c.id)).toEqual(['a', 'b'])
    expect(changes.every((c) => c.updatedAt === 100)).toBe(true)
  })

  it('pushes only what changed, and tombstones what disappeared', () => {
    const mem = { ...emptyMemory(), known: { [keyOf('task', 'a')]: hashOf({ id: 'a', title: 'A' }), [keyOf('task', 'b')]: hashOf({ id: 'b', title: 'B' }), [keyOf('task', 'gone')]: 'x' } }
    const { changes, stamps } = localChanges([task('a', 'A'), task('b', 'B edited')], mem, 200)
    expect(changes.map((c) => [c.id, c.data === null])).toEqual([
      ['b', false],
      ['gone', true],
    ])
    expect(stamps[keyOf('task', 'b')]).toBe(200)
    expect(stamps[keyOf('task', 'a')]).toBeUndefined()
  })

  it('has nothing to say when nothing changed', () => {
    const mem = { ...emptyMemory(), known: { [keyOf('task', 'a')]: hashOf({ id: 'a', title: 'A' }) } }
    expect(localChanges([task('a', 'A')], mem, 1).changes).toEqual([])
  })
})

describe('remoteToApply', () => {
  it('skips entities edited here while the request was in flight', () => {
    const remote = [
      { kind: 'task' as const, id: 'a', data: { id: 'a' }, updatedAt: 5 },
      { kind: 'task' as const, id: 'b', data: { id: 'b' }, updatedAt: 5 },
    ]
    const pushed = new Map([['task:a', 'h1'], ['task:b', 'h2']])
    const current = new Map([['task:a', 'h1'], ['task:b', 'EDITED']])
    expect(remoteToApply(remote, current, pushed).map((c) => c.id)).toEqual(['a'])
  })
  it('applies new entities this device has never had', () => {
    const remote = [{ kind: 'task' as const, id: 'n', data: { id: 'n' }, updatedAt: 5 }]
    expect(remoteToApply(remote, new Map(), new Map())).toHaveLength(1)
  })
})

describe('workspaces', () => {
  it('sends the workspace along, including for a deletion', () => {
    const shared: Entity = { kind: 'task', id: 's', data: { id: 's', title: 'S' }, workspaceId: 'team' }
    expect(localChanges([shared], emptyMemory(), 5).changes[0].workspaceId).toBe('team')
    const mem = { ...emptyMemory(), known: { [keyOf('task', 's')]: 'x' }, wsOf: { [keyOf('task', 's')]: 'team' } }
    expect(localChanges([], mem, 6).changes).toEqual([{ kind: 'task', id: 's', data: null, updatedAt: 6, workspaceId: 'team' }])
  })
})
