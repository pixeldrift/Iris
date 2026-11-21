import type { ListItem } from './types'

// A checklist is a flat run of entries, each with a depth (0 at the left). An entry's children are the ones right after it that are deeper:
// the same outline a tree of groups makes, kept in one order so nothing can point at an entry that is gone.

export const depthOf = (i: ListItem) => i.depth ?? 0

/** No entry sits deeper than one step below the one before it (and the first is at the left): what removing or moving things can leave behind. */
export function tidyDepths(items: ListItem[]): ListItem[] {
  let prev = -1
  let changed = false
  const out = items.map((i) => {
    const d = Math.max(0, Math.min(depthOf(i), prev + 1))
    prev = d
    if (d === depthOf(i)) return i
    changed = true
    const { depth: _drop, ...rest } = i
    void _drop
    return d ? { ...rest, depth: d } : rest
  })
  return changed ? out : items
}

/** An entry and the ones inside it, as ids. */
export function blockOf(items: ListItem[], id: string): string[] {
  const at = items.findIndex((i) => i.id === id)
  if (at < 0) return []
  const d = depthOf(items[at])
  const ids = [id]
  for (let k = at + 1; k < items.length && depthOf(items[k]) > d; k++) ids.push(items[k].id)
  return ids
}

/** Carry an entry, with what is inside it, to sit in front of `beforeId` (last when null) at `depth`. */
export function moveBlock(items: ListItem[], id: string, beforeId: string | null, depth: number): ListItem[] {
  const ids = new Set(blockOf(items, id))
  if (!ids.size) return items
  const block = items.filter((i) => ids.has(i.id))
  const rest = items.filter((i) => !ids.has(i.id))
  const shift = depth - depthOf(block[0])
  const moved = block.map((i) => {
    const d = Math.max(0, depthOf(i) + shift)
    const { depth: _drop, ...r } = i
    void _drop
    return d ? { ...r, depth: d } : r
  })
  const at = beforeId === null ? rest.length : rest.findIndex((i) => i.id === beforeId)
  const i = at < 0 ? rest.length : at
  return tidyDepths([...rest.slice(0, i), ...moved, ...rest.slice(i)])
}

/** Checked entries after unchecked ones, at every level (an entry keeps what is inside it, and the others keep their order). */
export function checkedLast(items: ListItem[]): ListItem[] {
  type Node = { item: ListItem; kids: Node[] }
  const roots: Node[] = []
  const stack: Node[] = []
  for (const item of items) {
    const n: Node = { item, kids: [] }
    const d = depthOf(item)
    stack.length = Math.min(stack.length, d)
    ;(d > 0 && stack[d - 1] ? stack[d - 1].kids : roots).push(n)
    stack[d] = n
  }
  const flat = (ns: Node[]): ListItem[] => [...ns.filter((n) => !n.item.done), ...ns.filter((n) => n.item.done)].flatMap((n) => [n.item, ...flat(n.kids)])
  const out = flat(roots)
  return out.every((x, i) => x === items[i]) ? items : out
}

/** The marker number of each entry: counted among the entries at its own level under the same parent. */
export function numbering(items: ListItem[]): number[] {
  const counts: number[] = []
  return items.map((i) => {
    const d = depthOf(i)
    counts.length = d + 1
    counts[d] = (counts[d] ?? 0) + 1
    return counts[d]
  })
}
