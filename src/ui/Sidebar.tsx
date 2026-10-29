import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { addDays, diffDays, ordinalSuffix, today, weekdayName } from '../core/dates'
import { childrenOf, descendantIds } from '../core/folders'
import { MAX_FAVORITES } from '../core/people'
import { taskOnDate } from '../core/recurrence'
import type { ViewId } from '../core/types'
import { useStore } from '../state/store'
import { useDnd, useDropTarget } from './dnd'
import { Logo } from './Decor'
import { openPerson } from './PeopleDialogs'
import { useIsMobile } from './useMedia'
import { ScrollFade } from './ScrollFade'
import { useFlip } from './flip'
import { SPRING } from './lift'
import { AccountRow } from './Account'
import { Tip } from './Tip'
import { IconAll, IconBoard, IconCalendar, IconInbox, IconBook, IconList, IconPlus, IconPond, IconPriority, IconTimeline } from './icons'

import { Gap, rowBase } from './sidebar/parts'
import { ScopeRow, Section, weekMonths } from './sidebar/Section'
import { PersonRow } from './sidebar/PersonRow'
import { useFolderSlot } from './sidebar/folderSlot'
import { FolderNode } from './sidebar/FolderNode'

export const VIEWS: { id: ViewId; label: string; hint: string; icon: typeof IconPond }[] = [
  { id: 'pond', label: 'Pond', hint: 'Freeform', icon: IconPond },
  { id: 'list', label: 'List', hint: 'Sortable', icon: IconList },
  { id: 'board', label: 'Progress', hint: 'Stages', icon: IconBoard },
  { id: 'priority', label: 'Priority', hint: 'Eisenhower', icon: IconPriority },
  { id: 'calendar', label: 'Calendar', hint: 'Schedule', icon: IconCalendar },
  { id: 'timeline', label: 'Timeline', hint: 'Gantt', icon: IconTimeline },
]


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

