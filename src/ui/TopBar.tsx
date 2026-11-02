import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { dayLabel, weekdayName } from '../core/dates'
import { formatDate } from '../core/locale'
import { pathOf } from '../core/folders'
import type { PondGroup, Scope } from '../core/types'
import { useStore } from '../state/store'
import { IconCalendar, IconClose, IconDrift, IconFolder, IconList, IconMenu, IconPerson, IconPlus, IconSearch, IconUndo } from './icons'
import { undo, useHistory } from '../state/history'
import { useSearchMatcher, useVisibleTasks } from './useVisible'
import { VIEWS } from './Sidebar'
import { SegmentedToggle } from './SegmentedToggle'
import { Tip } from './Tip'
import { useLandscapePhone } from './useMedia'

const GROUPS: { id: PondGroup; label: string; icon: React.ReactNode }[] = [
  { id: 'free', label: 'Free', icon: <IconDrift size={12} /> },
  { id: 'folder', label: 'Group', icon: <IconFolder size={12} /> },
  { id: 'due', label: 'Date', icon: <IconCalendar size={12} /> },
  { id: 'kind', label: 'Type', icon: <IconList size={12} /> },
  { id: 'person', label: 'People', icon: <IconPerson size={12} /> },
]

const btn = (on: boolean) =>
  `grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${on ? 'glass-soft bg-white text-lilac-700 shadow-sm' : 'glass-soft text-ink-soft hover:bg-white/70'}`

function UndoRedo() {
  const { undoLabel } = useHistory()
  const off = 'pointer-events-none opacity-35'
  return (
    <>
      <Tip label={undoLabel ? `Undo: ${undoLabel}` : 'Nothing to undo'}>
        <button onClick={undo} aria-label="Undo" aria-disabled={!undoLabel} className={`${btn(false)} ${undoLabel ? '' : off}`}>
          <IconUndo />
        </button>
      </Tip>
    </>
  )
}

/**
 * The filter as a path (Everything › School › English 101): the steps above are purple links, the level you are at is a purple
 * pill, and when you go up a level the pill slides back along the path to it (the way the highlight in the toggles glides).
 */
function FilterPath({ items, vertical = false }: { items: { key: string; label: string; go?: () => void }[]; vertical?: boolean }) {
  const box = useRef<HTMLSpanElement>(null)
  const refs = useRef(new Map<string, HTMLElement>())
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null)
  const settled = useRef(false)
  const active = items[items.length - 1].key
  const sig = items.map((i) => i.key + i.label).join('|')
  useLayoutEffect(() => {
    if (vertical) return
    const measure = () => {
      const el = refs.current.get(active)
      const b = box.current
      if (!el || !b) return
      const r = el.getBoundingClientRect()
      const br = b.getBoundingClientRect()
      setPill((p) => (p && Math.abs(p.x - (r.left - br.left)) < 0.5 && Math.abs(p.w - r.width) < 0.5 ? p : { x: r.left - br.left, w: r.width }))
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' && box.current ? new ResizeObserver(measure) : null
    if (ro && box.current) ro.observe(box.current)
    return () => ro?.disconnect()
  }, [active, sig, vertical])
  useEffect(() => {
    // no glide on the very first placement
    const id = requestAnimationFrame(() => (settled.current = true))
    return () => cancelAnimationFrame(id)
  }, [])
  const pad = vertical ? 'px-0.5 py-1.5' : 'px-2.5 py-0.5'
  return (
    <span ref={box} className="relative inline-flex items-center align-middle">
      {!vertical && pill && (
        <span
          aria-hidden
          className="absolute inset-y-0 rounded-full bg-lilac-500 shadow shadow-lilac-500/30"
          style={{ left: pill.x, width: pill.w, transition: settled.current ? 'left 0.34s cubic-bezier(0.34, 1.35, 0.55, 1), width 0.34s cubic-bezier(0.34, 1.35, 0.55, 1)' : 'none' }}
        />
      )}
      {items.map((it, i) => {
        const last = i === items.length - 1
        return (
          <Fragment key={it.key}>
            {i > 0 && (
              <span className="relative text-ink-faint" aria-hidden>
                ›
              </span>
            )}
            {last ? (
              <span ref={(el) => void (el ? refs.current.set(it.key, el) : refs.current.delete(it.key))} aria-current="true" className={`relative rounded-full font-medium text-white ${pad} ${vertical ? 'bg-lilac-500' : ''}`}>
                {it.label}
              </span>
            ) : (
              <button
                ref={(el) => void (el ? refs.current.set(it.key, el) : refs.current.delete(it.key))}
                onClick={it.go}
                title={i === 0 ? 'Clear all filters' : `Back to ${it.label}`}
                className={`relative rounded-full text-lilac-600 transition hover:text-lilac-700 hover:underline ${pad}`}
              >
                {it.label}
              </button>
            )}
          </Fragment>
        )
      })}
    </span>
  )
}

