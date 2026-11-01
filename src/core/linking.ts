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

const digits = (s: string) => s.replace(/\D/g, '')

/**
 * Entries of yours that might be the person who just asked to connect, to offer when you accept. Nothing is ever linked
 * on a guess: `sure` is an entry carrying the very email their account is verified with (the one thing they can't just
 * claim); `maybe` is anything that merely looks alike (the same phone number, or a name that matches in full or by first
 * name), offered for you to choose. Someone could set their name to a contact's, so a look-alike is only ever a choice.
 */
export function matchesFor(people: Person[], who: { name?: string | null; email?: string | null; phone?: string | null }): { sure: Person[]; maybe: Person[] } {
  const free = people.filter((p) => !p.isMe && !p.link)
  const email = (who.email ?? '').trim().toLowerCase()
  const sure = email ? free.filter((p) => [p.email, ...(p.extras ?? []).filter((x) => x.kind === 'email').map((x) => x.value)].some((e) => e.trim().toLowerCase() === email)) : []
  const phone = who.phone ? digits(who.phone) : ''
  const name = (who.name ?? '').trim().toLowerCase()
  const first = name.split(/\s+/)[0] ?? ''
  const looks = (p: Person) =>
    (phone.length >= 7 && [p.phone, ...(p.extras ?? []).filter((x) => x.kind === 'phone').map((x) => x.value)].some((v) => v && digits(v) === phone)) ||
    (!!name && (p.name.trim().toLowerCase() === name || (first.length > 1 && (p.first ?? p.name.split(/\s+/)[0] ?? '').trim().toLowerCase() === first)))
  const maybe = free.filter((p) => !sure.includes(p) && looks(p))
  return { sure, maybe }
}

/**
 * Two entries connected to the same person (two devices each made one, or one was made by hand and one by the
 * connection) become one: the one that was yours first keeps its place, takes in what the other had, and every task that
 * pointed at the other points at it.
 */
export function mergeLinkedDuplicates<T extends { personIds: string[] }>(people: Person[], tasks: T[]): { people: Person[]; tasks: T[]; changed: boolean } {
  const groups = new Map<string, Person[]>()
  for (const p of people) if (p.link) groups.set(p.link.userId, [...(groups.get(p.link.userId) ?? []), p])
  const dups = [...groups.values()].filter((g) => g.length > 1)
  if (!dups.length) return { people, tasks, changed: false }
  const gone = new Map<string, string>() // removed id -> the id that took its place
  const merged = new Map<string, Person>()
  for (const g of dups) {
    // one made by the connection (a "link-" id) gives way to one that was made by hand; otherwise the older one stays
    const sorted = [...g].sort((a, b) => Number(a.id.startsWith('link-')) - Number(b.id.startsWith('link-')) || a.createdAt - b.createdAt)
    let keep = sorted[0]
    for (const d of sorted.slice(1)) {
      gone.set(d.id, keep.id)
      const extras = [...(keep.extras ?? [])]
      for (const x of d.extras ?? []) if (!extras.some((y) => y.kind === x.kind && y.value === x.value)) extras.push(x)
      keep = {
        ...keep,
        phone: keep.phone || d.phone,
        email: keep.email || d.email,
        address: keep.address || d.address,
        birthday: keep.birthday || d.birthday,
        photo: keep.photo || d.photo,
        notes: keep.notes === d.notes || !d.notes ? keep.notes : keep.notes ? `${keep.notes}\n${d.notes}` : d.notes,
        categories: [...new Set([...(keep.categories ?? []), ...(d.categories ?? [])])],
        extras,
        favorite: keep.favorite || d.favorite,
        link: { userId: keep.link!.userId, got: [...new Set([...keep.link!.got, ...d.link!.got])] },
      }
    }
    merged.set(keep.id, keep)
  }
  return {
    people: people.filter((p) => !gone.has(p.id)).map((p) => merged.get(p.id) ?? p),
    tasks: tasks.map((t) => (t.personIds.some((id) => gone.has(id)) ? { ...t, personIds: [...new Set(t.personIds.map((id) => gone.get(id) ?? id))] } : t)),
    changed: true,
  }
}
