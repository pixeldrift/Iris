import { useRef } from 'react'
import type { Person } from '../../core/types'
import { useStore } from '../../state/store'
import { useDnd, useDropTarget } from '../dnd'
import { useFlip } from '../flip'
import { reordered, useGapOpen, useRowDrag } from './rowDrag'
import { openPerson } from '../PeopleDialogs'
import { Tip } from '../Tip'
import { IconHeart, IconPencil } from '../icons'

import { Avatar, GripDots } from '../shared'
import { Count, Gap, rowBase } from './parts'
import { hasPart, pickOnly } from '../../core/scope'
import { useFilterPress } from './filterPress'
import { presenceOf, useShare } from '../../sync/share'

export function PersonRow({ person, count, ids, onOrder, onNudge }: { person: Person; count: number; ids: string[]; onOrder: (ids: string[]) => void; onNudge?: (id: string, by: -1 | 1) => void }) {
  const scope = useStore((s) => s.scope)
  const setScope = useStore((s) => s.setScope)
  const toggleFavorite = useStore((s) => s.togglePersonFavorite)
  const { over, active, props } = useDropTarget(`person:${person.id}`)
  const part = { type: 'person' as const, id: person.id }
  const on = hasPart(scope, part)
  const press = useFilterPress(part)
  const row = useRef<HTMLDivElement>(null)
  const carried = useDnd((d) => d.drag?.payload.type === 'person' && d.drag.payload.id === person.id)
  const gap = useGapOpen('favorites', person.id)
  const drag = useRowDrag({
    listId: 'favorites',
    type: 'person',
    id: person.id,
    label: person.name,
    row,
    onDrop: ({ beforeId }) => {
      const next = reordered(ids, person.id, beforeId)
      if (next.some((x, i) => x !== ids[i])) onOrder(next)
    },
  })
  // someone in a shared group with you: a purple ring when they have the app open, grey when not
  useShare((s) => s.shares)
  const live = presenceOf(person.link?.userId)
  return (
    <>
    <Gap open={gap} />
    <div
      {...props}
      ref={row}
      data-reorder-row={person.id}
      data-lift-id={`person:${person.id}`}
      data-flip={person.id}
      onPointerDown={(e) => {
        press.down(e)
        drag(e)
      }}
      onPointerUp={press.cancel}
      onPointerCancel={press.cancel}
      onClick={(e) => !press.click(e) && setScope(pickOnly(scope, part))}
      className={`${rowBase} cursor-pointer ${on ? 'bg-white/70 font-medium text-lilac-700' : 'hover:bg-white/45'} ${carried ? 'opacity-40' : ''} ${
        over ? 'scale-[1.02] bg-lilac-200/80 ring-2 ring-lilac-400/60' : active ? 'ring-1 ring-lilac-300/50' : ''
      }`}
    >
      <Avatar person={person} size={18} className={live === null ? '' : live ? 'ring-1 ring-lilac-500' : 'opacity-60 ring-1 ring-ink-faint/60'} />
      <span className="truncate">{person.name}</span>
      <Count n={count} />
      {onNudge ? (
        <button
          type="button"
          data-person-grip={person.id}
          aria-label={`Move ${person.name} (arrow keys move them up or down)`}
          title="Drag to reorder"
          onPointerDown={(e) => {
            e.stopPropagation()
            drag(e, true)
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') (e.preventDefault(), onNudge(person.id, -1))
            else if (e.key === 'ArrowDown') (e.preventDefault(), onNudge(person.id, 1))
          }}
          className="grid h-5 w-5 shrink-0 cursor-grab touch-none place-items-center focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:transition [@media(hover:hover)]:group-hover:opacity-100"
        >
          <GripDots />
        </button>
      ) : (
        <span aria-hidden className="w-5 shrink-0" />
      )}
      <span className="absolute right-7 flex rounded-lg bg-white/80 px-0.5 opacity-0 shadow-sm transition group-hover:opacity-100">
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
              openPerson({ id: person.id, edit: true })
            }}
            className="rounded-md p-1 text-ink-faint hover:bg-lilac-100 hover:text-lilac-600"
          >
            <IconPencil size={14} />
          </button>
        </Tip>
      </span>
    </div>
    </>
  )
}

/**
 * The favorites, in the order they were put in by hand: carried the way groups are (see rowDrag), by the row on a computer or by the grip on a phone.
 * The arrow keys do the same from the grip.
 */
export function FavoritePeople({ people, counts }: { people: Person[]; counts: (id: string) => number }) {
  const setOrder = useStore((s) => s.setFavoriteOrder)
  const box = useRef<HTMLDivElement>(null)
  useFlip(box)
  const ids = people.map((p) => p.id)
  const nudge = (id: string, by: -1 | 1) => {
    const at = ids.indexOf(id)
    const to = at + by
    if (at < 0 || to < 0 || to >= ids.length) return
    const next = [...ids]
    next.splice(to, 0, ...next.splice(at, 1))
    setOrder(next)
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-person-grip="${id}"]`)?.focus())
  }
  return (
    <div ref={box} data-reorder-list="favorites">
      {people.map((p) => (
        <PersonRow key={p.id} person={p} count={counts(p.id)} ids={ids} onOrder={setOrder} onNudge={people.length > 1 ? nudge : undefined} />
      ))}
      <EndGap />
    </div>
  )
}

function EndGap() {
  return <Gap open={useGapOpen('favorites', null)} />
}
