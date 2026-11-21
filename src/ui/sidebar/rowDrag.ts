import { useRef } from 'react'
import { create } from 'zustand'
import { useDnd, usePointerDrag, type Payload } from '../dnd'
import { lifter } from '../lift'

/**
 * Putting the rows of a sidebar list (or a checklist) in a new order, the way groups are moved: the row is lifted and follows the pointer's height,
 * a line shows the gap it would drop into, the others glide aside, and where it lands it settles. A list that nests (a checklist, with groups it is
 * the same drag) also reads sideways travel as depth: right to go inside the row above, left to climb out, with the indent or outdent symbol on the
 * carried row. Rows carry `data-reorder-row="<id>"` (and `data-reorder-depth`) inside an element carrying `data-reorder-list="<listId>"`.
 */

export interface RowSlot {
  /** In front of this row (null: at the end). */
  beforeId: string | null
  depth: number
}

/** Where a carried row would go: in front of this row (or at the end), and how deep. `carried` are the ids moving (the row and what is inside it). */
export const useRowSlot = create<{ list: string | null; beforeId: string | null; depth: number; carried: string[] }>(() => ({ list: null, beforeId: null, depth: 0, carried: [] }))

/** The slot for height `y` among the list's rows (not counting the carried ones, nor the room an open gap takes up). */
export function rowSlotFor(listId: string, skip: ReadonlySet<string>, y: number, dx = 0, hier?: { start: number; step: number }): RowSlot | null {
  const list = document.querySelector(`[data-reorder-list="${listId}"]`)
  if (!list) return null
  const gaps = [...list.querySelectorAll<HTMLElement>('[data-gap]')].map((g) => g.getBoundingClientRect()).map((g) => ({ top: g.top, h: g.height }))
  const flat = (v: number) => gaps.reduce((acc, g) => acc - Math.min(Math.max(v - g.top, 0), g.h), v)
  const at = flat(y)
  const rows = [...list.querySelectorAll<HTMLElement>('[data-reorder-row]')].filter((el) => !skip.has(el.dataset.reorderRow!))
  let after = -1
  rows.forEach((el, i) => {
    const b = el.getBoundingClientRect()
    if ((flat(b.top) + flat(b.bottom)) / 2 < at) after = i
  })
  const next = rows[after + 1]
  let depth = 0
  if (hier) {
    const prev = rows[after]
    const min = next ? Number(next.dataset.reorderDepth ?? 0) : 0
    const max = prev ? Math.max(min, Number(prev.dataset.reorderDepth ?? 0) + 1) : 0
    depth = Math.min(max, Math.max(min, hier.start + Math.round(dx / hier.step)))
  }
  return { beforeId: next?.dataset.reorderRow ?? null, depth }
}

/** The new order after `id` is dropped in front of `beforeId` (null: last). */
export function reordered(ids: string[], id: string, beforeId: string | null): string[] {
  const rest = ids.filter((x) => x !== id)
  const at = beforeId === null ? rest.length : rest.indexOf(beforeId)
  return [...rest.slice(0, at < 0 ? rest.length : at), id, ...rest.slice(at < 0 ? rest.length : at)]
}

/** Pointer handler for one row of a reorderable list; give it to the row (and its grip, with `true`). */
export function useRowDrag(opts: {
  listId: string
  type: Payload['type']
  id: string
  label: string
  row: React.RefObject<HTMLElement | null>
  /** Rows that travel with this one (what is inside it). */
  followers?: string[]
  /** The list nests: this row's own depth now, and how far sideways is one level. */
  hierarchy?: { depth: number; step: number }
  onDrop: (slot: RowSlot) => void
}) {
  const raf = useRef(0)
  const pos = useRef({ y: 0, dx: 0 })
  const skip = () => new Set([opts.id, ...(opts.followers ?? [])])
  const refresh = () => {
    const s = rowSlotFor(opts.listId, skip(), pos.current.y, pos.current.dx, opts.hierarchy && { start: opts.hierarchy.depth, step: opts.hierarchy.step })
    if (!s) return
    const cur = useRowSlot.getState()
    if (cur.list !== opts.listId || cur.beforeId !== s.beforeId || cur.depth !== s.depth) useRowSlot.setState({ list: opts.listId, beforeId: s.beforeId, depth: s.depth })
    if (opts.hierarchy) lifter.hint(s.depth > opts.hierarchy.depth ? 'in' : s.depth < opts.hierarchy.depth ? 'out' : null)
  }
  return usePointerDrag({
    payload: { type: opts.type, id: opts.id },
    label: opts.label,
    touchNeedsHandle: true,
    lift: () => opts.row.current,
    liftOpaque: true,
    lockX: true,
    resolve: (x, py) => {
      const r = document.querySelector(`[data-reorder-list="${opts.listId}"]`)?.getBoundingClientRect()
      return r && x >= r.left - 60 && x <= r.right + 60 && py >= r.top - 30 && py <= r.bottom + 30 ? 'slot' : null
    },
    onStart: () => {
      useRowSlot.setState({ carried: [...skip()] })
      // (a finger at rest sends no moves while the rows glide under it: keep reading the slot)
      const tick = () => {
        refresh()
        raf.current = requestAnimationFrame(tick)
      }
      raf.current = requestAnimationFrame(tick)
    },
    onMove: (_x, py, dx) => {
      pos.current = { y: py, dx }
      refresh()
    },
    onEnd: ({ target }) => {
      cancelAnimationFrame(raf.current)
      refresh()
      const { beforeId, depth, list } = useRowSlot.getState()
      useRowSlot.setState({ list: null, beforeId: null, depth: 0, carried: [] })
      if (target === 'slot' && list === opts.listId) opts.onDrop({ beforeId, depth })
    },
  })
}

/** The depth a carried row would have if it lands in front of `beforeId` (null: at the end) of this list; null when it would not. */
export function useGapDepth(listId: string, beforeId: string | null): number | null {
  const depth = useRowSlot((s) => (s.list === listId && s.beforeId === beforeId ? s.depth : null))
  const dragging = useDnd((s) => !!s.drag)
  return dragging ? depth : null
}

/** True while a row of this list is carried and would land in front of `beforeId` (null: at the end). */
export const useGapOpen = (listId: string, beforeId: string | null): boolean => useGapDepth(listId, beforeId) !== null

/** True for the rows being carried (the one lifted and what is inside it). */
export const useCarried = (id: string): boolean => useRowSlot((s) => s.carried.includes(id))
