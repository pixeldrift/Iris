import { useRef, useState } from 'react'
import { dayLabel, shortDate } from '../core/dates'
import { pathOf } from '../core/folders'
import type { PondGroup } from '../core/types'
import { unlock } from '../audio/engine'
import { useStore, type Settings } from '../state/store'
import { IconDrift, IconEye, IconMenu, IconPlus, IconSize, IconSound, IconSoundOff } from './icons'
import { MenuItem, Popover } from './Popover'
import { VIEWS } from './Sidebar'
import { Tip } from './Tip'

const GROUPS: { id: PondGroup; label: string }[] = [
  { id: 'free', label: 'Free' },
  { id: 'folder', label: 'Folders' },
  { id: 'due', label: 'When' },
  { id: 'weight', label: 'Weight' },
  { id: 'kind', label: 'Kind' },
  { id: 'person', label: 'People' },
  { id: 'stage', label: 'Stage' },
]

const btn = (on: boolean) =>
  `grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${on ? 'bg-lilac-500/90 text-white shadow-md shadow-lilac-500/30' : 'glass-soft text-ink-soft hover:bg-white/70'}`

function Toggle({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <Tip label={label}>
      <button onClick={onClick} aria-pressed={on} className={btn(on)}>
        {children}
      </button>
    </Tip>
  )
}

/** Tap = sound on/off. Hold (or right-click) = every individual sound option. */
function SoundButton() {
  const s = useStore((st) => st.settings)
  const set = useStore((st) => st.setSetting)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const timer = useRef(0)
  const held = useRef(false)

  const options: { key: 'sfxDrops' | 'sfxChimes' | 'sfxPops' | 'ambient'; label: string; hint: string }[] = [
    { key: 'sfxDrops', label: 'Water drops', hint: 'when you add' },
    { key: 'sfxChimes', label: 'Chimes & blooms', hint: 'finish, tag, move' },
    { key: 'sfxPops', label: 'Bubble pops', hint: 'when you delete' },
    { key: 'ambient', label: 'Ambient wind chimes', hint: 'always on' },
  ]

  return (
    <>
      <span ref={ref} className="contents">
        <Tip label={s.sound ? 'Sound on · tap to mute · hold for options' : 'Sound off · tap to unmute · hold for options'}>
          <button
            aria-pressed={s.sound}
            className={btn(s.sound)}
            onPointerDown={() => {
              held.current = false
              window.clearTimeout(timer.current)
              timer.current = window.setTimeout(() => {
                held.current = true
                setOpen(true)
              }, 450)
            }}
            onPointerUp={() => window.clearTimeout(timer.current)}
            onPointerLeave={() => window.clearTimeout(timer.current)}
            onPointerCancel={() => window.clearTimeout(timer.current)}
            onContextMenu={(e) => {
              e.preventDefault()
              setOpen(true)
            }}
            onClick={() => {
              if (held.current) return
              unlock()
              set('sound', !s.sound)
            }}
          >
            {s.sound ? <IconSound /> : <IconSoundOff />}
          </button>
        </Tip>
      </span>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} align="end" className="w-64">
        <div className="px-3 pb-1 pt-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">Sound</div>
        <MenuItem
          onClick={() => {
            unlock()
            set('sound', !s.sound)
          }}
          trailing={<Switch on={s.sound} />}
        >
          All sound
        </MenuItem>
        {options.map((o) => (
          <MenuItem
            key={o.key}
            onClick={() => {
              unlock()
              set(o.key, !s[o.key])
            }}
            trailing={<Switch on={s[o.key] && s.sound} />}
          >
            <span className={s.sound ? '' : 'opacity-50'}>
              {o.label}
              <span className="block text-[0.68rem] font-normal text-ink-faint">{o.hint}</span>
            </span>
          </MenuItem>
        ))}
        <div className="px-3 pb-2 pt-1">
          <input type="range" min={0.1} max={1} step={0.05} value={s.volume} onChange={(e) => set('volume', Number(e.target.value))} className="soft" aria-label="Volume" />
        </div>
      </Popover>
    </>
  )
}

