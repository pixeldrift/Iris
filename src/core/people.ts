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
