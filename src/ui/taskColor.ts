import { useMemo, type CSSProperties } from 'react'
import { satOf, tint } from '../core/color'
import { groupLook, type GroupLook } from '../core/looks'
import type { Task } from '../core/types'
import { useStore } from '../state/store'

type LookOf = Pick<Task, 'folderIds'> & Partial<Pick<Task, 'tagOrder' | 'personIds'>>

/** The groups an item wears the colours of: its main one (the group it was given first, or the one being viewed) and its others in tag order. */
export function useGroupLook(task: LookOf): GroupLook {
  const folders = useStore((s) => s.folders)
  const scope = useStore((s) => s.scope)
  return useMemo(() => groupLook({ folderIds: task.folderIds, tagOrder: task.tagOrder, personIds: task.personIds ?? [] }, folders, scope), [task.folderIds, task.tagOrder, task.personIds, folders, scope])
}

/** The color an item wears everywhere (bubble, list row, card, bar, checkmark): its main group's, or the theme's violet. */
export function useTaskHue(task: LookOf): number | null {
  return useGroupLook(task).main?.hue ?? null
}

/** The hues of an item's other groups (at most four), for the little dots and the soft second and third glows. */
export function useExtraHues(task: LookOf): number[] {
  const look = useGroupLook(task)
  return useMemo(() => look.extras.map((f) => f.hue), [look])
}

/**
 * The variables the `.pad` bubble and `.tint` row styles read: hue, saturation switch (gray groups) and urgency
 * (deeper and more vibrant the more urgent). With no group the theme's own violet applies.
 */
export function colorVars(hue: number | null, urgency: number, extras: number[] = []): CSSProperties {
  const base: Record<string, number> = hue === null ? { '--u': urgency } : { '--h': Math.max(0, hue), '--s': satOf(hue), '--u': urgency }
  // (a grey group tints nothing, so a grey second group cannot dirty a coloured item)
  extras.slice(0, 2).forEach((h, i) => {
    if (h < 0) return
    base[`--h${i + 2}`] = h
    base[`--s${i + 2}`] = satOf(h)
    base[`--on${i + 2}`] = 1
  })
  return base as unknown as CSSProperties
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
