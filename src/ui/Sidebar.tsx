import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { addDays, dayHint, ordinalSuffix, today, weekdayName } from '../core/dates'
import { childrenOf, descendantIds } from '../core/folders'
import { MAX_FAVORITES } from '../core/people'
import { hasPart, pickOnly } from '../core/scope'
import { taskOnDate } from '../core/recurrence'
import { useStore } from '../state/store'
import { useDnd, useDropTarget } from './dnd'
import { Logo } from './Decor'
import { openPerson } from './PeopleDialogs'
import { useIsMobile, useLandscapePhone } from './useMedia'
import { ScrollFade } from './ScrollFade'
import { useFlip } from './flip'
import { SPRING } from './lift'
import { AccountRow } from './Account'
import { Tip } from './Tip'
import { IconAll, IconInbox, IconBook, IconPlus } from './icons'

import { orderedViews, VIEWS } from './viewList'
import { Disclosure, Gap, rowBase } from './sidebar/parts'
import { askName } from './NameDialog'
import { ScopeRow, Section, weekMonths } from './sidebar/Section'
import { CompletedSection } from './sidebar/CompletedSection'
import { PersonRow } from './sidebar/PersonRow'
import { useFolderSlot } from './sidebar/folderSlot'
import { FolderNode } from './sidebar/FolderNode'

export { VIEWS }


/**
 * How you look: the views, as a purple card of their own (white on purple), apart from the filters below it. Folded away with
 * the arrow it becomes a row of icons, the same shortcuts the sideways layout keeps when its menu is tucked in.
 */
/** The views not hidden in the settings (always at least one). */
export function useShownViews() {
  const hidden = useStore((s) => s.settings.hiddenViews)
  const order = useStore((s) => s.settings.viewOrder)
  const all = useMemo(() => orderedViews(order), [order])
  const shown = all.filter((v) => !hidden.includes(v.id))
  return shown.length ? shown : all
}

function ViewSwitcher() {
  const shown = useShownViews()
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const folded = useStore((s) => s.sidebar.collapsed.includes('views'))
  const toggle = useStore((s) => s.toggleSection)
  return (
    <section data-section-id="views" className="mt-1 rounded-2xl bg-gradient-to-b from-lilac-400 to-lilac-600 p-1.5 text-white shadow-lg shadow-lilac-500/30">
      <div className="flex items-center gap-1 px-1 pb-1">
        <button onClick={() => toggle('views')} aria-expanded={!folded} aria-label={`${folded ? 'Expand' : 'Collapse'} Views`} className="grid h-6 w-6 place-items-center rounded-full text-white/80 transition hover:bg-white/20 hover:text-white">
          <Disclosure open={!folded} size={15} />
        </button>
        <h3 className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-white/85">
          View
        </h3>
      </div>
      {folded ? (
        <div className="flex justify-between px-0.5 pb-0.5" role="group" aria-label="Views">
          {shown.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              aria-label={v.label}
              aria-pressed={view === v.id}
              title={v.label}
              className={`grid h-8 w-8 place-items-center rounded-full transition ${view === v.id ? 'bg-white text-lilac-600 shadow' : 'text-white hover:bg-white/20'}`}
            >
              <v.icon />
            </button>
          ))}
        </div>
      ) : (
        shown.map((v) => (
          <button key={v.id} onClick={() => setView(v.id)} aria-pressed={view === v.id} className={`${rowBase} ${view === v.id ? 'bg-white font-medium text-lilac-700 shadow-md' : 'text-white hover:bg-white/15'}`}>
            <v.icon />
            {v.label}
            <span className={`ml-auto text-xs ${view === v.id ? 'text-lilac-500/80' : 'text-white/70'}`}>{v.hint}</span>
          </button>
        ))
      )}
    </section>
  )
}

/** The menu's width on a desktop (px): its default, and how narrow or wide it may be dragged. */
const SIDEBAR_DEFAULT = 280
const SIDEBAR_MIN = 240
const SIDEBAR_MAX = 560

