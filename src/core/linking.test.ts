import { describe, expect, it } from 'vitest'
import { applyShared, detailsOf, findExisting, mergeLinkedDuplicates, unlink } from './linking'
import type { Person } from './types'

const base = (over: Partial<Person> = {}): Person => ({ id: 'p', name: 'Bobby', first: 'Bobby', last: '', phone: '', email: 'bob@x.com', address: '', notes: 'my note', hue: 1, favorite: false, createdAt: 1, link: { userId: 'u', got: [] }, ...over })

describe('linked entries', () => {
  it('fill in what is shared and leave the rest to you', () => {
    const p = applyShared(base(), { first: 'Robert', last: 'Test', phone: '555', email: 'secret@x.com' }, ['name', 'phone'])
    expect(p).toMatchObject({ name: 'Robert Test', first: 'Robert', phone: '555', email: 'bob@x.com', notes: 'my note' })
    expect(p.link).toEqual({ userId: 'u', got: ['name', 'phone'] })
  })

  it('takes back a field that stops being shared, but not the name', () => {
    const p1 = applyShared(base(), { first: 'Robert', phone: '555', birthday: '2000-01-01' }, ['name', 'phone', 'birthday'])
    const p2 = applyShared(p1, { first: 'Robert' }, ['name'])
    expect(p2).toMatchObject({ name: 'Robert', phone: '', birthday: null })
    expect(applyShared(p2, { first: 'Robert' }, ['name'])).toBe(p2) // nothing changed: the same object back
  })

  it('follows a change in their details', () => {
    const p1 = applyShared(base(), { first: 'Robert', address: '1 Main St', city: 'Hilo' }, ['name', 'address'])
    expect(applyShared(p1, { first: 'Robert', address: '2 Oak St', city: 'Hilo' }, ['name', 'address']).address).toBe('2 Oak St')
  })

  it('ending a connection removes what was shared; a deleted account keeps it as a plain contact', () => {
    const p = applyShared(base(), { first: 'Robert', phone: '555' }, ['name', 'phone'])
    expect(unlink(p, false)).toMatchObject({ phone: '', name: 'Robert', notes: 'my note' })
    expect(unlink(p, false).link).toBeUndefined()
    const kept = unlink(p, true)
    expect(kept.phone).toBe('555')
    expect(kept.link).toBeUndefined()
  })

  it('offers your own entry as details, leaving out what is empty', () => {
    expect(detailsOf(base({ link: undefined, first: 'Ann', last: 'T', phone: '1' }))).toEqual({ first: 'Ann', last: 'T', phone: '1', email: 'bob@x.com' })
  })

  it('finds the entry that is already yours by email, then phone, then name, but only when it is unambiguous', () => {
    const a = base({ id: 'a', link: undefined, name: 'Eric F', email: 'eric@x.com' })
    const b = base({ id: 'b', link: undefined, name: 'Someone', email: '', phone: '(808) 555-0100' })
    const c = base({ id: 'c', link: undefined, name: 'Pat Q', email: '', phone: '' })
    expect(findExisting([a, b, c], { email: 'ERIC@x.com' })?.id).toBe('a')
    expect(findExisting([a, b, c], { fields: { phone: '808-555-0100' } })?.id).toBe('b')
    expect(findExisting([a, b, c], { name: 'pat q' })?.id).toBe('c')
    expect(findExisting([a, { ...a, id: 'a2' }], { email: 'eric@x.com' })).toBeUndefined() // two candidates: not guessed
    expect(findExisting([base({ id: 'm', isMe: true, link: undefined, email: 'eric@x.com' })], { email: 'eric@x.com' })).toBeUndefined() // never yourself
  })

  it('two entries for the same connected person become one, keeping the one made by hand and re-pointing tasks', () => {
    const hand = base({ id: 'orig', name: 'Eric', notes: 'met at the lab', createdAt: 5, link: { userId: 'u', got: ['name'] } })
    const made = base({ id: 'link-u', name: 'Eric Farrugia', phone: '555', notes: '', createdAt: 9, link: { userId: 'u', got: ['name', 'phone'] } })
    const tasks = [{ personIds: ['link-u'] }, { personIds: ['orig', 'link-u'] }, { personIds: [] }]
    const r = mergeLinkedDuplicates([made, hand], tasks)
    expect(r.changed).toBe(true)
    expect(r.people).toHaveLength(1)
    expect(r.people[0]).toMatchObject({ id: 'orig', notes: 'met at the lab', phone: '555' })
    expect(r.people[0].link?.got).toEqual(['name', 'phone'])
    expect(r.tasks.map((t) => t.personIds)).toEqual([['orig'], ['orig'], []])
    expect(mergeLinkedDuplicates(r.people, r.tasks).changed).toBe(false)
  })
})
