import type { CSSProperties } from 'react'
import { satOf, tint } from '../core/color'
import type { Task } from '../core/types'
import { useStore } from '../state/store'

/** The color an item wears everywhere (bubble, list row, card, bar, checkmark): its first group's, or the theme's violet. */
export function useTaskHue(task: Pick<Task, 'folderIds'>): number | null {
  return useStore((s) => (task.folderIds[0] ? (s.folders.find((f) => f.id === task.folderIds[0])?.hue ?? null) : null))
}

/**
 * The variables the `.pad` bubble and `.tint` row styles read: hue, saturation switch (gray groups) and urgency
 * (deeper and more vibrant the more urgent). With no group the theme's own violet applies.
 */
export function colorVars(hue: number | null, urgency: number): CSSProperties {
  return (hue === null ? { '--u': urgency } : { '--h': Math.max(0, hue), '--s': satOf(hue), '--u': urgency }) as unknown as CSSProperties
}

/**
 * A checked-off mark in the same color as the item's outline: the thin outer stroke of a bubble, row or card is
 * hsl(hue, 62%, 70%), so the check is a touch lighter and a touch deeper than exactly that. With no group the
 * default hue (the same one the outline falls back to) applies.
 */
export function checkVars(hue: number | null): CSSProperties {
  const h = hue ?? 285
  return { '--chk-a': tint(h, 62, 76), '--chk-b': tint(h, 62, 64), '--chk-ring': tint(h, 62, 70) } as unknown as CSSProperties
}
