import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { GRAY, tint } from '../core/color'
import { addDays, diffDays, fromISO, MONTHS, ordinalSuffix, today, weekdayName } from '../core/dates'
import { childrenOf, descendantIds, placeInTree, type Placement, type TreeRow } from '../core/folders'
import { MAX_FAVORITES } from '../core/people'
import { taskOnDate } from '../core/recurrence'
import type { Folder, Person, ViewId } from '../core/types'
import { useStore } from '../state/store'
import { create } from 'zustand'
import { targetAt, useDnd, useDropTarget, usePointerDrag } from './dnd'
import { Logo } from './Decor'
import { askConfirm } from './dialogs'
import { FLOWER_SHAPES, Flower } from './Flower'
import { openPerson } from './PeopleDialogs'
import { Popover } from './Popover'
import { useIsMobile } from './useMedia'
import { ScrollFade } from './ScrollFade'
import { useFlip } from './flip'
import { lifter, SPRING } from './lift'
import { AccountRow } from './Account'
import { openCompose } from './NewTask'
import { CountBubble, GripHandle } from './shared'
import { Tip } from './Tip'
import {
  IconAll,
  IconBoard,
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconInbox,
  IconBook,
  IconHeart,
  IconList,
  IconPencil,
  IconPlus,
  IconPond,
  IconPriority,
  IconTimeline,
  IconTrash,
} from './icons'

export const VIEWS: { id: ViewId; label: string; hint: string; icon: typeof IconPond }[] = [
  { id: 'pond', label: 'Pond', hint: 'Freeform', icon: IconPond },
  { id: 'list', label: 'List', hint: 'Sortable', icon: IconList },
  { id: 'board', label: 'Board', hint: 'Kanban', icon: IconBoard },
  { id: 'priority', label: 'Priority', hint: 'Eisenhower', icon: IconPriority },
  { id: 'calendar', label: 'Calendar', hint: 'Schedule', icon: IconCalendar },
  { id: 'timeline', label: 'Timeline', hint: 'Gantt', icon: IconTimeline },
]

const rowBase =
  'group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-[calc(0.18rem+var(--sb)*0.28rem)] text-left text-[0.92rem] transition select-none'

function Count({ n, hideZero = false }: { n: number; hideZero?: boolean }) {
  if (!n && hideZero) return null
  return <CountBubble n={n} className="ml-auto" />
}

/** The app's disclosure arrow: a soft V that turns to point right when closed. */
function Disclosure({ open, size = 16 }: { open: boolean; size?: number }) {
  return (
    <span
      className="inline-grid place-items-center transition-transform duration-300"
      style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transitionTimingFunction: SPRING }}
    >
      <IconChevronDown size={size} />
    </span>
  )
}

/** Folds shut and open with a smooth height change instead of snapping. */
function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows,opacity,visibility] duration-300"
      style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0, visibility: open ? 'visible' : 'hidden', transitionDelay: open ? '0s' : '0s, 0s, 0.3s' }}
    >
      <div inert={!open} className="-mx-1 min-h-0 overflow-hidden px-1">
        {children}
      </div>
    </div>
  )
}

const sectionAt = (x: number, y: number): string | null => {
  for (const el of document.elementsFromPoint(x, y)) {
    const sec = (el as HTMLElement).closest?.('[data-section-id]') as HTMLElement | null
    if (sec?.dataset.sectionId) return `section:${sec.dataset.sectionId}`
  }
  return null
}

/** A sidebar section: fold it with the arrow, drag it by the grip to put it somewhere else. */
/** The month(s) a run of days falls in: October, or Oct–Nov when it straddles two. */
function weekMonths(days: string[]): string {
  const names = [...new Set(days.map((d) => fromISO(d).getMonth()))]
  return names.length === 1 ? MONTHS[names[0]] : names.map((m) => MONTHS[m].slice(0, 3)).join('–')
}

