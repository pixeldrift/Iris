import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { GRAY, tint } from '../core/color'
import { addDays, diffDays, today, weekdayName } from '../core/dates'
import { childrenOf, descendantIds } from '../core/folders'
import { plannedDate } from '../core/tasks'
import type { Folder, Person, ViewId } from '../core/types'
import { useStore } from '../state/store'
import { useDnd, useDropTarget, usePointerDrag } from './dnd'
import { Logo } from './Decor'
import { askConfirm } from './dialogs'
import { FLOWER_SHAPES, Flower } from './Flower'
import { openPerson } from './PeopleDialogs'
import { Popover } from './Popover'
import { useIsMobile } from './useMedia'
import { ScrollFade } from './ScrollFade'
import { useFlip } from './flip'
import { SPRING } from './lift'
import { GripHandle } from './shared'
import { Tip } from './Tip'
import {
  IconAll,
  IconBoard,
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconInbox,
  IconList,
  IconPencil,
  IconPlus,
  IconPond,
  IconPriority,
  IconTimeline,
  IconTrash,
} from './icons'

export const VIEWS: { id: ViewId; label: string; hint: string; icon: typeof IconPond }[] = [
  { id: 'pond', label: 'Pond', hint: 'Free canvas', icon: IconPond },
  { id: 'list', label: 'List', hint: 'Sortable', icon: IconList },
  { id: 'board', label: 'Board', hint: 'Kanban', icon: IconBoard },
  { id: 'priority', label: 'Priority', hint: 'Eisenhower', icon: IconPriority },
  { id: 'calendar', label: 'Calendar', hint: 'Month · week', icon: IconCalendar },
  { id: 'timeline', label: 'Timeline', hint: 'Gantt', icon: IconTimeline },
]

const rowBase =
  'group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-[0.92rem] transition select-none'

