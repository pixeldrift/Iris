import type { Folder, FlowerShape } from './types'

export function childrenOf(folders: Folder[], parentId: string | null): Folder[] {
  return folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.sort - b.sort || a.createdAt - b.createdAt)
}

/** The folder plus every descendant: a task in "Essays" also shows under "English 101". */
export function descendantIds(folders: Folder[], id: string): Set<string> {
  const out = new Set<string>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id)
        grew = true
      }
    }
  }
  return out
}

export function pathOf(folders: Folder[], id: string): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]))
  const path: Folder[] = []
  let cur = byId.get(id)
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    path.unshift(cur)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return path
}

export function pathLabel(folders: Folder[], id: string): string {
  return pathOf(folders, id).map((f) => f.name).join(' / ')
}

export function canReparent(folders: Folder[], id: string, newParent: string | null): boolean {
  if (newParent === id) return false
  if (newParent && descendantIds(folders, id).has(newParent)) return false
  return true
}

/** Deterministic pleasant hue, shifted around lilac/rose/sage/sky. */
const HUES = [285, 320, 345, 20, 150, 200, 255, 40]
export function nextHue(count: number): number {
  return HUES[count % HUES.length]
}

/**
 * New `sort` values for the children of `parentId` after inserting `id` before
 * `beforeId` (or last when null). Returns id -> sort for every affected folder.
 */
export function reorder(folders: Folder[], id: string, parentId: string | null, beforeId: string | null): Map<string, number> {
  const sibs = childrenOf(folders, parentId).filter((f) => f.id !== id)
  const at = beforeId ? sibs.findIndex((f) => f.id === beforeId) : -1
  const ids = sibs.map((f) => f.id)
  ids.splice(at < 0 ? ids.length : at, 0, id)
  return new Map(ids.map((fid, i) => [fid, i]))
}

/**
 * The order new folders cycle through. Neighbouring entries differ a lot in silhouette, and
 * 13 shapes against 8 hues means the same pairing only repeats after 104 folders.
 */
export const SHAPE_CYCLE: FlowerShape[] = ['blossom', 'tulip', 'daisy', 'rose', 'bell', 'lily', 'poppy', 'sunflower', 'iris', 'pinwheel', 'hibiscus', 'cosmos']

/** The flower a new folder gets by default (the user can change it). */
export const shapeFor = (count: number): FlowerShape => SHAPE_CYCLE[count % SHAPE_CYCLE.length]

/** A visible row of the folder tree, top to bottom. */
export interface TreeRow {
  id: string
  depth: number
}

/** Where a dragged folder lands: under `parentId`, in front of `beforeId` (last when null). */
export interface Placement {
  /** The visible row it sits directly below (null: the very top). */
  afterId: string | null
  depth: number
  parentId: string | null
  beforeId: string | null
}

/**
 * Outliner-style placement. The pointer's height picks a slot between two visible rows
 * (`afterIndex` is the row above it, -1 for the top) and its sideways travel picks the depth:
 * push right to nest under the row above, pull left to climb out one level per step.
 * `rows` must already leave out the dragged folder and everything inside it.
 */
export function placeInTree(folders: Folder[], dragId: string, rows: TreeRow[], afterIndex: number, wantDepth: number): Placement {
  const prev = afterIndex >= 0 ? rows[afterIndex] : null
  const next = rows[afterIndex + 1] ?? null
  const min = next ? next.depth : 0
  const max = prev ? Math.max(min, prev.depth + 1) : 0
  const depth = Math.min(max, Math.max(min, wantDepth))
  const sibs = (parent: string | null) => childrenOf(folders, parent).filter((f) => f.id !== dragId)
  if (!prev) return { afterId: null, depth: 0, parentId: null, beforeId: sibs(null)[0]?.id ?? null }
  if (depth > prev.depth) return { afterId: prev.id, depth, parentId: prev.id, beforeId: sibs(prev.id)[0]?.id ?? null }
  let a = folders.find((f) => f.id === prev.id)!
  for (let d = prev.depth; d > depth; d--) a = folders.find((f) => f.id === a.parentId)!
  const list = sibs(a.parentId)
  return { afterId: prev.id, depth, parentId: a.parentId, beforeId: list[list.findIndex((f) => f.id === a.id) + 1]?.id ?? null }
}
