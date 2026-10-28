import { fuzzyScore } from './fuzzy'
import type { Person } from './types'

export type ContactVerb = 'call' | 'email' | 'text'

export interface ContactIntent {
  verb: ContactVerb
  /** Raw name as typed: "Sarah", "mom", "Dr Patel". */
  name: string
}

const VERBS: [RegExp, ContactVerb][] = [
  [/\b(?:call|phone|ring|dial)\b/i, 'call'],
  [/\b(?:e-?mail|mail)\b/i, 'email'],
  [/\b(?:text|sms|message|whatsapp|dm|ping)\b/i, 'text'],
]

const STOP = new Set([
  'about', 'to', 'at', 'on', 'in', 'by', 'for', 'and', 'or', 're', 'regarding', 'before', 'after', 'tomorrow',
  'today', 'tonight', 'later', 'again', 'back', 'up', 'with', 'that', 'the', 'a', 'an', 'my', 'me', 'him', 'her',
  'them', 'us', 'it', 'this', 'when', 'if', 'so', 'then', 'asap', 'now', 'soon', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday', 'sunday', 'next', 'every', 'each',
])
const TITLES = new Set(['dr', 'dr.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'prof', 'prof.', 'aunt', 'uncle', 'coach'])

/** "Call Sarah about the lease" -> { verb: 'call', name: 'Sarah' }. */
export function detectContactIntent(text: string): ContactIntent | null {
  for (const [re, verb] of VERBS) {
    const m = re.exec(text)
    if (!m) continue
    const rest = text.slice(m.index + m[0].length).trim().split(/\s+/)
    const parts: string[] = []
    for (const w of rest) {
      const clean = w.replace(/[.,;:!?]+$/, '')
      if (!clean || STOP.has(clean.toLowerCase())) break
      parts.push(clean)
      if (parts.length >= (TITLES.has(parts[0].toLowerCase()) ? 3 : 2)) break
      if (/[.,;:!?]$/.test(w)) break
    }
    // a lone second word is only part of the name if capitalised ("Sarah Lee", not "mom tomorrow")
    if (parts.length === 2 && !TITLES.has(parts[0].toLowerCase()) && !/^[A-Z]/.test(parts[1])) parts.pop()
    if (parts.length) return { verb, name: parts.join(' ') }
  }
  return null
}

export function matchPerson(people: Person[], name: string, min = 0.78): Person | null {
  let best: Person | null = null
  let bestScore = 0
  for (const p of people) {
    const first = p.name.split(/\s+/)[0]
    const score = Math.max(fuzzyScore(name, p.name), fuzzyScore(name, first))
    if (score > bestScore) {
      best = p
      bestScore = score
    }
  }
  return bestScore >= min ? best : null
}

const digits = (s: string) => s.replace(/[^\d+]/g, '')

export function contactLink(verb: ContactVerb, p: Pick<Person, 'phone' | 'email'>): { href: string; label: string } | null {
  if (verb === 'email') return p.email ? { href: `mailto:${p.email}`, label: 'Email' } : null
  if (!p.phone) return null
  return verb === 'text' ? { href: `sms:${digits(p.phone)}`, label: 'Text' } : { href: `tel:${digits(p.phone)}`, label: 'Call' }
}

/** Every link a person supports, for the task panel. */
export function allLinks(p: Pick<Person, 'phone' | 'email'>) {
  return (['call', 'text', 'email'] as ContactVerb[]).map((v) => contactLink(v, p)).filter(Boolean) as { href: string; label: string }[]
}

export interface ParsedContact {
  name: string
  phone: string
  email: string
  address: string
}

/** Minimal vCard reader (2.1/3.0/4.0): enough for "Share contact" files from iOS/Android. */
export function parseVCards(text: string): ParsedContact[] {
  const out: ParsedContact[] = []
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  for (const block of unfolded.split(/BEGIN:VCARD/i).slice(1)) {
    const c: ParsedContact = { name: '', phone: '', email: '', address: '' }
    for (const line of block.split(/\r?\n/)) {
      const i = line.indexOf(':')
      if (i < 0) continue
      const key = line.slice(0, i).split(';')[0].toUpperCase()
      const val = line.slice(i + 1).trim()
      if (key === 'FN' && !c.name) c.name = val
      else if (key === 'N' && !c.name) c.name = val.split(';').reverse().filter(Boolean).join(' ').trim()
      else if (key === 'TEL' && !c.phone) c.phone = val.replace(/^tel:/i, '')
      else if (key === 'EMAIL' && !c.email) c.email = val
      else if (key === 'ADR' && !c.address) c.address = val.split(';').filter(Boolean).join(', ')
    }
    if (c.name) out.push(c)
  }
  return out
}

/** The sidebar holds seven rows under People: up to this many hearted people, plus the Address book. */
export const MAX_FAVORITES = 6

export const fullName = (first: string, last: string) => `${first.trim()} ${last.trim()}`.trim()

/** "Sarah Lee" -> Sarah / Lee; "Dr. Anita Rao Patel" -> "Dr. Anita Rao" / Patel; "Madonna" -> Madonna / "". */
export function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { first: parts[0] ?? '', last: '' }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] }
}

