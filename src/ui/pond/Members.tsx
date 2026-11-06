import { useStore } from '../../state/store'
import { memberPhoto, useShare, type ShareMember } from '../../sync/share'

/** The people in the shared groups you are looking at, as small round pictures (or initials) in the pond's top left. */
export function PondMembers() {
  const shares = useShare((s) => s.shares)
  const me = useShare((s) => s.me)
  const folders = useStore((s) => s.folders)
  const scope = useStore((s) => s.scope)
  useStore((s) => s.people) // (their pictures arrive through the address book)
  let members: ShareMember[] = shares.flatMap((x) => x.members)
  if (scope.type === 'folder') {
    const f = folders.find((x) => x.id === scope.id)
    const sh = f?.workspaceId ? shares.find((x) => x.workspaceId === f.workspaceId) : undefined
    members = sh ? sh.members : []
  }
  const seen = new Set<string>()
  const others = members.filter((m) => m.userId !== me && m.status === 'active' && !seen.has(m.userId) && !!seen.add(m.userId))
  if (!others.length) return null
  const shown = others.slice(0, 5)
  return (
    <div data-ui aria-label="People in shared groups" role="group" className="pointer-events-auto absolute left-3 top-3 z-10 flex items-center">
      {shown.map((m, i) => {
        const photo = memberPhoto(m.userId, me)
        return (
          <span
            key={m.userId}
            title={`${m.name}${m.role === 'viewer' ? ' (can view)' : ''}`}
            className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-lilac-100 text-xs font-semibold text-lilac-700 shadow-sm ring-2 ring-white/80"
            style={{ marginLeft: i === 0 ? 0 : -8 }}
          >
            {photo ? <img src={photo} alt="" draggable={false} className="h-full w-full object-cover" /> : m.name.slice(0, 1).toUpperCase()}
          </span>
        )
      })}
      {others.length > shown.length && <span className="ml-1.5 text-xs text-ink-soft">+{others.length - shown.length}</span>}
    </div>
  )
}
