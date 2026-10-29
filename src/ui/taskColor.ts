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

/** The two tones of a checked-off mark in an item's color. */
export function checkVars(hue: number | null): CSSProperties {
  return (hue === null ? {} : { '--chk-a': tint(hue, 62, 78), '--chk-b': tint(hue, 50, 58) }) as unknown as CSSProperties
}
