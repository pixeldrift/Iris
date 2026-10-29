import { descendantIds, placeInTree, type Placement, type TreeRow } from '../../core/folders'
import type { Folder } from '../../core/types'
import { create } from 'zustand'


export const INDENT_STEP = 26

/** The slot a dragged folder would drop into, shared so the right row can open its gap. */
export const useFolderSlot = create<{ slot: Placement | null }>(() => ({ slot: null }))

/**
 * Folder drag, the outliner way: the pointer's height chooses the slot between two visible rows,
 * and sideways travel from where the row was picked up chooses the depth (left = out one level).
 */
export function slotFor(folders: Folder[], dragId: string, startDepth: number, y: number, dx: number, current: Placement | null = null): Placement | null {
  const list = document.querySelector('[data-folder-list]')
  if (!list) return null
  const skip = descendantIds(folders, dragId)
  skip.add(dragId)
  // The open gap pushes rows down; measure everything as if it were closed so the slot can't chase itself.
  const gaps = [...list.querySelectorAll<HTMLElement>('[data-gap]')].map((g) => g.getBoundingClientRect()).map((g) => ({ top: g.top, h: g.height }))
  const flat = (v: number) => gaps.reduce((acc, g) => acc - Math.min(Math.max(v - g.top, 0), g.h), v)
  y = flat(y)
  const rows: (TreeRow & { mid: number })[] = []
  let onto: string | null = null
  list.querySelectorAll<HTMLElement>('[data-folder-row]').forEach((el) => {
    if (skip.has(el.dataset.folderRow!)) return
    const b = el.getBoundingClientRect()
    const r = { top: flat(b.top), bottom: flat(b.bottom), height: flat(b.bottom) - flat(b.top) }
    rows.push({ id: el.dataset.folderRow!, depth: Number(el.dataset.depth), mid: r.top + r.height / 2 })
    // straight onto the middle of a row: it becomes that folder's child
    // (once a row is lit it stays lit a little beyond its edges, so a resting finger can't flicker it)
    const pad = current?.kind === 'into' && current.parentId === el.dataset.folderRow ? 0.1 : 0.2
    if (y >= r.top + r.height * pad && y <= r.bottom - r.height * pad) onto = el.dataset.folderRow!
  })
  if (onto) return { kind: 'into', afterId: null, depth: 0, parentId: onto, beforeId: null }
  let after = -1
  rows.forEach((r, i) => {
    if (r.mid < y) after = i
  })
  return placeInTree(folders, dragId, rows, after, startDepth + Math.round(dx / INDENT_STEP))
}

