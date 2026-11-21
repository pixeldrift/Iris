import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Person } from '../../core/types'
import { useStore } from '../../state/store'
import { useDropTarget } from '../dnd'
import { openPerson } from '../PeopleDialogs'
import { Tip } from '../Tip'
import { IconHeart, IconPencil } from '../icons'

import { Avatar, GripDots } from '../shared'
import { Count, rowBase } from './parts'
import { hasPart, pickOnly } from '../../core/scope'
import { useFilterPress } from './filterPress'
import { presenceOf, useShare } from '../../sync/share'

export function PersonRow({ person, count, grip, dragging }: { person: Person; count: number; grip?: React.ReactNode; dragging?: boolean }) {
  const scope = useStore((s) => s.scope)
  const setScope = useStore((s) => s.setScope)
  const toggleFavorite = useStore((s) => s.togglePersonFavorite)
  const { over, active, props } = useDropTarget(`person:${person.id}`)
  const part = { type: 'person' as const, id: person.id }
  const on = hasPart(scope, part)
  const press = useFilterPress(part)
  // someone in a shared group with you: a purple ring when they have the app open, grey when not
  useShare((s) => s.shares)
  const live = presenceOf(person.link?.userId)
  return (
    <div
      {...props}
      onPointerDown={press.down}
      onPointerUp={press.cancel}
      onPointerCancel={press.cancel}
      onClick={(e) => !press.click(e) && setScope(pickOnly(scope, part))}
      data-person-row={person.id}
      className={`${rowBase} cursor-pointer ${dragging ? 'bg-white/50 opacity-60 ring-1 ring-lilac-300/70' : ''} ${on ? 'bg-white/70 font-medium text-lilac-700' : 'hover:bg-white/45'} ${
        over ? 'scale-[1.02] bg-lilac-200/80 ring-2 ring-lilac-400/60' : active ? 'ring-1 ring-lilac-300/50' : ''
      }`}
    >
      <Avatar person={person} size={18} className={live === null ? '' : live ? 'ring-1 ring-lilac-500' : 'opacity-60 ring-1 ring-ink-faint/60'} />
      <span className="truncate">{person.name}</span>
      <Count n={count} />
      {grip ?? <span aria-hidden className="w-5 shrink-0" />}
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
  )
}

/**
 * The favorites, in the order they were put in by hand. Each row has a grip (the same dots as the groups): hold it and move up or down and the
 * others make way; the arrow keys do the same from the grip.
 */
export function FavoritePeople({ people, counts }: { people: Person[]; counts: (id: string) => number }) {
  const setOrder = useStore((s) => s.setFavoriteOrder)
  const box = useRef<HTMLDivElement>(null)
  const [moving, setMoving] = useState<{ id: string; order: string[]; x: number; y: number } | null>(null)
  const ids = people.map((p) => p.id)
  const shown = moving ? moving.order.map((id) => people.find((p) => p.id === id)).filter((p): p is Person => !!p) : people
  const start = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    e.preventDefault()
    const mids = new Map<string, number>()
    box.current?.querySelectorAll<HTMLElement>('[data-person-row]').forEach((el) => {
      const r = el.getBoundingClientRect()
      mids.set(el.dataset.personRow!, r.top + r.height / 2)
    })
    let order = ids
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    document.body.classList.add('dragging')
    const at = (y: number) => {
      const others = ids.filter((x) => x !== id)
      const before = others.filter((x) => (mids.get(x) ?? 0) < y).length
      return [...others.slice(0, before), id, ...others.slice(before)]
    }
    const move = (ev: PointerEvent) => {
      order = at(ev.clientY)
      setMoving({ id, order, x: ev.clientX, y: ev.clientY })
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      document.body.classList.remove('dragging')
      setMoving(null)
      if (order.some((x, i) => x !== ids[i])) setOrder(order)
    }
    setMoving({ id, order, x: e.clientX, y: e.clientY })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }
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
    <div ref={box}>
      {shown.map((p) => (
        <PersonRow
          key={p.id}
          person={p}
          count={counts(p.id)}
          dragging={moving?.id === p.id}
          grip={
            people.length > 1 ? (
              <button
                type="button"
                data-person-grip={p.id}
                aria-label={`Move ${p.name} (arrow keys move them up or down)`}
                title="Drag to reorder"
                onPointerDown={(e) => (e.stopPropagation(), start(e, p.id))}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') (e.preventDefault(), nudge(p.id, -1))
                  else if (e.key === 'ArrowDown') (e.preventDefault(), nudge(p.id, 1))
                }}
                className="grid h-5 w-5 shrink-0 cursor-grab touch-none place-items-center [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:transition [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
              >
                <GripDots />
              </button>
            ) : undefined
          }
        />
      ))}
      {moving &&
        createPortal(
          <div className="pointer-events-none fixed z-[var(--z-drag)] max-w-[240px] truncate rounded-full border border-white/70 bg-white/85 px-3 py-1 text-sm text-ink shadow-[0_8px_30px_rgba(132,83,180,0.28)] backdrop-blur-md" style={{ left: moving.x + 14, top: moving.y + 10 }}>
            {people.find((p) => p.id === moving.id)?.name}
          </div>,
          document.body,
        )}
    </div>
  )
}
