import { Fragment, useEffect, useRef, useState } from 'react'
import { dayLabel, weekdayName } from '../core/dates'
import { formatDate } from '../core/locale'
import { pathOf } from '../core/folders'
import type { Folder, PondGroup } from '../core/types'
import { useStore } from '../state/store'
import { IconCalendar, IconClose, IconDrift, IconFolder, IconList, IconMenu, IconPerson, IconPlus, IconSearch, IconUndo } from './icons'
import { undo, useHistory } from '../state/history'
import { useSearchMatcher, useVisibleTasks } from './useVisible'
import { VIEWS } from './Sidebar'
import { SegmentedToggle } from './SegmentedToggle'
import { Tip } from './Tip'

const GROUPS: { id: PondGroup; label: string; icon: React.ReactNode }[] = [
  { id: 'free', label: 'Free', icon: <IconDrift size={14} /> },
  { id: 'folder', label: 'Group', icon: <IconFolder size={14} /> },
  { id: 'due', label: 'Date', icon: <IconCalendar size={14} /> },
  { id: 'kind', label: 'Type', icon: <IconList size={14} /> },
  { id: 'person', label: 'Person', icon: <IconPerson size={14} /> },
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

/** School › English 101: the folders above are links (lighter, italic, underlined) that move up a level. */
function Crumbs({ path, go }: { path: Folder[]; go: (id: string) => void; small?: boolean }) {
  return (
    <>
      {path.map((f, i) =>
        i < path.length - 1 ? (
          <Fragment key={f.id}>
            <button
              onClick={() => go(f.id)}
              className="italic underline decoration-ink-faint/70 decoration-1 underline-offset-2 transition hover:text-lilac-700 hover:decoration-lilac-500"
            >
              {f.name}
            </button>
            <span className="mx-1.5 text-ink-faint" aria-hidden>
              ›
            </span>
          </Fragment>
        ) : (
          <span key={f.id}>{f.name}</span>
        ),
      )}
    </>
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
    scope.type === 'all'
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

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-1 pt-4 md:px-6 md:pt-5" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
      <button aria-label="Menu" onClick={() => setSidebar(true)} className="glass-soft order-1 grid h-9 w-9 place-items-center rounded-full md:hidden">
        <IconMenu />
      </button>
      <h2 className="order-2 min-w-0 flex-1 truncate font-display text-2xl leading-9 md:text-3xl md:leading-9">{scope.type === 'contacts' ? 'Address book' : VIEWS.find((v) => v.id === view)?.label}</h2>
      {/* its own full-width line under the title row, so a long list of groups has room to wrap */}
      <p className="order-6 -mt-1 basis-full text-xs leading-snug text-ink-soft">
        {scope.type === 'contacts' ? (
          sub
        ) : (
          <>
            {scope.type === 'folder' ? <Crumbs path={pathOf(folders, scope.id)} go={(id) => setScope({ type: 'folder', id })} small /> : title}
            {sub ? ` · ${sub}` : ''}
          </>
        )}
      </p>
      {searchShown && (
        <div className="relative order-7 basis-full md:order-3 md:basis-64">
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
            placeholder="Search everything…"
            aria-label="Search"
            enterKeyHint="search"
            className="well h-9 w-full rounded-full pl-9 pr-16 text-sm placeholder:text-ink-faint"
          />
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
      )}
      <div className="order-4 flex items-center gap-1.5">
        {scope.type !== 'contacts' && (
          <Tip label="Search">
            <button onClick={() => setSearchOpen((o) => !o)} aria-pressed={searchShown} className={btn(searchShown)}>
              <IconSearch />
            </button>
          </Tip>
        )}
        <UndoRedo />
      </div>
      <Tip label="New task">
        <button
          onClick={onNew}
          className="order-5 flex h-9 items-center gap-1.5 rounded-full bg-lilac-500 px-4 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600"
        >
          <IconPlus size={16} /> <span className="hidden sm:inline">New</span>
        </button>
      </Tip>

      {view === 'pond' && scope.type !== 'contacts' && (
        <div className="no-scrollbar order-8 -mx-1 flex basis-full items-center gap-1.5 overflow-x-auto px-1 py-1" role="group" aria-label="Arrange the pond">
          <span className="hidden shrink-0 pr-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-faint sm:inline">Gather by</span>
          <SegmentedToggle label="Gather by" options={GROUPS} fill value={pondGroup} onChange={(v) => set('pondGroup', v)} />
        </div>
      )}
    </header>
  )
}

