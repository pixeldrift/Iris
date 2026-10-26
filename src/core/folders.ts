import type { Folder } from './types'

export function childrenOf(folders: Folder[], parentId: string | null): Folder[] {
  return folders.filter((f) => f.parentId === parentId).sort((a, b) => a.createdAt - b.createdAt)
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