export interface AddressParts {
  street: string
  city: string
  state: string
  zip: string
}

export const emptyAddress = (): AddressParts => ({ street: '', city: '', state: '', zip: '' })

const US_STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ')
const STREET_SUFFIX = /\b(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|pl|place|ter|terrace|pkwy|parkway|hwy|highway|cir|circle|sq|square|trl|trail|aly|alley)\.?(?:\s+(?:apt|unit|ste|suite|#)\s*[\w-]+)?(?:\s+[NSEW]{1,2}\b)?/i

/**
 * Best-effort split of a one-line US address: "12 Elm St, Springfield, IL 62704", "12 Elm St Springfield IL 62704",
 * or just "62704" / "Springfield, IL". Whatever can't be placed stays in `street`.
 */
export function parseAddress(line: string): AddressParts {
  const out = emptyAddress()
  let rest = line.trim().replace(/\s+/g, ' ')
  if (!rest) return out
  const zip = /(?:^|[\s,])(\d{5})(?:-\d{4})?\s*$/.exec(rest)
  if (zip) {
    out.zip = zip[1]
    rest = rest.slice(0, zip.index).replace(/[\s,]+$/, '')
  }
  const st = /(?:^|[\s,])([A-Za-z]{2})\.?\s*$/.exec(rest)
  const before = st ? rest.slice(0, st.index) : ''
  if (st && US_STATES.includes(st[1].toUpperCase()) && (zip || /,\s*$/.test(before) || /\s/.test(before.trim()))) {
    out.state = st[1].toUpperCase()
    rest = rest.slice(0, st.index).replace(/[\s,]+$/, '')
  }
  if (!rest) return out
  const segs = rest.split(',').map((x) => x.trim()).filter(Boolean)
  if (segs.length >= 2) {
    out.city = segs[segs.length - 1]
    out.street = segs.slice(0, -1).join(', ')
  } else if (/^\d/.test(segs[0])) {
    // "12 Elm St Springfield": the city is what follows the street suffix (and unit)
    const m = STREET_SUFFIX.exec(segs[0])
    if (m && m.index + m[0].length < segs[0].length) {
      out.street = segs[0].slice(0, m.index + m[0].length).trim()
      out.city = segs[0].slice(m.index + m[0].length).trim()
    } else out.street = segs[0]
  } else if (out.state || out.zip) {
    out.city = segs[0] // "Springfield, IL" / "Springfield 62704": no street number, so it is a place
  } else out.street = segs[0]
  return out
}

/** The parts back to one line: "12 Elm St, Springfield, IL 62704". */
export function composeAddress(a: AddressParts): string {
  const region = [a.state.trim(), a.zip.trim()].filter(Boolean).join(' ')
  return [a.street.trim(), a.city.trim(), region].filter(Boolean).join(', ')
}

/** Starting categories for the address book; people can also get any custom ones. */
export const PRESET_CATEGORIES = ['Family', 'Friend', 'Coworker']

/** Presets first, then every custom category in use (alphabetical). */
export function allCategories(people: Pick<Person, 'categories'>[]): string[] {
  const custom = new Set<string>()
  for (const p of people) for (const c of p.categories ?? []) if (!PRESET_CATEGORIES.some((x) => x.toLowerCase() === c.toLowerCase())) custom.add(c)
  return [...PRESET_CATEGORIES, ...[...custom].sort((a, b) => a.localeCompare(b))]
}