export function TopBar({ onNew }: { onNew: () => void }) {
  const scope = useStore((s) => s.scope)
  const folders = useStore((s) => s.folders)
  const people = useStore((s) => s.people)
  const view = useStore((s) => s.view)
  const pondGroup = useStore((s) => s.settings.pondGroup)
  const set = useStore((s) => s.setSetting)
  const setSidebar = useStore((s) => s.setSidebar)
  const land = useLandscapePhone()
  const setScope = useStore((s) => s.setScope)
  const query = useStore((s) => s.search)
  const setSearch = useStore((s) => s.setSearch)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const searchShown = scope.type !== 'contacts' && (searchOpen || !!query)
  const inScope = useVisibleTasks(false, 'keep')
  const matcher = useSearchMatcher()
  const matchCount = matcher ? inScope.filter(matcher).length : inScope.length
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])
  useEffect(() => {
    // "/" opens the search from anywhere
    const open = () => setSearchOpen(true)
    window.addEventListener('lilac:search', open)
    return () => window.removeEventListener('lilac:search', open)
  }, [])

  const title =
    scope.type === 'multi'
      ? 'Several filters'
      : scope.type === 'all'
      ? 'Everything'
      : scope.type === 'inbox'
        ? 'Unsorted'
        : scope.type === 'day'
          ? weekdayName(scope.date)
          : scope.type === 'contacts'
            ? 'Address book'
            : scope.type === 'person'
              ? (people.find((p) => p.id === scope.id)?.name ?? 'Person')
              : (pathOf(folders, scope.id).at(-1)?.name ?? 'Group')
  const sub = scope.type === 'contacts' ? `${people.length} ${people.length === 1 ? 'person' : 'people'} · ${people.filter((p) => p.favorite).length} in your sidebar` : scope.type === 'day' ? (dayLabel(scope.date) === weekdayName(scope.date) ? formatDate(scope.date) : dayLabel(scope.date)) : ''

  const searchField = (cls: string) =>
    searchShown && (
      <div className={cls}>
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
          <IconSearch size={15} />
        </span>
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSearch('')
              setSearchOpen(false)
            }
            // the keyboard's Search key: results are already live, so keep what was typed and put the keyboard away
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
          aria-label="Search"
          enterKeyHint="search"
          className={`well h-9 w-full rounded-full pl-9 text-sm ${query.trim() ? 'pr-16' : 'pr-9'}`}
        />
        {/* the hint is drawn here rather than as a placeholder, so one too long for the box can fade out toward the clear button */}
        {!query && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-9 right-9 flex items-center overflow-hidden whitespace-nowrap text-sm text-ink-faint"
            style={{ maskImage: 'linear-gradient(to right, #000 calc(100% - 1.8rem), transparent)', WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 1.8rem), transparent)' }}
          >
            Search everything…
          </span>
        )}
        <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {query.trim() && <span className="text-xs tabular-nums text-ink-soft">{matchCount}</span>}
          <button
            onClick={() => {
              setSearch('')
              setSearchOpen(false)
            }}
            aria-label="Clear search"
            className="grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:bg-white/70 hover:text-ink"
          >
            <IconClose size={12} />
          </button>
        </span>
      </div>
    )

  const gather = (cls: string) =>
    view === 'pond' &&
    scope.type !== 'contacts' && (
      <div className={cls} role="group" aria-label="Arrange the pond">
        <SegmentedToggle label="Gather by" options={GROUPS} fill value={pondGroup} onChange={(v) => set('pondGroup', v)} />
      </div>
    )

  // on a phone, in either orientation, the add button is just a plus in a circle
  const newBtn = (
    <Tip label="New task">
      <button
        onClick={onNew}
        aria-label="New task"
        className={`order-5 flex h-9 items-center justify-center rounded-full bg-lilac-500 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600 ${land ? 'w-9' : 'w-9 md:w-auto md:gap-1.5 md:px-4'}`}
      >
        <IconPlus size={16} />
        {!land && <span className="hidden md:inline">New</span>}
      </button>
    </Tip>
  )
  const tools = (
    <>
      {scope.type !== 'contacts' && (
        <Tip label="Search">
          <button onClick={() => setSearchOpen((o) => !o)} aria-pressed={searchShown} className={btn(searchShown)}>
            <IconSearch />
          </button>
        </Tip>
      )}
      <UndoRedo />
    </>
  )
  const nameOf = (p: Scope) =>
    p.type === 'folder' ? pathOf(folders, p.id).map((f) => f.name).join(' › ') : p.type === 'person' ? (people.find((x) => x.id === p.id)?.name ?? 'Person') : p.type === 'day' ? weekdayName(p.date) : p.type === 'inbox' ? 'Unsorted' : ''
  const toggleFilter = useStore((s) => s.toggleFilter)
  const first = (
    <button
      onClick={() => setScope({ type: 'all' })}
      title="Clear all filters"
      className="text-lilac-600 transition hover:text-lilac-700 hover:underline"
    >
      Everything
    </button>
  )
  const sep = (
    <span className="mx-1.5 text-ink-faint" aria-hidden>
      ›
    </span>
  )
  // the filter, as a path from Everything: one filter reads as a breadcrumb, several as chips that can each be taken off
  const filterLine =
    scope.type === 'contacts' ? (
      sub
    ) : (
      <>
        <span className="font-display font-bold text-lilac-700">Filter:</span>{' '}
        {scope.type === 'all' ? (
          <FilterPath vertical={land} items={[{ key: 'all', label: 'Everything' }]} />
        ) : scope.type === 'multi' ? (
          <>
            {first}
            {sep}
            {scope.parts.map((p, i) => (
              <span key={i} className="mr-1 inline-flex items-center gap-0.5 rounded-full bg-lilac-100/80 py-px pl-2 pr-0.5 text-lilac-700 [writing-mode:inherit]">
                {nameOf(p)}
                <button onClick={() => toggleFilter(p)} aria-label={`Remove filter ${nameOf(p)}`} title="Remove" className="grid h-4 w-4 place-items-center rounded-full text-lilac-500 hover:bg-white/80 hover:text-lilac-700">
                  <IconClose size={9} />
                </button>
              </span>
            ))}
          </>
        ) : (
          <>
            <FilterPath
              vertical={land}
              items={[
                { key: 'all', label: 'Everything', go: () => setScope({ type: 'all' }) },
                ...(scope.type === 'folder'
                  ? pathOf(folders, scope.id).map((f) => ({ key: f.id, label: f.name, go: () => setScope({ type: 'folder', id: f.id }) }))
                  : [{ key: 'cur', label: title }]),
              ]}
            />
            {sub ? ` · ${sub}` : ''}
          </>
        )}
      </>
    )
  const heading = scope.type === 'contacts' ? 'Address book' : VIEWS.find((v) => v.id === view)?.label

  // turned sideways: the title and the buttons run down the right-hand side, and the content takes the full height
  if (land) {
    return (
      <>
        {(searchShown || (view === 'pond' && scope.type !== 'contacts')) && (
          <div className="flex shrink-0 items-center gap-2 py-2 pl-3" style={{ paddingRight: 'calc(var(--rail) + 0.5rem)' }}>
            {gather('no-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto')}
            {searchField('relative ml-auto w-56 shrink-0')}
          </div>
        )}
        <header className="pointer-events-none absolute inset-y-0 right-0 z-20 flex flex-col items-center" // the bottom button lines up with the zoom buttons in the pond (the content's bottom margin, plus the pond's own 0.75rem)
          style={{ width: 'var(--rail)', paddingTop: '2.75rem', paddingBottom: 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 0.75rem)' }}>
          {/* turned clockwise, like the title on a book's spine; started well down so the curve of the screen's corner never clips it */}
          {/* two lines, like the title and its filter line above the content when upright, turned the same way: the title, then the filter to its left */}
          <div className="pointer-events-auto flex min-h-0 max-h-[70%] flex-col" style={{ writingMode: 'vertical-rl' }}>
            <h2 className="truncate font-display text-xl leading-tight">{heading}</h2>
            <p className="mt-0.5 min-h-0 truncate font-sans text-[0.7rem] font-normal leading-tight text-ink-soft" style={{ marginInlineEnd: '0.1rem' }}>
              {filterLine}
            </p>
          </div>
          <div className="pointer-events-auto mt-auto flex flex-col items-center gap-2">
            {tools}
            {scope.type !== 'contacts' && newBtn}
          </div>
        </header>
      </>
    )
  }

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-1 pt-4 md:px-6 md:pt-5" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
      {/* a phone turned sideways keeps the menu beside the content: this brings it back once it has been folded away */}
      {!land && (
        <button aria-label="Menu" onClick={() => setSidebar(true)} className="glass-soft order-1 grid h-9 w-9 place-items-center rounded-full md:hidden">
          <IconMenu />
        </button>
      )}
      <h2 className="order-2 min-w-0 flex-1 truncate font-display text-2xl leading-9 md:text-3xl md:leading-9">{heading}</h2>
      {/* its own full-width line under the title row, so a long list of groups has room to wrap */}
      <p className="order-6 -mt-1 basis-full text-xs leading-snug text-ink-soft">{filterLine}</p>
      {searchField('relative order-7 basis-full md:order-3 md:basis-64')}
      <div className="order-4 flex items-center gap-1.5">{tools}</div>
      {/* the address book has its own add button for people, so a second "add" here would only confuse */}
      {scope.type !== 'contacts' && newBtn}

      {gather('no-scrollbar order-8 -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1.5 overflow-x-auto py-1')}
    </header>
  )
}