function Section({ id, title, note, action, pinned = false, children }: { id: string; title: string; note?: string; action?: React.ReactNode; pinned?: boolean; children: React.ReactNode }) {
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

function ScopeRow(props: {
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

export function Sidebar() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const scope = useStore((s) => s.scope)
  const setScope = useStore((s) => s.setScope)
  const allTasks = useStore((s) => s.tasks)
  const tasks = useMemo(() => allTasks.filter((t) => !t.draft), [allTasks])
  const folders = useStore((s) => s.folders)
  const people = useStore((s) => s.people)
  const open = useStore((s) => s.sidebarOpen)
  const setSidebar = useStore((s) => s.setSidebar)
  const addFolder = useStore((s) => s.addFolder)

  const [editing, setEditing] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const live = useMemo(() => tasks.filter((t) => t.status !== 'done'), [tasks])
  const t0 = today()
  const days = Array.from({ length: 7 }, (_, i) => addDays(t0, i))
  const dueCount = (d: string) => live.filter((t) => taskOnDate(t, d)).length
  const folderCount = (id: string) => {
    const ids = descendantIds(folders, id)
    return live.filter((t) => t.folderIds.some((f) => ids.has(f))).length
  }

  const newFolder = (parentId: string | null) => {
    const id = addFolder('New group', parentId)
    if (parentId) setCollapsed((c) => new Set([...c].filter((x) => x !== parentId)))
    setEditing(id)
  }

  const rootDrop = useDropTarget('froot')
  const topSlot = useFolderSlot((st) => (st.slot?.kind === 'slot' && st.slot.afterId === null ? st.slot : null))

  // Dragging a bubble onto the left edge pulls the drawer open under it, so it can be dropped into a folder.
  const mobile = useIsMobile()
  // The sliver is a drop zone and a grab handle for opening the drawer, in every view.
  const sliver = mobile
  const dragX = useDnd((st) => (st.drag?.payload.type === 'task' ? st.drag.x : null))
  const openedByDrag = useRef(false)
  useEffect(() => {
    if (!mobile) return
    if (dragX !== null && dragX < 28 && !open) {
      openedByDrag.current = true
      setSidebar(true)
    } else if (dragX === null && openedByDrag.current) {
      openedByDrag.current = false
      const t = window.setTimeout(() => setSidebar(false), 500) // let the drop finish first
      return () => window.clearTimeout(t)
    }
  }, [dragX, mobile, open, setSidebar])
  const folderListRef = useRef<HTMLDivElement>(null)
  useFlip(folderListRef)

  const navRef = useRef<HTMLElement>(null)
  useFlip(navRef, 'flip-section')
  const order = useStore((st) => st.sidebar.order)

  const sections: Record<string, React.ReactNode> = {
    views: (
      <Section id="views" title="Views" pinned>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`${rowBase} ${view === v.id ? 'bg-lilac-500/90 text-white shadow-md shadow-lilac-500/30' : 'hover:bg-white/45'}`}
          >
            <span className={view === v.id ? 'text-white' : 'text-lilac-500'}>
              <v.icon />
            </span>
            {v.label}
            <span className={`ml-auto text-xs ${view === v.id ? 'text-white/70' : 'text-ink-faint'}`}>{v.hint}</span>
          </button>
        ))}
      </Section>
    ),
    people: (
      <Section
        id="people"
        title="People &amp; Places"
        action={
          <Tip label="Add a person">
            <button onClick={() => openPerson()} className="rounded-lg p-1 text-ink-faint transition hover:bg-white/60 hover:text-lilac-600">
              <IconPlus size={16} />
            </button>
          </Tip>
        }
      >
        {people.filter((p) => p.favorite && !p.isMe).slice(0, MAX_FAVORITES).map((p) => (
          <PersonRow key={p.id} person={p} count={live.filter((t) => t.personIds.includes(p.id)).length} />
        ))}
        {people.some((p) => p.favorite && !p.isMe) ? null : <p className="px-3 py-1.5 text-sm text-ink-faint">Heart people in your address book to keep them here.</p>}
        <ScopeRow active={scope.type === 'contacts'} onClick={() => setScope({ type: 'contacts' })} icon={<IconBook />} label="Address book" count={people.length} />
      </Section>
    ),
    week: (
      <Section id="week" title="This week" note={weekMonths(days)}>
        {days.map((d) => (
          <ScopeRow
            key={d}
            active={scope.type === 'day' && scope.date === d}
            onClick={() => setScope(scope.type === 'day' && scope.date === d ? { type: 'all' } : { type: 'day', date: d })}
            dropId={`day:${d}`}
            icon={
              <span className="inline-block w-[26px] text-center text-[0.7rem] font-semibold tabular-nums">
                {Number(d.slice(8))}
                <sup className="text-[0.58em] font-medium">{ordinalSuffix(Number(d.slice(8)))}</sup>
              </span>
            }
            label={
              <>
                {weekdayName(d)}
                {diffDays(t0, d) <= 1 && <i className="ml-1.5 text-[0.82em] font-normal italic text-ink-faint">({diffDays(t0, d) === 0 ? 'today' : 'tomorrow'})</i>}
              </>
            }
            count={dueCount(d)}
            hideZero
          />
        ))}
      </Section>
    ),
    folders: (
      <Section
        id="folders"
        title="Groups"
        action={
          <Tip label="New group · drop a group here to make it top-level">
            <button
              {...rootDrop.props}
              onClick={() => newFolder(null)}
              className={`rounded-lg p-1 text-ink-faint transition hover:bg-white/60 hover:text-lilac-600 ${rootDrop.over ? 'bg-lilac-200 text-lilac-700' : ''}`}
            >
              <IconPlus size={16} />
            </button>
          </Tip>
        }
      >
        <div ref={folderListRef} data-folder-list>
          <Gap open={topSlot !== null} indent={0} line />
          {childrenOf(folders, null).map((f) => (
            <FolderNode
              key={f.id}
              folder={f}
              depth={0}
              editing={editing}
              setEditing={setEditing}
              collapsed={collapsed}
              toggle={(id) =>
                setCollapsed((c) => {
                  const n = new Set(c)
                  if (n.has(id)) n.delete(id)
                  else n.add(id)
                  return n
                })
              }
              count={folderCount}
              onAdd={newFolder}
            />
          ))}
        </div>
        {folders.length === 0 && <p className="px-3 py-2 text-sm text-ink-faint">Groups are tags. Add one with + or by typing in any task.</p>}
        {/* what belongs to no group yet (and has no date): the catch-all at the end of the list */}
        <ScopeRow
          active={scope.type === 'inbox'}
          onClick={() => setScope(scope.type === 'inbox' ? { type: 'all' } : { type: 'inbox' })}
          dropId="inbox"
          icon={<IconInbox />}
          label="Unsorted"
          count={live.filter((t) => !t.due && !t.day && t.folderIds.length === 0).length}
        />
      </Section>
    ),
  }

  // Swipe: drag the sliver right to pull the drawer open; drag the open drawer left to push it shut.
  const asideRef = useRef<HTMLElement>(null)
  const [swipe, setSwipe] = useState<number | null>(null)
  // how open the drawer is while a finger drags it (0 = sliver, 1 = full): the contents fade in with it
  const range = Math.max(1, (asideRef.current?.offsetWidth ?? 280) - 18.4)
  const progress = swipe === null ? null : open ? 1 + swipe / range : swipe / range
  const swipeRef = useRef<{ x: number; dx: number; moved: boolean; t: number } | null>(null)
  const swipeProps = {
    onPointerDown: (e: React.PointerEvent) => {
      if (!mobile || (e.pointerType === 'mouse' && e.button !== 0)) return
      swipeRef.current = { x: e.clientX, dx: 0, moved: false, t: e.timeStamp }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const w = swipeRef.current
      if (!w) return
      const raw = e.clientX - w.x
      if (!w.moved && Math.abs(raw) < 8) return
      if (!w.moved) (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      w.moved = true
      // the drawer only ever travels between its two resting places, never past either
      const range = Math.max(1, (asideRef.current?.offsetWidth ?? 280) - 18.4)
      w.dx = open ? Math.max(-range, Math.min(0, raw)) : Math.min(range, Math.max(0, raw))
      setSwipe(w.dx)
    },
    onPointerUp: (e: React.PointerEvent) => {
      const w = swipeRef.current
      swipeRef.current = null
      if (!w?.moved) return
      const fast = Math.abs(w.dx) / Math.max(1, e.timeStamp - w.t) > 0.4
      setSwipe(null)
      if (!open && (w.dx > 70 || (fast && w.dx > 24))) setSidebar(true)
      if (open && (w.dx < -70 || (fast && w.dx < -24))) setSidebar(false)
      justSwiped.current = true
      setTimeout(() => (justSwiped.current = false), 0)
    },
    onPointerCancel: () => {
      swipeRef.current = null
      setSwipe(null)
    },
  }
  const justSwiped = useRef(false)

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px] md:hidden" onClick={() => setSidebar(false)} />}
      <aside
        ref={asideRef}
        className={`glass fixed inset-y-0 left-0 z-50 flex w-[17.5rem] shrink-0 flex-col rounded-r-3xl border-l-0 transition-transform duration-300 md:static md:z-10 md:m-3 md:mr-0 md:translate-x-0 md:rounded-3xl md:border-l ${
          open ? 'translate-x-0' : sliver ? '-translate-x-[calc(100%-1.15rem)]' : '-translate-x-full'
        } ${swipe !== null ? '!transition-none' : ''}`}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          transitionTimingFunction: SPRING,
          ...(swipe !== null ? { translate: open ? `${swipe}px 0` : `calc(-100% + 1.15rem + ${swipe}px) 0` } : {}),
          ...(mobile ? { touchAction: 'pan-y' } : {}),
        }}
        {...(open ? swipeProps : {})}
      >
        {/* On a phone a plain sliver of glass stays beside the pond (nothing of the menu shows through):
            tap it, or drag an item onto it, to open the drawer. */}
        {sliver && !open && (
          // the whole visible edge is one real button, so a tap anywhere along it works like the hamburger
          <button
            type="button"
            onClick={() => !justSwiped.current && setSidebar(true)}
            aria-label="Open menu"
            style={{ touchAction: 'pan-y' }}
            className="absolute inset-y-0 right-0 z-10 w-[1.15rem] cursor-pointer rounded-r-3xl"
            {...swipeProps}
          />
        )}
        <div
          inert={mobile && !open}
          className={`flex min-h-0 flex-1 flex-col transition-opacity duration-200 ${mobile && !open ? 'opacity-0' : 'opacity-100'}`}
          style={progress !== null ? { opacity: Math.min(1, Math.max(0, progress)), transition: 'none' } : undefined}
        >
        <div className="flex items-center gap-2.5 px-[calc(0.8rem+var(--sb)*0.5rem)] pb-[calc(var(--sb)*0.25rem)] pt-[calc(0.6rem+var(--sb)*1rem)]">
          <Logo />
          <h1 className="font-display text-2xl italic tracking-tight text-lilac-700">Lilac</h1>
          <AccountRow />
        </div>

        <ScrollFade>
          <nav ref={navRef} className="px-[calc(0.35rem+var(--sb)*0.6rem)] pb-[calc(0.6rem+var(--sb)*1.2rem)]">
            {sections.views}
            {/* views are how you look; everything below is what you look at */}
            <div aria-hidden className="mx-3 mb-[calc(0.2rem+var(--sb)*0.4rem)] mt-[calc(0.3rem+var(--sb)*0.5rem)] h-px bg-gradient-to-r from-transparent via-ink-faint/35 to-transparent" />
            <div className="mt-1">
              <ScopeRow active={scope.type === 'all'} onClick={() => setScope({ type: 'all' })} icon={<IconAll />} label="Everything" count={live.length} />
            </div>
            {order.map((id) => (
              <Fragment key={id}>{sections[id]}</Fragment>
            ))}
          </nav>
        </ScrollFade>
        </div>
      </aside>
    </>
  )
}

