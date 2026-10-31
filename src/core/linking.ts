import { fullName } from './people'
import type { Person } from './types'

/** What can be shared with a connection. */
export const SHARE_FIELDS = [
  { id: 'name', label: 'Name' },
  { id: 'phone', label: 'Phone' },
  { id: 'email', label: 'Email' },
  { id: 'address', label: 'Address' },
  { id: 'birthday', label: 'Birthday' },
] as const
export type ShareField = (typeof SHARE_FIELDS)[number]['id']
export const DEFAULT_SHARES: ShareField[] = ['name', 'phone', 'email']

/** The details someone offers to their connections: their own entry in the address book. */
export function detailsOf(p: Person): Record<string, string> {
  const d: Record<string, string> = { first: p.first ?? '', last: p.last ?? '', phone: p.phone, email: p.email, address: p.address, street: p.street ?? '', city: p.city ?? '', state: p.state ?? '', zip: p.zip ?? '', birthday: p.birthday ?? '' }
  for (const k of Object.keys(d)) if (!d[k]) delete d[k]
  return d
}

/** Take a field out of an entry (what they stopped sharing). A name cannot be blank, so it is just left as it was. */
function clearField(p: Person, f: string): Person {
  if (f === 'phone') return { ...p, phone: '' }
  if (f === 'email') return { ...p, email: '' }
  if (f === 'birthday') return { ...p, birthday: null }
  if (f === 'address') return { ...p, address: '', street: '', city: '', state: '', zip: '' }
  return p
}

/**
 * Fill a connected entry from what the other person shares. Fields they used to share and no longer do are taken
 * back out; fields they never shared are left to you.
 */
export function applyShared(p: Person, fields: Record<string, string>, shares: readonly string[]): Person {
  if (!p.link) return p
  let out: Person = p
  for (const f of p.link.got) if (!shares.includes(f)) out = clearField(out, f)
  if (shares.includes('name') && (fields.first || fields.last)) out = { ...out, first: fields.first ?? '', last: fields.last ?? '', name: fullName(fields.first ?? '', fields.last ?? '') }
  if (shares.includes('phone') && fields.phone) out = { ...out, phone: fields.phone }
  if (shares.includes('email') && fields.email) out = { ...out, email: fields.email }
  if (shares.includes('birthday') && fields.birthday) out = { ...out, birthday: fields.birthday }
  if (shares.includes('address') && fields.address) out = { ...out, address: fields.address, street: fields.street ?? '', city: fields.city ?? '', state: fields.state ?? '', zip: fields.zip ?? '' }
  const next = { ...out, link: { userId: out.link!.userId, got: [...shares] } }
  return JSON.stringify(next) === JSON.stringify(p) ? p : next
}

/**
 * Stop being connected. `keep` leaves what you were given as an ordinary contact of yours (their account was deleted);
 * otherwise what they had shared is taken back out (they, or you, ended the connection).
 */
export function unlink(p: Person, keep: boolean): Person {
  if (!p.link) return p
  let out: Person = p
  if (!keep) for (const f of p.link.got) out = clearField(out, f)
  const { link: _gone, ...rest } = out
  return rest as Person
}
