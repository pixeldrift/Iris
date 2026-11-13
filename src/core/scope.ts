import type { Scope } from './types'

/** The filters a scope is made of: none for Everything, one, or several (a `multi`). */
export const partsOf = (s: Scope): Scope[] => (s.type === 'multi' ? s.parts : s.type === 'all' || s.type === 'contacts' ? [] : [s])

export function sameScope(a: Scope, b: Scope): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'completed' && b.type === 'completed') return (a.period ?? 'all') === (b.period ?? 'all') && a.from === b.from && a.to === b.to
  if ('id' in a && 'id' in b) return a.id === b.id
  if ('date' in a && 'date' in b) return a.date === b.date
  return true
}

export const hasPart = (scope: Scope, part: Scope): boolean => partsOf(scope).some((p) => sameScope(p, part))

/** Add a filter to the ones already on, or take it off if it is on: none left is Everything, one is just itself. */
export function toggleScope(scope: Scope, part: Scope): Scope {
  const cur = partsOf(scope)
  const next = cur.some((p) => sameScope(p, part)) ? cur.filter((p) => !sameScope(p, part)) : [...cur, part]
  return next.length === 0 ? { type: 'all' } : next.length === 1 ? next[0] : { type: 'multi', parts: next }
}

/** The first filter of a kind, wherever it sits (a new item made while filtered belongs to it). */
export const firstOf = <T extends Scope['type']>(scope: Scope, type: T): Extract<Scope, { type: T }> | undefined => partsOf(scope).find((p) => p.type === type) as Extract<Scope, { type: T }> | undefined

/** A plain click: show just this filter, or, if it is the only one on, switch it off. */
export const pickOnly = (scope: Scope, part: Scope): Scope => (scope.type !== 'multi' && sameScope(scope, part) ? { type: 'all' } : part)
