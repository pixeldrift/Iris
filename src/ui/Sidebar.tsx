import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, diffDays, today, weekdayName } from '../core/dates'
import { childrenOf, descendantIds } from '../core/folders'
import { plannedDate } from '../core/tasks'
import type { Folder, Person, ViewId } from '../core/types'
import { useStore } from '../state/store'
import { useDnd, useDropTarget, usePointerDrag } from './dnd'
import { Logo } from './Decor'
import { askConfirm } from './dialogs'
import { Flower } from './Flower'
import { openPerson } from './PeopleDialogs'
import { Tip } from './Tip'
import {
  IconAll,
  IconBoard,
  IconCalendar,
  IconChevron,
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

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-1 flex items-center px-2.5">
        <h3 className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">{title}</h3>
        <div className="ml-auto">{action}</div>
      </div>
      {children}
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

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px] md:hidden" onClick={() => setSidebar(false)} />}
      <aside
        className={`glass fixed inset-y-0 left-0 z-50 flex w-[17.5rem] shrink-0 flex-col rounded-r-3xl border-l-0 transition-transform duration-300 md:static md:z-10 md:m-3 md:mr-0 md:translate-x-0 md:rounded-3xl md:border-l ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex items-center gap-2.5 px-5 pb-1 pt-5">
          <Logo />
          <h1 className="font-display text-2xl italic tracking-tight text-lilac-700">Lilac</h1>
        </div>

        <nav className="scroll-soft min-h-0 flex-1 overflow-y-auto px-3 pb-6">
          <Section title="Views">
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

          <Section title="Spaces">
            <ScopeRow
              active={scope.type === 'all'}
              onClick={() => setScope({ type: 'all' })}
              icon={<IconAll />}
              label="Everything"
              count={live.length}
            />
            <ScopeRow
              active={scope.type === 'inbox'}
              onClick={() => setScope({ type: 'inbox' })}
              dropId="inbox"
              icon={<IconInbox />}
              label="Inbox"
              count={live.filter((t) => !t.due && !t.day && t.folderIds.length === 0).length}
            />
          </Section>

          <Section
            title="People"
            action={
              <Tip label="Add a person">
                <button
                  onClick={() => openPerson()}
                  className="rounded-lg p-1 text-ink-faint transition hover:bg-white/60 hover:text-lilac-600"
                >
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

          <Section title="This week">
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

          <Section
            title="Folders"
            action={
              <Tip label="New folder · drop a folder here to make it top-level">
                <button
                  {...rootDrop.props}
                  onClick={() => newFolder(null)}
                  className={`rounded-lg p-1 text-ink-faint transition hover:bg-white/60 hover:text-lilac-600 ${
                    rootDrop.over ? 'bg-lilac-200 text-lilac-700' : ''
                  }`}
                >
                  <IconPlus size={16} />
                </button>
              </Tip>
            }
          >
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
            {folders.length === 0 && (
              <p className="px-3 py-2 text-sm text-ink-faint">Folders are tags. Add one with + or by typing in any task.</p>
            )}
          </Section>
        </nav>
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
        style={{ background: `hsl(${person.hue},65%,86%)`, color: `hsl(${person.hue},38%,32%)` }}
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

type Zone = 'before' | 'into' | 'after'
const zoneAt = (el: Element, y: number): Zone => {
  const r = el.getBoundingClientRect()
  const f = (y - r.top) / r.height
  return f < 0.27 ? 'before' : f > 0.73 ? 'after' : 'into'
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
  const { over, active: dragging, props: dropProps } = useDropTarget(`folder:${folder.id}`)
  const dragPayload = useDnd((s) => s.drag?.payload)
  const isSelfDrag = dragPayload?.type === 'folder' && dragPayload.id === folder.id
  // where a dragged folder would land relative to this row
  const zone = useDnd((s): Zone | null =>
    s.over === `folder:${folder.id}` && s.drag?.payload.type === 'folder' && s.drag.payload.id !== folder.id && rowRef.current
      ? zoneAt(rowRef.current, s.drag.y)
      : null,
  )

  const onPointerDown = usePointerDrag({
    payload: { type: 'folder', id: folder.id },
    label: folder.name,
    touchNeedsHandle: true,
    onEnd: ({ target, y }) => {
      if (!target) return
      if (target === 'froot') return moveFolder(folder.id, null)
      if (!target.startsWith('folder:')) return
      const tid = target.slice(7)
      const el = document.querySelector(`[data-drop="${target}"]`)
      const t = folders.find((f) => f.id === tid)
      if (!el || !t || tid === folder.id) return
      const z = zoneAt(el, y)
      if (z === 'into') moveFolder(folder.id, tid)
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
      <div
        ref={rowRef}
        {...dropProps}
        onPointerDown={(e) => editing !== folder.id && onPointerDown(e)}
        onClick={() => setScope({ type: 'folder', id: folder.id })}
        onDoubleClick={() => setEditing(folder.id)}
        className={`${rowBase} cursor-pointer ${active ? 'bg-white/70 font-medium text-lilac-700 shadow-sm' : 'hover:bg-white/45'} ${
          over && !isSelfDrag && zone !== 'before' && zone !== 'after' ? 'scale-[1.02] bg-lilac-200/80 ring-2 ring-lilac-400/60' : ''
        } ${isSelfDrag ? 'opacity-40' : ''} ${dragging && !over ? 'ring-1 ring-lilac-300/40' : ''}`}
        style={{ paddingLeft: `${0.6 + depth * 0.95}rem` }}
      >
        {zone === 'before' && <span className="pointer-events-none absolute inset-x-2 -top-px h-[3px] rounded-full bg-lilac-500 shadow-[0_0_8px_rgba(159,111,205,0.8)]" />}
        {zone === 'after' && <span className="pointer-events-none absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-lilac-500 shadow-[0_0_8px_rgba(159,111,205,0.8)]" />}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            toggle(folder.id)
          }}
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-ink-faint transition hover:bg-white/60 ${kids.length ? '' : 'invisible'}`}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          <span className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>
            <IconChevron size={14} />
          </span>
        </button>
        <span
          onPointerDown={(e) => {
            e.stopPropagation()
            if (editing !== folder.id) onPointerDown(e, true)
          }}
          className="grid h-6 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-full transition hover:scale-110 hover:bg-white/60"
          title="Drag to move or nest"
        >
          <Flower hue={folder.hue} size={18} />
        </span>
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
            className="min-w-0 flex-1 rounded-md bg-white/80 px-1.5 py-0.5 outline-none ring-1 ring-lilac-300"
          />
        ) : (
          <span className="truncate">{folder.name}</span>
        )}
        <Count n={count(folder.id)} />
        {editing !== folder.id && (
          <span className="absolute right-1.5 flex items-center gap-0.5 rounded-lg bg-white/80 px-0.5 opacity-0 shadow-sm transition group-hover:opacity-100">
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
      {isOpen && kids.map((k) => <FolderNode key={k.id} {...props} folder={k} depth={depth + 1} />)}
    </div>
  )
}