function Switch({ on }: { on: boolean }) {
  return (
    <span className={`relative h-5 w-9 rounded-full transition ${on ? 'bg-lilac-500' : 'bg-ink-faint/40'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[1.1rem]' : 'left-0.5'}`} />
    </span>
  )
}

export function TopBar({ onNew }: { onNew: () => void }) {
  const scope = useStore((s) => s.scope)
  const folders = useStore((s) => s.folders)
  const people = useStore((s) => s.people)
  const view = useStore((s) => s.view)
  const settings = useStore((s) => s.settings)
  const set = useStore((s) => s.setSetting)
  const setSidebar = useStore((s) => s.setSidebar)

  const title =
    scope.type === 'all'
      ? 'Everything'
      : scope.type === 'inbox'
        ? 'Inbox'
        : scope.type === 'day'
          ? dayLabel(scope.date)
          : scope.type === 'person'
            ? (people.find((p) => p.id === scope.id)?.name ?? 'Person')
            : pathOf(folders, scope.id).map((f) => f.name).join(' › ') || 'Folder'
  const sub = scope.type === 'day' ? shortDate(scope.date) : VIEWS.find((v) => v.id === view)?.hint
  const flip = <K extends keyof Settings>(k: K) => set(k, !settings[k] as Settings[K])

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-1 pt-4 md:px-6 md:pt-5" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
      <Tip label="Menu">
        <button onClick={() => setSidebar(true)} className="glass-soft grid h-9 w-9 place-items-center rounded-full md:hidden">
          <IconMenu />
        </button>
      </Tip>
      <div className="order-1 min-w-0 flex-1">
        <h2 className="truncate font-display text-2xl leading-tight md:text-3xl">{title}</h2>
        <p className="text-xs text-ink-soft">
          {VIEWS.find((v) => v.id === view)?.label}
          {sub ? ` · ${sub}` : ''}
        </p>
      </div>
      <div className="order-3 flex basis-full items-center justify-end gap-1.5 sm:order-2 sm:basis-auto">
        {view === 'pond' && (
          <>
            <Toggle on={settings.magnet} onClick={() => flip('magnet')} label="Related bubbles drift together">
              <MagnetIcon />
            </Toggle>
            <Toggle on={settings.sizeByPriority} onClick={() => flip('sizeByPriority')} label="Bigger when more important">
              <IconSize />
            </Toggle>
            <Toggle on={settings.drift} onClick={() => flip('drift')} label="Gentle drifting">
              <IconDrift />
            </Toggle>
          </>
        )}
        <Toggle on={settings.showDone} onClick={() => flip('showDone')} label="Show bloomed (done) tasks">
          <IconEye />
        </Toggle>
        <SoundButton />
      </div>
      <Tip label="New task">
        <button
          onClick={onNew}
          className="order-2 flex h-9 items-center gap-1.5 rounded-full bg-lilac-500 px-4 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600 sm:order-3"
        >
          <IconPlus size={16} /> <span className="hidden sm:inline">New</span>
        </button>
      </Tip>

      {view === 'pond' && (
        <div className="scroll-soft order-4 -mx-1 flex basis-full items-center gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Arrange the pond">
          <span className="shrink-0 pr-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">Gather by</span>
          {GROUPS.map((g) => (
            <button
              key={g.id}
              onClick={() => set('pondGroup', g.id)}
              aria-pressed={settings.pondGroup === g.id}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${
                settings.pondGroup === g.id ? 'bg-lilac-500 text-white shadow-md shadow-lilac-500/30' : 'glass-soft text-ink-soft hover:bg-white/70'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}
    </header>
  )
}

function MagnetIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="12" r="3" />
      <path d="M9.5 12h5" strokeDasharray="1.5 2" />
    </svg>
  )
}