function PersonRow({ person, count }: { person: Person; count: number }) {
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
      <span
        className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[0.62rem] font-semibold"
        style={{ background: `${tint(person.hue, 65, 86)}`, color: `${tint(person.hue, 38, 32)}` }}
      >
        {person.name[0]?.toUpperCase()}
      </span>
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
const INDENT_STEP = 26

/** The slot a dragged folder would drop into, shared so the right row can open its gap. */
const useFolderSlot = create<{ slot: Placement | null }>(() => ({ slot: null }))

/**
 * Folder drag, the outliner way: the pointer's height chooses the slot between two visible rows,
 * and sideways travel from where the row was picked up chooses the depth (left = out one level).
 */
function slotFor(folders: Folder[], dragId: string, startDepth: number, y: number, dx: number, current: Placement | null = null): Placement | null {
  const list = document.querySelector('[data-folder-list]')
  if (!list) return null
  const skip = descendantIds(folders, dragId)
  skip.add(dragId)
  // The open gap pushes rows down; measure everything as if it were closed so the slot can't chase itself.
  const gaps = [...list.querySelectorAll<HTMLElement>('[data-gap]')].map((g) => g.getBoundingClientRect()).map((g) => ({ top: g.top, h: g.height }))
  const flat = (v: number) => gaps.reduce((acc, g) => acc - Math.min(Math.max(v - g.top, 0), g.h), v)
  y = flat(y)
  const rows: (TreeRow & { mid: number })[] = []
  let onto: string | null = null
  list.querySelectorAll<HTMLElement>('[data-folder-row]').forEach((el) => {
    if (skip.has(el.dataset.folderRow!)) return
    const b = el.getBoundingClientRect()
    const r = { top: flat(b.top), bottom: flat(b.bottom), height: flat(b.bottom) - flat(b.top) }
    rows.push({ id: el.dataset.folderRow!, depth: Number(el.dataset.depth), mid: r.top + r.height / 2 })
    // straight onto the middle of a row: it becomes that folder's child
    // (once a row is lit it stays lit a little beyond its edges, so a resting finger can't flicker it)
    const pad = current?.kind === 'into' && current.parentId === el.dataset.folderRow ? 0.1 : 0.2
    if (y >= r.top + r.height * pad && y <= r.bottom - r.height * pad) onto = el.dataset.folderRow!
  })
  if (onto) return { kind: 'into', afterId: null, depth: 0, parentId: onto, beforeId: null }
  let after = -1
  rows.forEach((r, i) => {
    if (r.mid < y) after = i
  })
  return placeInTree(folders, dragId, rows, after, startDepth + Math.round(dx / INDENT_STEP))
}

interface NodeProps {
  folder: Folder
  depth: number
  editing: string | null
  setEditing: (id: string | null) => void
  collapsed: Set<string>
  toggle: (id: string) => void
  count: (id: string) => number
  onAdd: (parent: string) => void
}

/** The count bubble doubles as the group's little menu: hover it with a mouse, tap it on a phone. */
function GroupMenu({ n, name, actions }: { n: number; name: string; actions: { label: string; icon: React.ReactNode; run: () => void }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const timer = useRef(0)
  const hover = () => window.matchMedia('(hover: hover)').matches
  const show = () => {
    window.clearTimeout(timer.current)
    setOpen(true)
  }
  const hide = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(false), 180)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <>
      <span ref={ref} className="ml-auto inline-flex" onMouseEnter={() => hover() && show()} onMouseLeave={() => hover() && hide()}>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            setOpen((o) => !o)
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${name}: ${n} ${n === 1 ? 'item' : 'items'}. Open menu`}
          className="rounded-full transition hover:scale-105"
        >
          <CountBubble n={n} />
        </button>
      </span>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} align="end" className="!min-w-0 !p-1" onMouseEnter={() => hover() && show()} onMouseLeave={() => hover() && hide()}>
        <div className="flex items-center gap-0.5">
          {/* the everyday action sits under the thumb (right); delete is furthest away */}
          {[...actions].reverse().map((a) => (
            <button
              key={a.label}
              aria-label={a.label}
              title={a.label}
              onClick={() => {
                setOpen(false)
                a.run()
              }}
              className={`grid h-9 w-9 place-items-center rounded-xl text-ink-soft transition hover:bg-lilac-100/80 ${a.label === 'Delete' ? 'hover:text-[#b04a6e]' : 'hover:text-lilac-700'}`}
            >
              {a.icon}
            </button>
          ))}
        </div>
      </Popover>
    </>
  )
}

function FolderNode(props: NodeProps) {
  const { folder, depth, editing, setEditing, collapsed, toggle, count, onAdd } = props
  const folders = useStore((s) => s.folders)
  const scope = useStore((s) => s.scope)
  const setScope = useStore((s) => s.setScope)
  const renameFolder = useStore((s) => s.renameFolder)
  const deleteFolder = useStore((s) => s.deleteFolder)
  const moveFolder = useStore((s) => s.moveFolder)
  const kids = childrenOf(folders, folder.id)
  const isOpen = !collapsed.has(folder.id)
  const active = scope.type === 'folder' && scope.id === folder.id
  const rowRef = useRef<HTMLDivElement>(null)
  const flowerRef = useRef<HTMLSpanElement>(null)
  const [options, setOptions] = useState(false)
  const { over, active: dragging, props: dropProps } = useDropTarget(`folder:${folder.id}`)
  const dragPayload = useDnd((s) => s.drag?.payload)
  const isSelfDrag = dragPayload?.type === 'folder' && dragPayload.id === folder.id
  const slotHere = useFolderSlot((st) => (st.slot?.kind === 'slot' && st.slot.afterId === folder.id ? st.slot : null))
  const dragIsTask = dragPayload?.type === 'task'
  const intoMe = useFolderSlot((st) => st.slot?.kind === 'into' && st.slot.parentId === folder.id)
  // the group a drop would land inside, so "last child" and "top level" look different while you are still deciding
  const parentMe = useFolderSlot((st) => st.slot?.kind === 'slot' && st.slot.parentId === folder.id)

  const track = useRef({ x: 0, y: 0, dx: 0, raf: 0 })
  const refresh = () => {
    const { x, y, dx } = track.current
    const next = targetAt(x, y) === 'froot' ? null : slotFor(useStore.getState().folders, folder.id, depth, lifter.centerY() ?? y, dx, useFolderSlot.getState().slot)
    const cur = useFolderSlot.getState().slot
    const same = cur && next && cur.kind === next.kind && cur.afterId === next.afterId && cur.depth === next.depth && cur.parentId === next.parentId && cur.beforeId === next.beforeId
    if (!same && cur !== next) useFolderSlot.setState({ slot: next })
    // the carried row never slides sideways: the finger alone says what a drop would do, and a symbol says which way it goes
    lifter.hint(!next ? null : next.kind === 'into' || next.depth > depth ? 'in' : next.depth < depth ? 'out' : null)
  }

  const onPointerDown = usePointerDrag({
    payload: { type: 'folder', id: folder.id },
    label: folder.name,
    touchNeedsHandle: true,
    lift: () => rowRef.current,
    liftOpaque: true,
    lockX: true,
    resolve: (x, y) => {
      const t = targetAt(x, y)
      if (t === 'froot') return t
      const list = document.querySelector('[data-folder-list]')?.getBoundingClientRect()
      return list && x <= list.right && y >= list.top - 30 && y <= list.bottom + 30 ? 'slot' : null
    },
    onStart: () => {
      // A finger resting on the screen sends no more moves, but the rows keep gliding under it as the
      // gap opens and closes: keep re-reading the slot every frame so what lights up is what is under you.
      const tick = () => {
        refresh()
        track.current.raf = requestAnimationFrame(tick)
      }
      track.current.raf = requestAnimationFrame(tick)
    },
    onMove: (x, y, dx) => {
      track.current.x = x
      track.current.y = y
      track.current.dx = dx
      refresh()
    },
    onEnd: ({ target }) => {
      cancelAnimationFrame(track.current.raf)
      refresh()
      const slot = useFolderSlot.getState().slot
      useFolderSlot.setState({ slot: null })
      if (target === 'froot') return moveFolder(folder.id, null)
      if (target !== 'slot' || !slot) return
      const sibs = childrenOf(folders, folder.parentId)
      const next = sibs[sibs.findIndex((f) => f.id === folder.id) + 1]?.id ?? null
      if (slot.kind === 'slot' && slot.parentId === folder.parentId && slot.beforeId === next) return
      moveFolder(folder.id, slot.parentId, slot.beforeId)
    },
  })

  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing === folder.id) inputRef.current?.select()
  }, [editing, folder.id])

  const actions = [
    { label: 'Add', icon: <IconPlus size={14} />, run: () => openCompose(null, { folderIds: [folder.id] }) },
    { label: 'Rename', icon: <IconPencil size={14} />, run: () => setEditing(folder.id) },
    {
      label: 'Delete',
      icon: <IconTrash size={14} />,
      run: async () => {
        if (await askConfirm({ title: `Delete “${folder.name}”?`, message: 'Tasks stay. They just lose this tag.', confirmLabel: 'Delete', danger: true })) deleteFolder(folder.id)
      },
    },
  ]

  return (
    <div className="rise-in">
      <div
        ref={rowRef}
        data-folder-row={folder.id}
        data-depth={depth}
        data-lift-id={`folder:${folder.id}`}
        data-flip={folder.id}
        {...dropProps}
        onPointerDown={(e) => editing !== folder.id && onPointerDown(e)}
        onClick={() => setScope(active ? { type: 'all' } : { type: 'folder', id: folder.id })}
        onDoubleClick={() => setEditing(folder.id)}
        className={`${rowBase} cursor-pointer ${active ? 'bg-white/70 font-medium text-lilac-700' : 'hover:bg-white/45'} ${
          (over && dragIsTask && !isSelfDrag) || intoMe ? 'scale-[1.02] bg-lilac-200/80 ring-2 ring-lilac-400/60' : parentMe ? 'bg-lilac-100/60 ring-1 ring-lilac-300/70' : ''
        } ${isSelfDrag ? 'opacity-40' : ''} ${dragging && !over ? 'ring-1 ring-lilac-300/40' : ''}`}
        // a child's box is shorter, not just its text pushed over: it keeps its right edge and starts further in
        style={{ marginLeft: `${depth * 0.95}rem`, width: `calc(100% - ${depth * 0.95}rem)` }}
      >
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            toggle(folder.id)
          }}
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-ink-faint transition hover:bg-white/60 ${kids.length ? '' : 'invisible'}`}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          <Disclosure open={isOpen} size={14} />
        </button>
        <span ref={flowerRef} className="inline-flex shrink-0">
          <Tip label="Group options">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setOptions((o) => !o)
              }}
              aria-haspopup="dialog"
              aria-expanded={options}
              className="grid h-6 w-6 place-items-center rounded-full transition hover:scale-110 hover:bg-white/60"
            >
              <Flower hue={folder.hue} shape={folder.shape} size={18} />
            </button>
          </Tip>
        </span>
        <FolderOptions folder={folder} open={options} onClose={() => setOptions(false)} anchor={flowerRef} onAdd={onAdd} />
        {editing === folder.id ? (
          <input
            ref={inputRef}
            autoFocus
            defaultValue={folder.name}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              renameFolder(folder.id, e.target.value)
              setEditing(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur()
            }}
            className="well min-w-0 flex-1 rounded-lg px-2 py-0.5"
          />
        ) : (
          <span
            className="truncate"
            onClick={(e) => {
              // already filtered to this group, with a mouse: the name is the thing to edit
              if (active && window.matchMedia('(hover: hover)').matches) {
                e.stopPropagation()
                setEditing(folder.id)
              }
            }}
          >
            {folder.name}
          </span>
        )}
        <GroupMenu n={count(folder.id)} name={folder.name} actions={actions} />
        <GripHandle label="Drag to move or nest" onPointerDown={(e, handle) => editing !== folder.id && onPointerDown(e, handle)} />
      </div>
      <Gap open={slotHere !== null} indent={slotHere?.depth ?? 0} line />
      {isOpen && kids.map((k) => <FolderNode key={k.id} {...props} folder={k} depth={depth + 1} />)}
    </div>
  )
}

