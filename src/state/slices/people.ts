import { nextHue } from '../../core/folders'
import { fullName, MAX_FAVORITES, splitName } from '../../core/people'
import type { Person } from '../../core/types'
import { initial, uid } from '../defaults'
import type { SetState, GetState, PeopleSlice } from '../types'

export const createPeopleSlice = (set: SetState, get: GetState): PeopleSlice => ({
      people: initial.people,

      savePerson: (p) => {
        const existing = p.id ? get().people.find((x) => x.id === p.id) : undefined
        // the sidebar has room for six favorites: a seventh is saved, just not hearted
        if (p.favorite && !existing?.favorite && get().people.filter((x) => x.favorite && x.id !== p.id).length >= MAX_FAVORITES) {
          p = { ...p, favorite: false }
          get().showToast(`The sidebar keeps ${MAX_FAVORITES} favorites. Unheart someone to make room.`)
        }
        if (existing) {
          set((s) => ({ people: s.people.map((x) => (x.id === existing.id ? { ...x, ...p } : x)) }))
          return existing.id
        }
        const person: Person = {
          id: uid(),
          phone: '',
          email: '',
          address: '',
          notes: '',
          hue: nextHue(get().people.length + 3),
          favorite: false,
          createdAt: Date.now(),
          ...p,
        }
        set((s) => ({ people: [...s.people, person] }))
        return person.id
      },
      ensureMe: (user) => {
        const id = `me-${user.id}`
        if (get().people.some((p) => p.id === id)) return
        const n = splitName(user.name || user.email.split('@')[0])
        set((s) => ({
          people: [...s.people, { id, name: fullName(n.first, n.last), first: n.first, last: n.last, phone: '', email: user.email, address: '', notes: '', hue: 285, favorite: false, isMe: true, createdAt: Date.now() }],
        }))
      },
      togglePersonFavorite: (id) => {
        const p = get().people.find((x) => x.id === id)
        if (!p) return
        if (!p.favorite && get().people.filter((x) => x.favorite && !x.isMe).length >= MAX_FAVORITES) {
          get().showToast(`The sidebar keeps ${MAX_FAVORITES} favorites. Unheart someone to make room.`)
          return
        }
        set((s) => ({ people: s.people.map((x) => (x.id === id ? { ...x, favorite: !x.favorite } : x)) }))
      },
      deletePerson: (id) =>
        set((s) => ({
          people: s.people.filter((p) => p.id !== id),
          tasks: s.tasks.map((t) => ({ ...t, personIds: t.personIds.filter((x) => x !== id) })),
          scope: s.scope.type === 'person' && s.scope.id === id ? { type: 'all' } : s.scope,
        })),
})