function Count({ n }: { n: number }) {
  if (!n) return null
  return <span className="ml-auto pl-2 text-xs tabular-nums text-ink-faint">{n}</span>
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
function Section({ id, title, action, children }: { id: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
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
    <section data-section-id={id} data-flip-section={id} className="mt-3">
      <Gap open={zone === 'before'} />
      <div ref={contentRef} data-section-content={id}>
        <div
          ref={headRef}
          data-lift-id={`section:${id}`}
          onPointerDown={(e) => onPointerDown(e)}
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
          <h3 className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">{title}</h3>
          <div className="ml-auto flex items-center" onPointerDown={(e) => e.stopPropagation()}>
            {action}
          </div>
          <GripHandle label="Drag to move this section" onPointerDown={onPointerDown} />
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
  sub?: string
}) {
  const { over, active: dragging, props: dropProps } = useDropTarget(props.dropId ?? '')
  const isOver = !!props.dropId && over
  return (
    <button
      {...(props.dropId ? dropProps : {})}
      onClick={props.onClick}
      className={`${rowBase} ${
        props.active ? 'bg-white/70 font-medium text-lilac-700 shadow-sm' : 'text-ink hover:bg-white/45'
      } ${isOver ? 'scale-[1.02] bg-lilac-200/80 ring-2 ring-lilac-400/60' : ''} ${
        props.dropId && dragging && !isOver ? 'ring-1 ring-lilac-300/50' : ''
      }`}
    >
      <span className="text-lilac-500">{props.icon}</span>
      <span className="truncate">{props.label}</span>
      {props.sub && <span className="text-xs text-ink-faint">{props.sub}</span>}
      <Count n={props.count} />
    </button>
  )
}

export function Sidebar() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const scope = useStore((s) => s.scope)
  const setScope = useStore((s) => s.setScope)
  const tasks = useStore((s) => s.tasks)
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
  const dueCount = (d: string) => live.filter((t) => plannedDate(t) === d).length
  const folderCount = (id: string) => {
    const ids = descendantIds(folders, id)
    return live.filter((t) => t.folderIds.some((f) => ids.has(f))).length
  }

  const newFolder = (parentId: string | null) => {
    const id = addFolder('New folder', parentId)
    if (parentId) setCollapsed((c) => new Set([...c].filter((x) => x !== parentId)))
    setEditing(id)
  }

  const rootDrop = useDropTarget('froot')

  // Dragging a bubble onto the left edge pulls the drawer open under it, so it can be dropped into a folder.
  const mobile = useIsMobile()
  // The sliver is a drop zone, so it only stays where items can be dragged to folders (not the timeline).
  const sliver = mobile && view !== 'timeline'
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
      <Section id="views" title="Views">
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
    spaces: (
      <Section id="spaces" title="Spaces">
        <ScopeRow active={scope.type === 'all'} onClick={() => setScope({ type: 'all' })} icon={<IconAll />} label="Everything" count={live.length} />
        <ScopeRow
          active={scope.type === 'inbox'}
          onClick={() => setScope({ type: 'inbox' })}
          dropId="inbox"
          icon={<IconInbox />}
          label="Inbox"
          count={live.filter((t) => !t.due && !t.day && t.folderIds.length === 0).length}
        />
      </Section>
    ),
    people: (
      <Section
        id="people"
        title="People"
        action={
          <Tip label="Add a person">
            <button onClick={() => openPerson()} className="rounded-lg p-1 text-ink-faint transition hover:bg-white/60 hover:text-lilac-600">
              <IconPlus size={16} />
            </button>
          </Tip>
        }
      >
        {people.map((p) => (
          <PersonRow key={p.id} person={p} count={live.filter((t) => t.personIds.includes(p.id)).length} />
        ))}
        {people.length === 0 && <p className="px-3 py-1.5 text-sm text-ink-faint">Tag people on tasks, then call or email in a tap.</p>}
      </Section>
    ),
    week: (
      <Section id="week" title="This week">
        {days.map((d) => (
          <ScopeRow
            key={d}
            active={scope.type === 'day' && scope.date === d}
            onClick={() => setScope({ type: 'day', date: d })}
            dropId={`day:${d}`}
            icon={<span className="inline-block w-[18px] text-center text-[0.7rem] font-semibold tabular-nums">{d.slice(8)}</span>}
            label={
              <>
                {weekdayName(d)}
                {diffDays(t0, d) <= 1 && <i className="ml-1.5 text-[0.82em] font-normal italic text-ink-faint">({diffDays(t0, d) === 0 ? 'today' : 'tomorrow'})</i>}
              </>
            }
            count={dueCount(d)}
          />
        ))}
      </Section>
    ),
    folders: (
      <Section
        id="folders"
        title="Folders"
        action={
          <Tip label="New folder · drop a folder here to make it top-level">
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
        <div ref={folderListRef}>
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
        {folders.length === 0 && <p className="px-3 py-2 text-sm text-ink-faint">Folders are tags. Add one with + or by typing in any task.</p>}
      </Section>
    ),
  }

  // Swipe: drag the sliver right to pull the drawer open; drag the open drawer left to push it shut.
  const [swipe, setSwipe] = useState<number | null>(null)
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
      w.dx = open ? Math.min(0, raw) : Math.max(0, raw)
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
        <div inert={mobile && !open} className={`flex min-h-0 flex-1 flex-col transition-opacity duration-200 ${mobile && !open ? 'opacity-0' : 'opacity-100'}`}>
        <div className="flex items-center gap-2.5 px-5 pb-1 pt-5">
          <Logo />
          <h1 className="font-display text-2xl italic tracking-tight text-lilac-700">Lilac</h1>
        </div>

        <ScrollFade>
          <nav ref={navRef} className="px-3 pb-6">
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
  const { over, active, props } = useDropTarget(`person:${person.id}`)
  const on = scope.type === 'person' && scope.id === person.id
  return (
    <div
      {...props}
      onClick={() => setScope({ type: 'person', id: person.id })}
      className={`${rowBase} cursor-pointer ${on ? 'bg-white/70 font-medium text-lilac-700 shadow-sm' : 'hover:bg-white/45'} ${
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

/**
 * Where a dragged folder lands relative to a row:
 *   before - above it: same level, in front (insert line above)
 *   into   - directly on it: becomes its child (the row lights up)
 *   after  - below, left half: same level, behind it (insert line below)
 *   child  - below, right half: becomes its first child (row lights up, line indented)
 */
type Zone = 'before' | 'into' | 'after' | 'child'
const zoneAt = (el: Element, x: number, y: number): Zone => {
  const r = el.getBoundingClientRect()
  const f = (y - r.top) / r.height
  if (f < 0.28) return 'before'
  if (f <= 0.72) return 'into'
  return x < r.left + r.width / 2 ? 'after' : 'child'
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
  // where a dragged folder would land relative to this row
  const zone = useDnd((s): Zone | null =>
    s.over === `folder:${folder.id}` && s.drag?.payload.type === 'folder' && s.drag.payload.id !== folder.id && rowRef.current
      ? zoneAt(rowRef.current, s.drag.x, s.drag.y)
      : null,
  )

  const onPointerDown = usePointerDrag({
    payload: { type: 'folder', id: folder.id },
    label: folder.name,
    touchNeedsHandle: true,
    lift: () => rowRef.current,
    onEnd: ({ target, x, y }) => {
      if (!target) return
      if (target === 'froot') return moveFolder(folder.id, null)
      if (!target.startsWith('folder:')) return
      const tid = target.slice(7)
      const el = document.querySelector(`[data-lift-id="${target}"]`)
      const t = folders.find((f) => f.id === tid)
      if (!el || !t || tid === folder.id) return
      const z = zoneAt(el, x, y)
      if (z === 'into') moveFolder(folder.id, tid)
      else if (z === 'child') moveFolder(folder.id, tid, childrenOf(folders, tid).find((f) => f.id !== folder.id)?.id ?? null)
      else if (z === 'before') moveFolder(folder.id, t.parentId, tid)
      else {
        const sibs = childrenOf(folders, t.parentId).filter((f) => f.id !== folder.id)
        const next = sibs[sibs.findIndex((f) => f.id === tid) + 1]
        moveFolder(folder.id, t.parentId, next?.id ?? null)
      }
    },
  })

  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing === folder.id) inputRef.current?.select()
  }, [editing, folder.id])

  const actions = [
    { label: 'Add subfolder', icon: <IconPlus size={14} />, run: () => onAdd(folder.id) },
    { label: 'Rename', icon: <IconPencil size={14} />, run: () => setEditing(folder.id) },
    {
      label: 'Delete folder',
      icon: <IconTrash size={14} />,
      run: async () => {
        if (await askConfirm({ title: `Delete “${folder.name}”?`, message: 'Tasks stay. They just lose this tag.', confirmLabel: 'Delete', danger: true })) deleteFolder(folder.id)
      },
    },
  ]

  return (
    <div className="rise-in">
      <Gap open={zone === 'before'} id={folder.id} indent={depth} line />
      <div
        ref={rowRef}
        data-lift-id={`folder:${folder.id}`}
        data-flip={folder.id}
        {...dropProps}
        onPointerDown={(e) => editing !== folder.id && onPointerDown(e)}
        onClick={() => setScope({ type: 'folder', id: folder.id })}
        onDoubleClick={() => setEditing(folder.id)}
        className={`${rowBase} cursor-pointer ${active ? 'bg-white/70 font-medium text-lilac-700 shadow-sm' : 'hover:bg-white/45'} ${
          over && !isSelfDrag && zone !== 'before' && zone !== 'after' ? 'scale-[1.02] bg-lilac-200/80 ring-2 ring-lilac-400/60' : ''
        } ${isSelfDrag ? 'opacity-40' : ''} ${dragging && !over ? 'ring-1 ring-lilac-300/40' : ''}`}
        style={{ paddingLeft: `${0.6 + depth * 0.95}rem` }}
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
          <Tip label="Folder options">
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
          <span className="truncate">{folder.name}</span>
        )}
        <Count n={count(folder.id)} />
        <GripHandle label="Drag to move or nest" onPointerDown={(e, handle) => editing !== folder.id && onPointerDown(e, handle)} />
        {editing !== folder.id && (
          <span className="absolute right-8 flex items-center gap-0.5 rounded-lg bg-white/80 px-0.5 opacity-0 shadow-sm transition group-hover:opacity-100">
            {actions.map((b) => (
              <Tip key={b.label} label={b.label}>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    b.run()
                  }}
                  className="rounded-md p-1 text-ink-faint hover:bg-lilac-100 hover:text-lilac-600"
                >
                  {b.icon}
                </button>
              </Tip>
            ))}
          </span>
        )}
      </div>
      <Gap open={zone === 'child'} id={folder.id} indent={depth + 1} line />
      {isOpen && kids.map((k) => <FolderNode key={k.id} {...props} folder={k} depth={depth + 1} />)}
      <Gap open={zone === 'after'} id={folder.id} indent={depth} line />
    </div>
  )
}

const SWATCHES = [285, 320, 345, 20, 40, 90, 150, 175, 200, 230, 255, GRAY]

/** Everything about one folder in one place: rename it, colour it, add inside it, delete it. */
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
  const [picking, setPicking] = useState(false)
  useEffect(() => {
    if (open) {
      setName(folder.name)
      setPicking(false)
    }
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

      {/* flower: a drop-down beside the colour chips */}
      <div className="mt-3.5 flex items-start gap-3">
        <div className="shrink-0">
          <div className="text-xs font-medium text-ink-soft">Flower</div>
          <button
            onClick={() => setPicking((p) => !p)}
            aria-expanded={picking}
            aria-haspopup="listbox"
            className="well mt-1.5 flex h-10 items-center gap-2 rounded-xl pl-2.5 pr-2 text-sm text-ink"
          >
            <Flower hue={folder.hue} shape={folder.shape} size={24} />
            <span className="w-[4.6rem] truncate text-left">{FLOWER_SHAPES.find((x) => x.id === folder.shape)?.label}</span>
            <span className={`text-ink-faint transition-transform ${picking ? 'rotate-180' : ''}`}>
              <IconChevronDown size={14} />
            </span>
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-ink-soft">Colour</div>
          <div className="mt-1.5 grid grid-cols-4 justify-items-start gap-1.5">
            {SWATCHES.map((h) => (
              <button
                key={h}
                onClick={() => updateFolder(folder.id, { hue: h })}
                aria-label={h === GRAY ? 'Colour gray' : `Colour ${h}`}
                aria-pressed={folder.hue === h}
                className={`grid h-[1.4rem] w-[1.4rem] place-items-center rounded-full transition hover:scale-110 ${folder.hue === h ? 'ring-2 ring-lilac-500 ring-offset-1 ring-offset-white/80' : ''}`}
                style={{ background: `${tint(h, 62, 78)}` }}
              >
                {folder.hue === h && <IconCheck size={11} />}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Collapse open={picking}>
        <div role="listbox" aria-label="Flower" className="grid grid-cols-4 gap-1 pt-2">
          {FLOWER_SHAPES.map((x) => (
            <button
              key={x.id}
              role="option"
              aria-selected={folder.shape === x.id}
              aria-label={x.label}
              title={x.label}
              onClick={() => {
                updateFolder(folder.id, { shape: x.id })
                setPicking(false)
              }}
              className={`grid h-11 place-items-center rounded-xl transition hover:bg-lilac-100/80 ${folder.shape === x.id ? 'bg-lilac-100 ring-1 ring-lilac-300' : ''}`}
            >
              <Flower hue={folder.hue} shape={x.id} size={28} />
            </button>
          ))}
        </div>
      </Collapse>
      <input
        type="range"
        min={0}
        max={360}
        value={folder.hue}
        onChange={(e) => updateFolder(folder.id, { hue: Number(e.target.value) })}
        className="soft hue mt-2"
        aria-label="Custom colour"
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
 * nudging its neighbours apart. It answers hit-tests as the same folder so the target never flickers.
 */
function Gap({ open, id, indent = 0, line = false }: { open: boolean; id?: string; indent?: number; line?: boolean }) {
  const h = useDnd((s) => s.liftH)
  return (
    <div
      {...(id ? { 'data-drop': `folder:${id}` } : {})}
      aria-hidden
      className="flex items-center overflow-hidden px-2"
      style={{ height: open ? h : 0, transition: `height 0.32s ${SPRING}`, paddingLeft: line ? `${0.6 + indent * 0.95 + 0.4}rem` : undefined }}
    >
      {line ? (
        // the insert line: its left edge shows how deep the folder will sit
        <div
          className={`h-[3px] w-full rounded-full bg-lilac-500 shadow-[0_0_8px_rgba(159,111,205,0.75)] transition-all duration-200 ${open ? 'scale-x-100 opacity-100' : 'scale-x-50 opacity-0'}`}
          style={{ transformOrigin: 'left' }}
        />
      ) : (
        <div className={`h-full w-full rounded-xl bg-lilac-200/40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`} />
      )}
    </div>
  )
}
