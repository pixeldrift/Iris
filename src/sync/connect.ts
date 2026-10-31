import { create } from 'zustand'
import { applyShared, detailsOf, unlink } from '../core/linking'
import { fullName } from '../core/people'
import type { Person } from '../core/types'
import { suppressHistory } from '../state/history'
import { useStore } from '../state/store'
import { apiToken } from './auth'

/** One connection as the server describes it to this person (see api/_lib/connect.ts). */
export interface Connection {
  id: string
  status: 'pending-in' | 'accepted' | 'ended'
  userId: string | null
  name: string | null
  email: string | null
  myShares: string[]
  theirShares: string[]
  fields: Record<string, string>
  personId: string | null
  endedByMe: boolean
}
export interface Notice {
  id: string
  kind: 'request' | 'accepted'
  connectionId: string | null
  from: string
  read: boolean
  at: string
}
interface ConnectState {
  loaded: boolean
  me: { findable: boolean; verified: boolean; email: string } | null
  connections: Connection[]
  notices: Notice[]
  unread: number
}
const EMPTY: ConnectState = { loaded: false, me: null, connections: [], notices: [], unread: 0 }
export const useConnect = create<ConnectState>(() => EMPTY)

type Answer = Omit<ConnectState, 'loaded' | 'notices'> & { notifications: Notice[] }

async function call<T = Answer>(body: Record<string, unknown>): Promise<T> {
  const token = await apiToken()
  if (!token) throw new Error('You’re not signed in.')
  let res: Response
  try {
    res = await fetch('/api/connect', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new Error('Couldn’t reach Lilac. Check your connection.')
  }
  const out = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(out.error ?? 'Something went wrong. Try again.')
  return out
}

// ---------- keeping connected entries in step ----------

const SEEN_KEY = 'lilac-connections-seen'
const seen = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
const remember = (ids: Set<string>) => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-500)))
  } catch {
    /* ignore */
  }
}

/** Fill each connected entry from what its person shares, unlink the ones whose connection has ended, and make an entry for a new connection that has none. */
function applyConnections(conns: Connection[]) {
  const done = seen()
  suppressHistory(() =>
    useStore.setState((s) => {
      let people = s.people
      const change = (p: Person, next: Person) => {
        if (next !== p) people = people.map((x) => (x.id === p.id ? next : x))
      }
      for (const p of s.people) {
        if (p.link) {
          const c = conns.find((x) => x.userId === p.link!.userId)
          // no connection at all: their account was deleted, so this stays as an ordinary contact of yours
          if (!c) change(p, unlink(p, true))
          else if (c.status === 'ended') change(p, unlink(p, false))
          else if (c.status === 'accepted') change(p, applyShared(p, c.fields, c.theirShares))
        }
      }
      for (const c of conns) {
        if (c.status !== 'accepted' || !c.userId) continue
        if (people.some((p) => p.link?.userId === c.userId)) {
          done.add(c.id)
          continue
        }
        // the entry that started the invitation, or one you already have for them
        const mine = c.personId ? people.find((p) => p.id === c.personId && !p.link) : undefined
        if (mine) {
          people = people.map((x) => (x.id === mine.id ? applyShared({ ...x, link: { userId: c.userId!, got: [] } }, c.fields, c.theirShares) : x))
          done.add(c.id)
        } else if (!done.has(c.id)) {
          const n = c.fields
          const p: Person = applyShared(
            { id: `link-${c.userId}`, name: c.name || 'Someone', first: n.first, last: n.last, phone: '', email: '', address: '', notes: '', hue: 285, favorite: false, createdAt: Date.now(), link: { userId: c.userId, got: [] } },
            c.fields,
            c.theirShares,
          )
          people = [...people, { ...p, name: p.name || fullName(p.first ?? '', p.last ?? '') || 'Someone' }]
          done.add(c.id)
        }
      }
      return people === s.people ? s : { people }
    }),
  )
  remember(done)
}

function take(a: Answer) {
  useConnect.setState({ loaded: true, me: a.me, connections: a.connections, notices: a.notifications, unread: a.unread })
  applyConnections(a.connections)
}

export async function refreshConnect() {
  take(await call({ action: 'state' }))
}

let lastDetails = ''
/** Offer your own entry's details to your connections (the server only passes on the fields each person chose to share). */
export async function pushProfile(force = false) {
  const me = useStore.getState().people.find((p) => p.isMe)
  if (!me) return refreshConnect()
  const details = JSON.stringify(detailsOf(me))
  if (!force && details === lastDetails) return
  lastDetails = details
  take(await call({ action: 'profile', details: JSON.parse(details) }))
}

/** Start checking for connection news (and offering your details) while signed in. Returns the stop function. */
export function startConnect(): () => void {
  let timer = 0
  let push = 0
  const tick = () => {
    if (document.visibilityState === 'visible') void refreshConnect().catch(() => undefined)
  }
  void pushProfile(true).catch(() => undefined)
  timer = window.setInterval(tick, 45_000)
  const wake = () => document.visibilityState === 'visible' && tick()
  document.addEventListener('visibilitychange', wake)
  window.addEventListener('focus', wake)
  // changes to your own entry go out a moment after you stop typing
  const unsub = useStore.subscribe((s, prev) => {
    if (s.people === prev.people) return
    window.clearTimeout(push)
    push = window.setTimeout(() => void pushProfile().catch(() => undefined), 1500)
  })
  return () => {
    window.clearInterval(timer)
    window.clearTimeout(push)
    document.removeEventListener('visibilitychange', wake)
    window.removeEventListener('focus', wake)
    unsub()
    lastDetails = ''
    useConnect.setState(EMPTY)
  }
}

// ---------- what a person can do ----------

/** Ask the person at this email to connect. The answer is the same whether or not they are on Lilac. */
export async function sendInvite(person: Person, shares: string[]) {
  await call({ action: 'invite', email: person.email, personId: person.id, shares })
  useStore.getState().savePerson({ id: person.id, name: person.name, invited: person.email.trim().toLowerCase() })
}

/** Accept a request: it fills in the entry you already have for them (matched by email) or makes one. */
export async function acceptRequest(c: Connection, shares: string[]) {
  const email = (c.email ?? '').toLowerCase()
  const mine = email ? useStore.getState().people.find((p) => !p.isMe && !p.link && p.email.trim().toLowerCase() === email) : undefined
  await call({ action: 'respond', id: c.id, answer: 'accept', shares, personId: mine?.id ?? null })
  await refreshConnect()
}

/** Say no, quietly: they are not told. `block` also stops them asking again. */
export async function declineRequest(c: Connection, block = false) {
  await call({ action: 'respond', id: c.id, answer: block ? 'block' : 'decline' })
  await refreshConnect()
}

/** Change what you share on a live connection. */
export async function setMyShares(id: string, shares: string[]) {
  await call({ action: 'shares', id, shares })
  await refreshConnect()
}

/** End a connection. Your entry for them stays, without what they had shared. */
export async function disconnectFrom(id: string) {
  await call({ action: 'disconnect', id })
  await refreshConnect()
}

export async function markNoticesRead(ids?: string[]) {
  await call({ action: 'read', ...(ids ? { ids } : {}) })
  await refreshConnect()
}

/** "Let people who have my email find me". */
export async function setFindable(findable: boolean) {
  take(await call({ action: 'profile', findable }))
}
