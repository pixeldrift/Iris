import { useRef } from 'react'
import { fromISO, MONTHS } from '../../core/dates'
import { useStore } from '../../state/store'
import { useDnd, useDropTarget, usePointerDrag } from '../dnd'
import { GripHandle } from '../shared'

import { Collapse, Count, Disclosure, Gap, rowBase } from './parts'

export const sectionAt = (x: number, y: number): string | null => {
  for (const el of document.elementsFromPoint(x, y)) {
    const sec = (el as HTMLElement).closest?.('[data-section-id]') as HTMLElement | null
    if (sec?.dataset.sectionId) return `section:${sec.dataset.sectionId}`
  }
  return null
}

/** A sidebar section: fold it with the arrow, drag it by the grip to put it somewhere else. */
/** The month(s) a run of days falls in: October, or Oct–Nov when it straddles two. */
export function weekMonths(days: string[]): string {
  const names = [...new Set(days.map((d) => fromISO(d).getMonth()))]
  return names.length === 1 ? MONTHS[names[0]] : names.map((m) => MONTHS[m].slice(0, 3)).join('–')
}

export function Section({ id, title, note, action, pinned = false, children }: { id: string; title: string; note?: string; action?: React.ReactNode; pinned?: boolean; children: React.ReactNode }) {
  const collapsed = useStore((s) => s.sidebar.collapsed.includes(id))
  const toggle = useStore((s) => s.toggleSection)
  const moveSection = useStore((s) => s.moveSection)
  const headRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const dragging = useDnd((s) => s.drag?.payload.type === 'section' && s.drag.payload.id === id)
  // while a section is carried, where it would land relative to this one
  const zone = useDnd((s): 'before' | 'after' | null => {
    if (s.over !== `section:${id}` || s.drag?.payload.type !== 'section' || s.drag.payload.id === id || !contentRef.current) return null
    const r = contentRef.current.getBoundingClientRect()
    return s.drag.y < r.top + r.height / 2 ? 'before' : 'after'
  })

  const onPointerDown = usePointerDrag({
    payload: { type: 'section', id },
    label: title,
    lift: () => headRef.current,
    liftOpaque: true,
    touchNeedsHandle: true,
    resolve: sectionAt,
    onClick: () => toggle(id),
    onEnd: ({ target, y }) => {
      if (!target?.startsWith('section:')) return
      const tid = target.slice(8)
      const el = document.querySelector(`[data-section-content="${tid}"]`)
      if (!el || tid === id) return
      const r = el.getBoundingClientRect()
      if (y < r.top + r.height / 2) return moveSection(id, tid)
      const rest = useStore.getState().sidebar.order.filter((x) => x !== id)
      moveSection(id, rest[rest.indexOf(tid) + 1] ?? null)
    },
  })

  return (
    <section data-section-id={id} data-flip-section={id} className="mt-[calc(0.3rem+var(--sb)*0.65rem)]">
      <Gap open={zone === 'before'} />
      <div ref={contentRef} {...(pinned ? {} : { 'data-section-content': id })}>
        <div
          ref={headRef}
          data-lift-id={`section:${id}`}
          onPointerDown={(e) => !pinned && onPointerDown(e)}
          onClick={pinned ? () => toggle(id) : undefined}
          className={`group relative mb-0.5 flex cursor-pointer select-none items-center gap-1 rounded-xl px-1.5 py-1 transition hover:bg-white/35 ${dragging ? 'opacity-40' : ''}`}
        >
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => toggle(id)}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
            className="grid h-6 w-6 place-items-center rounded-full text-ink-faint transition hover:bg-white/60 hover:text-lilac-600"
          >
            <Disclosure open={!collapsed} size={15} />
          </button>
          <h3 className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            {title}
            {note && <i className="ml-1.5 text-[0.82rem] font-normal normal-case italic tracking-normal">({note})</i>}
          </h3>
          <div className="ml-auto flex items-center" onPointerDown={(e) => e.stopPropagation()}>
            {action}
          </div>
          {!pinned && <GripHandle label="Drag to move this section" onPointerDown={onPointerDown} />}
        </div>
        <Collapse open={!collapsed && !dragging}>{children}</Collapse>
      </div>
      <Gap open={zone === 'after'} />
    </section>
  )
}

export function ScopeRow(props: {
  active: boolean
  onClick: () => void
  dropId?: string
  icon?: React.ReactNode
  label: React.ReactNode
  count: number
  hideZero?: boolean
  sub?: string
}) {
  const { over, active: dragging, props: dropProps } = useDropTarget(props.dropId ?? '')
  const isOver = !!props.dropId && over
  return (
    <button
      {...(props.dropId ? dropProps : {})}
      onClick={props.onClick}
      className={`${rowBase} ${
        props.active ? 'bg-white/70 font-medium text-lilac-700' : 'text-ink hover:bg-white/45'
      } ${isOver ? 'scale-[1.02] bg-lilac-200/80 ring-2 ring-lilac-400/60' : ''} ${
        props.dropId && dragging && !isOver ? 'ring-1 ring-lilac-300/50' : ''
      }`}
    >
      <span className="text-lilac-500">{props.icon}</span>
      <span className="truncate">{props.label}</span>
      {props.sub && <span className="text-xs text-ink-faint">{props.sub}</span>}
      <Count n={props.count} hideZero={props.hideZero} />
    </button>
  )
}

