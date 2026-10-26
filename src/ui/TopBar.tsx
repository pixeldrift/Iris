import { pathOf } from '../core/folders'
import { dayLabel, shortDate } from '../core/dates'
import { useStore, type Settings } from '../state/store'
import { unlock } from '../audio/engine'
import { IconDrift, IconEye, IconMenu, IconPlus, IconSize, IconSound, IconSoundOff, IconWind } from './icons'
import { VIEWS } from './Sidebar'

function Toggle({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={`grid h-9 w-9 place-items-center rounded-full transition ${
        on ? 'bg-lilac-500/90 text-white shadow-md shadow-lilac-500/30' : 'glass-soft text-ink-soft hover:bg-white/70'
      }`}
    >
      {children}
    </button>
  )
}

export function TopBar({ onNew }: { onNew: () => void }) {
  const scope = useStore((s) => s.scope)
  const folders = useStore((s) => s.folders)
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
          : pathOf(folders, scope.id).map((f) => f.name).join(' › ') || 'Folder'
  const sub = scope.type === 'day' ? shortDate(scope.date) : VIEWS.find((v) => v.id === view)?.hint
  const flip = <K extends keyof Settings>(k: K) => set(k, !settings[k] as Settings[K])

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-1 pt-4 md:px-6 md:pt-5" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
      <button onClick={() => setSidebar(true)} className="glass-soft grid h-9 w-9 place-items-center rounded-full md:hidden" aria-label="Open menu">
        <IconMenu />
      </button>
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
        <Toggle
          on={settings.sound}
          onClick={() => {
            unlock()
            flip('sound')
          }}
          label="Water & chime sounds"
        >
          {settings.sound ? <IconSound /> : <IconSoundOff />}
        </Toggle>
        <Toggle
          on={settings.ambient}
          onClick={() => {
            unlock()
            flip('ambient')
          }}
          label="Ambient wind chimes"
        >
          <IconWind />
        </Toggle>
      </div>
      <button
          onClick={onNew}
          className="order-2 flex h-9 sm:order-3 items-center gap-1.5 rounded-full bg-lilac-500 px-4 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600"
        >
          <IconPlus size={16} /> <span className="hidden sm:inline">New</span>
      </button>
    </header>
  )
}
