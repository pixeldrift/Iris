import { useStore } from '../../state/store'
import { memberPhoto, useShare, type ShareMember } from '../../sync/share'
import { openPerson } from '../PeopleDialogs'

/** The people in the shared groups you are looking at, as small round pictures (or initials) in the pond's top left. */
export function PondMembers() {
  const shares = useShare((s) => s.shares)
  const me = useShare((s) => s.me)
  const folders = useStore((s) => s.folders)
  const scope = useStore((s) => s.scope)
  const people = useStore((s) => s.people) // (their pictures arrive through the address book)
  // only while looking at a shared group (or one inside it)
  if (scope.type !== 'folder') return null
  const f = folders.find((x) => x.id === scope.id)
  const sh = f?.workspaceId ? shares.find((x) => x.workspaceId === f.workspaceId) : undefined
  const members: ShareMember[] = sh ? sh.members : []
  const seen = new Set<string>()
  const others = members.filter((m) => m.userId !== me && m.status === 'active' && !seen.has(m.userId) && !!seen.add(m.userId))
  if (!others.length) return null
  const shown = others.slice(0, 5)
  return (
    <div data-ui aria-label="People in shared groups" role="group" className="pointer-events-auto absolute left-3 top-3 z-10 flex items-center">
      {shown.map((m, i) => {
        const photo = memberPhoto(m.userId, me)
        // tapping a face opens their card in the address book (when they are in it)
        const entry = people.find((p) => p.link?.userId === m.userId)
        return (
          <button
            type="button"
            key={m.userId}
            disabled={!entry}
            onClick={() => entry && openPerson({ id: entry.id })}
            aria-label={`${m.name}${m.active ? ', here now' : ''}`}
            title={`${m.name}${m.role === 'viewer' ? ' (can view)' : ''}${m.active ? ', here now' : ''}`}
            // a purple 2px border for someone who has the app open now; a thin grey one, and a dimmed picture, when not
            className={`grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-lilac-100 text-xs font-semibold text-lilac-700 ${entry ? 'cursor-pointer transition hover:scale-105' : 'cursor-default'} ${m.active ? 'border-2 border-lilac-500' : 'border border-ink-faint/60'}`}
            style={{ marginLeft: i === 0 ? 0 : -8 }}
          >
            <span className={`grid h-full w-full place-items-center ${m.active ? '' : 'opacity-55'}`}>{photo ? <img src={photo} alt="" draggable={false} className="h-full w-full object-cover" /> : m.name.slice(0, 1).toUpperCase()}</span>
          </button>
        )
      })}
      {others.length > shown.length && <span className="ml-1.5 text-xs text-ink-soft">+{others.length - shown.length}</span>}
    </div>
  )
}
