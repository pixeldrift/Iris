/** Everything below `id` in a parent/child list, at any depth (not `id` itself). One place for "every group inside this group". */
export function descendantsOf<T extends { id: string; parent: string | null }>(items: readonly T[], id: string): Set<string> {
  const kids = new Map<string, string[]>()
  for (const i of items) if (i.parent) kids.set(i.parent, [...(kids.get(i.parent) ?? []), i.id])
  const out = new Set<string>()
  const walk = (p: string) => {
    for (const k of kids.get(p) ?? []) if (!out.has(k)) (out.add(k), walk(k))
  }
  walk(id)
  return out
}
