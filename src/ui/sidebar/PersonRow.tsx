import type { Person } from '../../core/types'
import { useStore } from '../../state/store'
import { useDropTarget } from '../dnd'
import { openPerson } from '../PeopleDialogs'
import { Tip } from '../Tip'
import { IconHeart, IconPencil } from '../icons'

import { Avatar } from '../shared'
import { Count, rowBase } from './parts'

export function PersonRow({ person, count }: { person: Person; count: number }) {
  const scope = useStore((s) => s.scope)
  const setScope = useStore((s) => s.setScope)
  const toggleFavorite = useStore((s) => s.togglePersonFavorite)
  const { over, active, props } = useDropTarget(`person:${person.id}`)
  const on = scope.type === 'person' && scope.id === person.id
  return (
    <div
      {...props}
      onClick={() => setScope(on ? { type: 'all' } : { type: 'person', id: person.id })}
      className={`${rowBase} cursor-pointer ${on ? 'bg-white/70 font-medium text-lilac-700' : 'hover:bg-white/45'} ${
        over ? 'scale-[1.02] bg-lilac-200/80 ring-2 ring-lilac-400/60' : active ? 'ring-1 ring-lilac-300/50' : ''
      }`}
    >
      <Avatar person={person} size={18} />
      <span className="truncate">{person.name}</span>
      <Count n={count} />
      <span className="absolute right-1.5 flex rounded-lg bg-white/80 px-0.5 opacity-0 shadow-sm transition group-hover:opacity-100">
        <Tip label="Remove from sidebar">
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleFavorite(person.id)
            }}
            className="rounded-md p-1 text-lilac-500 hover:bg-lilac-100"
            aria-label={`Unfavorite ${person.name}`}
          >
            <IconHeart size={14} filled />
          </button>
        </Tip>
        <Tip label="Edit details">
          <button
            onClick={(e) => {
              e.stopPropagation()
              openPerson({ id: person.id })
            }}
            className="rounded-md p-1 text-ink-faint hover:bg-lilac-100 hover:text-lilac-600"
          >
            <IconPencil size={14} />
          </button>
        </Tip>
      </span>
    </div>
  )
}

/** How far (px) a folder must be pulled sideways to change its depth by one level. */