const SWATCHES = [285, 320, 345, 20, 40, 90, 150, 175, 200, 230, 255, GRAY]

/** Everything about one folder in one place: rename it, color it, add inside it, delete it. */
function FolderOptions({
  folder,
  open,
  onClose,
  anchor,
  onAdd,
}: {
  folder: Folder
  open: boolean
  onClose: () => void
  anchor: React.RefObject<HTMLElement | null>
  onAdd: (parentId: string) => void
}) {
  const renameFolder = useStore((s) => s.renameFolder)
  const updateFolder = useStore((s) => s.updateFolder)
  const deleteFolder = useStore((s) => s.deleteFolder)
  const [name, setName] = useState(folder.name)
  useEffect(() => {
    if (open) setName(folder.name)
  }, [open, folder.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Popover open={open} onClose={onClose} anchor={anchor} className="w-80 p-3.5">
      <label className="block text-xs font-medium text-ink-soft">
        Name
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            renameFolder(folder.id, e.target.value) // ignored while empty
          }}
          onBlur={() => !name.trim() && setName(folder.name)}
          onKeyDown={(e) => e.key === 'Enter' && onClose()}
          className="well mt-1 w-full rounded-xl px-3 py-2 text-sm font-normal text-ink"
        />
      </label>

      {/* flower and color palettes side by side, 4 x 3 each; the hue slider sits under both */}
      <div className="mt-3.5 grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs font-medium text-ink-soft">Flower</div>
          <div role="listbox" aria-label="Flower" className="mt-1.5 grid grid-cols-4 gap-0.5">
            {FLOWER_SHAPES.map((x) => (
              <button
                key={x.id}
                role="option"
                aria-selected={folder.shape === x.id}
                aria-label={x.label}
                onClick={() => updateFolder(folder.id, { shape: x.id })}
                className="grid h-8 place-items-center rounded-lg transition hover:bg-lilac-100/60"
              >
                <span className={`grid h-[1.4rem] w-[1.4rem] place-items-center rounded-full ${folder.shape === x.id ? 'ring-2 ring-lilac-500 ring-offset-1 ring-offset-white/80' : ''}`}>
                  <Flower hue={folder.hue} shape={x.id} size={19} mono />
                </span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-ink-soft">Color</div>
          <div className="mt-1.5 grid grid-cols-4 gap-0.5">
            {SWATCHES.map((h) => (
              <button
                key={h}
                onClick={() => updateFolder(folder.id, { hue: h })}
                aria-label={h === GRAY ? 'Color gray' : `Color ${h}`}
                aria-pressed={folder.hue === h}
                className="grid h-8 place-items-center rounded-lg transition hover:bg-lilac-100/60"
              >
                <span
                  className={`grid h-[1.4rem] w-[1.4rem] place-items-center rounded-full ${folder.hue === h ? 'ring-2 ring-lilac-500 ring-offset-1 ring-offset-white/80' : ''}`}
                  style={{ background: `${tint(h, 62, 78)}` }}
                >
                  {folder.hue === h && <IconCheck size={11} />}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={360}
        value={folder.hue}
        onChange={(e) => updateFolder(folder.id, { hue: Number(e.target.value) })}
        className="soft hue mt-2"
        aria-label="Custom color"
      />

      <div className="mt-3 flex items-center border-t border-white/60 pt-2.5">
        <button
          onClick={() => {
            onClose()
            onAdd(folder.id)
          }}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-lilac-700 transition hover:bg-lilac-100/80"
        >
          <IconPlus size={14} /> Add inside
        </button>
        <button
          onClick={async () => {
            onClose()
            if (await askConfirm({ title: `Delete “${folder.name}”?`, message: 'Tasks stay. They just lose this tag.', confirmLabel: 'Delete', danger: true })) deleteFolder(folder.id)
          }}
          className="ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-ink-faint transition hover:text-[#b04a6e]"
        >
          <IconTrash size={14} /> Delete
        </button>
      </div>
    </Popover>
  )
}

/**
 * The room a dragged folder will take. It opens (with a gentle spring) where the item would land,
 * nudging its neighbors apart. It answers hit-tests as the same folder so the target never flickers.
 */
/** Where a drop would land: a colored bar laid over the seam, which takes no room, so nothing shifts until you let go. */
function Gap({ open }: { open: boolean; id?: string; indent?: number; line?: boolean }) {
  return (
    <div aria-hidden data-gap className="pointer-events-none relative z-10 h-0">
      <div
        className={`absolute inset-x-1 top-[-0.1rem] h-[0.22rem] rounded-full bg-lilac-500 shadow-[0_0_8px_rgb(var(--lr-500)/0.55)] transition-opacity duration-150 ${open ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  )
}