export function Sidebar() {
  const shown = useShownViews()
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  // a view that is hidden is never the one being looked at: fall back to the first one that is shown
  useEffect(() => {
    if (!shown.some((v) => v.id === view)) setView(shown[0].id)
  }, [shown, view, setView])
  const scope = useStore((s) => s.scope)
  const setScope = useStore((s) => s.setScope)
  const allTasks = useStore((s) => s.tasks)
  const tasks = useMemo(() => allTasks.filter((t) => !t.draft), [allTasks])
  const folders = useStore((s) => s.folders)
  const people = useStore((s) => s.people)
  const open = useStore((s) => s.sidebarOpen)
  const setSidebar = useStore((s) => s.setSidebar)
  const showDone = useStore((s) => s.settings.showDone)
  const setSetting = useStore((s) => s.setSetting)
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

  const newFolder = async (parentId: string | null) => {
    // on a touch screen the keyboard would cover a name edited in place: ask in a box above it instead
    if (window.matchMedia?.('(pointer: coarse)').matches) {
      const name = await askName(parentId ? 'New subgroup' : 'New group', 'Group name')
      if (!name) return
      addFolder(name, parentId)
      if (parentId) setCollapsed((c) => new Set([...c].filter((x) => x !== parentId)))
      return
    }
    const id = addFolder('New group', parentId)
    if (parentId) setCollapsed((c) => new Set([...c].filter((x) => x !== parentId)))
    setEditing(id)
  }

  const rootDrop = useDropTarget('froot')
  const topSlot = useFolderSlot((st) => (st.slot?.kind === 'slot' && st.slot.afterId === null ? st.slot : null))

  // Dragging a bubble onto the left edge pulls the drawer open under it, so it can be dropped into a folder.
  // a phone turned sideways keeps the menu beside the content, and lets it be folded away by tapping the title
  const land = useLandscapePhone()
  const navHidden = useStore((s) => s.navHidden)
  const setNavHidden = useStore((s) => s.setNavHidden)
  const mobile = useIsMobile() && !land
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
            active={hasPart(scope, { type: 'day', date: d })}
            part={{ type: 'day', date: d }}
            onClick={() => setScope(pickOnly(scope, { type: 'day', date: d }))}
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
                {dayHint(d, t0) && <i className="ml-1.5 text-[0.82em] font-normal italic text-ink-faint">({dayHint(d, t0)})</i>}
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
          active={hasPart(scope, { type: 'inbox' })}
          part={{ type: 'inbox' }}
          onClick={() => setScope(pickOnly(scope, { type: 'inbox' }))}
          dropId="inbox"
          icon={<IconInbox />}
          label="Unsorted"
          handleGap
          count={live.filter((t) => t.folderIds.length === 0).length}
        />
      </Section>
    ),
  }

  // Swipe: drag the sliver right to pull the drawer open; drag the open drawer left to push it shut.
  const asideRef = useRef<HTMLElement>(null)
  const [swipe, setSwipe] = useState<number | null>(null)
  // how open the drawer is while a finger drags it (0 = sliver, 1 = full): the contents fade in with it
  const range = Math.max(1, (asideRef.current?.offsetWidth ?? 280) - 19.2)
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
      const range = Math.max(1, (asideRef.current?.offsetWidth ?? 280) - 19.2)
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
  // On a desktop the menu can be dragged wider (to read long, nested group names in full): the width is remembered on this device.
  const [wide, setWide] = useState(() => {
    try {
      const w = Number(localStorage.getItem('lilac-sidebar-w'))
      return w >= SIDEBAR_MIN && w <= SIDEBAR_MAX ? w : SIDEBAR_DEFAULT
    } catch {
      return SIDEBAR_DEFAULT
    }
  })
  const resizable = !land && !mobile
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX
    const w0 = wide
    let w = w0
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    const move = (ev: PointerEvent) => {
      w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w0 + ev.clientX - x0))
      setWide(w)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      try {
        localStorage.setItem('lilac-sidebar-w', String(w))
      } catch {
        /* just for this visit */
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  const resetWidth = () => {
    setWide(SIDEBAR_DEFAULT)
    try {
      localStorage.removeItem('lilac-sidebar-w')
    } catch {
      /* ignore */
    }
  }
  // closed to its sliver (upright: not open; sideways: folded away)
  const folded = land ? navHidden : mobile && !open

  return (
    <>
      {open && !land && <div className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px] md:hidden" onClick={() => setSidebar(false)} />}
      <aside
        ref={asideRef}
        className={
          land
            ? 'glass relative z-10 flex shrink-0 flex-col overflow-hidden rounded-r-3xl border-l-0'
            : `glass fixed inset-y-0 left-0 z-[var(--z-drawer)] flex w-[17.5rem] shrink-0 flex-col rounded-r-3xl border-l-0 transition-transform duration-300 md:static md:z-10 md:m-3 md:mr-0 md:translate-x-0 md:rounded-3xl md:border-l ${
                open ? 'translate-x-0' : sliver ? '-translate-x-[calc(100%-var(--sliver))]' : '-translate-x-full'
              } ${swipe !== null ? '!transition-none' : ''}`
        }
        style={
          land
            ? {
                // beside the content, flush with the screen's edge (its glass may run under the notch; its words are kept clear of it).
                // Folded away it leaves a slim strip of shortcuts (kept clear of the notch), the sliver of the sideways layout.
                width: navHidden ? 'calc(var(--safe-l) + 2.4rem)' : 'calc(16rem + var(--safe-l))',
                paddingLeft: navHidden ? 0 : 'var(--safe-l)',
                transition: `width 0.3s ${SPRING}`,
              }
            : {
                paddingTop: 'env(safe-area-inset-top)',
                transitionTimingFunction: SPRING,
                ...(resizable ? { width: wide } : {}),
                ...(swipe !== null ? { translate: open ? `${swipe}px 0` : `calc(-100% + var(--sliver) + ${swipe}px) 0` } : {}),
                ...(mobile ? { touchAction: 'pan-y' } : {}),
              }
        }
        {...(open ? swipeProps : {})}
      >
        {resizable && (
          // drag the right edge to set the width; double-click puts it back
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Menu width: drag to resize, double-click to reset"
            title="Drag to resize · double-click to reset"
            onPointerDown={startResize}
            onDoubleClick={resetWidth}
            className="group/resize absolute inset-y-6 -right-2 z-20 hidden w-4 cursor-col-resize touch-none md:block"
          >
            <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-lilac-400/0 transition group-hover/resize:bg-lilac-400/60" />
          </div>
        )}
        {/* On a phone a plain sliver of glass stays beside the pond (nothing of the menu shows through):
            tap it, or drag an item onto it, to open the drawer. */}
        {!land && sliver && !open && (
          // the whole visible edge is one real button, so a tap anywhere along it works like the hamburger
          <button
            type="button"
            onClick={() => !justSwiped.current && setSidebar(true)}
            aria-label="Open menu"
            style={{ touchAction: 'pan-y' }}
            className="absolute inset-y-0 right-0 z-10 w-[var(--sliver)] cursor-pointer rounded-r-3xl"
            {...swipeProps}
          >
            {/* a tiny grab handle in the middle: the dots of the usual handle, all six in one column, pressed into the surface */}
            <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-[3px]">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span key={i} className="emboss-dot" />
              ))}
            </span>
          </button>
        )}
        {/* sideways and folded away: a strip of shortcuts. Tap the logo, or the blank part of the strip, to bring the menu back. */}
        {land && navHidden && (
          <div
            className="no-scrollbar absolute inset-0 flex cursor-pointer flex-col items-center overflow-y-auto py-3"
            style={{ paddingLeft: 'var(--safe-l)' }}
            onClick={() => setNavHidden(false)}
          >
            {/* everything sits in the middle of the strip's height (and the strip scrolls if the screen is too short) */}
            <div className="m-auto flex flex-col items-center gap-0.5">
            <Tip label="Show the menu"><button type="button" aria-label="Show the menu" className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition hover:bg-white/60" onClick={(e) => (e.stopPropagation(), setNavHidden(false))}>
              <Logo size={22} />
            </button></Tip>
            <span aria-hidden className="my-px h-px w-5 shrink-0 bg-ink-faint/30" />
            {/* the views are purple here too, as in the open menu: white icons, the current one a white disc */}
            <div className="flex shrink-0 flex-col items-center gap-0.5 rounded-full bg-gradient-to-b from-lilac-400 to-lilac-600 p-0.5 shadow-md shadow-lilac-500/30">
              {shown.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-label={v.label}
                  title={v.label}
                  aria-pressed={view === v.id}
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition ${view === v.id ? 'bg-white text-lilac-600 shadow' : 'text-white hover:bg-white/20'}`}
                  onClick={(e) => (e.stopPropagation(), setView(v.id))}
                >
                  <v.icon />
                </button>
              ))}
            </div>
            <span aria-hidden className="my-px h-px w-5 shrink-0 bg-ink-faint/30" />
            <Tip label="Everything"><button
              type="button"
              aria-label="Everything"
              aria-pressed={scope.type === 'all'}
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-lilac-500 transition hover:bg-white/60 ${scope.type === 'all' ? 'bg-white/70' : ''}`}
              onClick={(e) => (e.stopPropagation(), setScope({ type: 'all' }))}
            >
              <IconAll />
            </button></Tip>
            </div>
          </div>
        )}
        <div
          inert={folded}
          className={`flex min-h-0 flex-1 flex-col transition-opacity duration-200 ${folded ? 'opacity-0' : 'opacity-100'}`}
          style={progress !== null ? { opacity: Math.min(1, Math.max(0, progress)), transition: 'none' } : undefined}
        >
        <div className="flex items-center gap-2.5 px-[calc(0.8rem+var(--sb)*0.5rem)] pb-[calc(var(--sb)*0.25rem)] pt-[calc(0.6rem+var(--sb)*1rem)]">
          {land || mobile ? (
            <button type="button" onClick={() => (land ? setNavHidden(true) : setSidebar(false))} aria-label="Hide the menu" title="Hide the menu" className="flex items-center gap-2.5 rounded-xl transition hover:opacity-80">
              <Logo />
              <h1 className="font-display text-2xl italic tracking-tight text-lilac-700">Lilac</h1>
            </button>
          ) : (
            <>
              <Logo />
              <h1 className="font-display text-2xl italic tracking-tight text-lilac-700">Lilac</h1>
            </>
          )}
          <AccountRow />
        </div>

        <ScrollFade className="rounded-b-3xl">
          <nav ref={navRef} className="px-[calc(0.35rem+var(--sb)*0.6rem)] pb-[calc(0.6rem+var(--sb)*1.2rem)]">
            <ViewSwitcher />
            {/* views are how you look; everything below is what you look at (the filter) */}
            <div className="mt-[calc(0.7rem+var(--sb)*0.5rem)] flex items-center justify-between px-2.5">
              <p className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">Filter</p>
              <button type="button" aria-pressed={showDone} onClick={() => setSetting('showDone', !showDone)} className={`rounded-full px-2.5 py-1 text-[0.68rem] font-medium transition ${showDone ? 'bg-lilac-100 text-lilac-700 ring-1 ring-lilac-300' : 'bg-white/55 text-ink-soft hover:bg-white/85'}`}>{showDone ? 'Hide completed' : 'Show completed'}</button>
            </div>
            <div className="mt-1">
              <ScopeRow active={scope.type === 'all'} onClick={() => setScope({ type: 'all' })} icon={<IconAll />} label="Everything" count={live.length} />
            </div>
            {order.map((id) => (
              <Fragment key={id}>{sections[id]}</Fragment>
            ))}
            <CompletedSection />
          </nav>
        </ScrollFade>
        </div>
      </aside>
    </>
  )
}

