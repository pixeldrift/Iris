import { disablePush, enablePush } from '../sync/push'
import { create } from 'zustand'
import { unlock } from '../audio/engine'
import { useStore } from '../state/store'
import type { Settings } from '../state/store'
import { Modal } from './dialogs'
import { MenuItem, Popover } from './Popover'
import { applySpace, applyTheme, BASE_HUE, setScrubbing } from './theme'
import { DATE_STYLES, deviceTimeZone } from '../core/locale'
import { accountsConfigured } from '../sync/auth'
import { openDanger } from './DangerZone'
import { SegmentedToggle } from './SegmentedToggle'
import { askNotify, notifyState } from './notify'
import { useEffect, useRef, useState } from 'react'
import { IconChevron, IconClose } from './icons'
import { DefaultDot } from './DefaultDot'
import { orderedViews, VIEWS } from './viewList'
import { GripDots } from './shared'

const useSettingsDialog = create<{ open: boolean }>(() => ({ open: false }))
export const openSettings = () => useSettingsDialog.setState({ open: true })
const close = () => useSettingsDialog.setState({ open: false })

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]

function Row({ k, label, hint, indent = false, faded = false, inline = false }: { k: BoolKey; label: string; hint?: string; indent?: boolean; faded?: boolean; inline?: boolean }) {
  const on = useStore((s) => s.settings[k])
  const set = useStore((s) => s.setSetting)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => {
        unlock()
        set(k, !on)
      }}
      className={`flex w-full items-center gap-3 rounded-xl py-1.5 pr-2 text-left transition hover:bg-white/50 ${indent ? 'pl-7' : 'pl-2'} ${faded ? 'opacity-45' : ''}`}
    >
      <span className="min-w-0 flex-1">
        <span className="text-sm">{label}</span>
        {hint && <span className={inline ? 'ml-2 text-[0.7rem] text-ink-faint' : 'block text-[0.7rem] text-ink-faint'}>{hint}</span>}
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? 'bg-lilac-500' : 'bg-ink-faint/40'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[1.1rem]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

/** Retention for finished tasks: a discrete slider with the four supported periods. */
function CompletedRetention() {
  const value = useStore((s) => s.settings.completedRetention)
  const set = useStore((s) => s.setSetting)
  const options = ['hour', 'day', 'week', 'never'] as const
  const labels = ['Hour', 'Day', 'Week', 'Never']
  return (
    <div className="px-2 py-1.5">
      <div className="text-sm">Automatically archive completed tasks</div>
      <div className="mt-1">
        <input
          type="range"
          min={0}
          max={3}
          step={1}
          value={options.indexOf(value)}
          onChange={(e) => set('completedRetention', options[Number(e.target.value)])}
          className="soft"
          aria-label="Completed task retention"
        />
        <div className="-mt-0.5 flex justify-between text-[0.68rem] text-ink-faint">
          {labels.map((label) => <span key={label}>{label}</span>)}
        </div>
      </div>
      <span className="block text-[0.68rem] text-ink-faint">After this long, checked-off tasks leave active views but remain in the Completed archive until you delete them.</span>
    </div>
  )
}

/**
 * System notifications for reminders, as a switch that can be turned off again. The browser's permission can only be granted from
 * here (not taken back), so "off" is Lilac's own choice not to send them; turning it on asks the browser first if it has not been asked.
 */
export function NotificationsRow({ compact = false }: { compact?: boolean }) {
  const [perm, setPerm] = useState(notifyState())
  const wanted = useStore((s) => s.settings.systemNotifications)
  const set = useStore((s) => s.setSetting)
  const blocked = perm === 'denied' || perm === 'unsupported'
  const on = perm === 'granted' && wanted
  const toggle = async () => {
    if (blocked) return
    if (perm === 'default') {
      const next = await askNotify()
      setPerm(next)
      if (next === 'granted') {
        set('systemNotifications', true)
        void enablePush()
      }
      return
    }
    set('systemNotifications', !wanted)
    void (wanted ? disablePush() : enablePush())
  }
  const hint = on
    ? 'Alerts arrive even when Lilac is closed'
    : perm === 'granted'
      ? 'Off: reminders only appear inside Lilac'
      : perm === 'denied'
        ? 'Blocked in this browser: allow them in its site settings'
        : perm === 'unsupported'
          ? 'Not supported here: reminders show inside the app'
          : 'Off: turn on to be reminded outside the app'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={blocked}
      onClick={toggle}
      className={`flex w-full items-center gap-3 rounded-xl py-1.5 pl-2 pr-2 text-left transition hover:bg-white/50 ${blocked ? 'opacity-60' : ''} ${compact ? 'opacity-70' : ''}`}
    >
      <span className="min-w-0 flex-1">
        <span className={`block ${compact ? 'text-xs text-ink-soft' : 'text-sm'}`}>{compact ? 'Allow notifications' : 'Push Notifications'}</span>
        <span className="block text-[0.65rem] text-ink-faint">{hint}</span>
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? 'bg-lilac-500' : 'bg-ink-faint/40'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[1.1rem]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

/** A small dot under a slider marking its default; tapping it puts the slider back there. */
/** The date style as a drop-down in the app's own look (a field that opens a small list), not the browser's. */
function DateFormatPick({ value, onChange }: { value: Settings['dateFormat']; onChange: (v: Settings['dateFormat']) => void }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={btn} type="button" aria-haspopup="listbox" aria-expanded={open} aria-label="Date format" onClick={() => setOpen((o) => !o)} className="well flex items-center gap-2 whitespace-nowrap rounded-xl px-2.5 py-1 text-left text-xs text-ink">
        <span>{DATE_STYLES.find((d) => d.id === value)?.label}</span>
        <span className="ml-auto text-ink-faint">▾</span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn} matchAnchor className="p-1">
        <div role="listbox" aria-label="Date format">
          {DATE_STYLES.map((d) => (
            <MenuItem key={d.id} active={d.id === value} onClick={() => (onChange(d.id), setOpen(false))}>
              {d.label}
            </MenuItem>
          ))}
        </div>
      </Popover>
    </>
  )
}

/** Which views show in the sidebar: folded away until wanted, so it does not take up the page. At least one always stays. */
function ViewsPicker() {
  const hidden = useStore((s) => s.settings.hiddenViews)
  const order = useStore((s) => s.settings.viewOrder)
  const set = useStore((s) => s.setSetting)
  const [open, setOpen] = useState(false)
  const all = orderedViews(order)
  const shown = all.filter((v) => !hidden.includes(v.id))
  const listRef = useRef<HTMLUListElement>(null)
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null)
  const move = <T,>(a: T[], from: number, to: number) => {
    const n = [...a]
    n.splice(to, 0, n.splice(from, 1)[0])
    return n
  }
  /** Carry a view by its handle; the rows rearrange as it passes them, and letting go keeps the order. */
  const begin = (from: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    const rows = [...(listRef.current?.children ?? [])].map((r) => (r as HTMLElement).getBoundingClientRect())
    let to = from
    const onMove = (ev: PointerEvent) => {
      const i = rows.findIndex((r) => ev.clientY < r.bottom)
      to = i < 0 ? rows.length - 1 : i
      setDrag({ from, to })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setDrag(null)
      if (to !== from) set('viewOrder', move(all, from, to).map((v) => v.id))
    }
    setDrag({ from, to })
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }
  const rows = drag ? move(all, drag.from, drag.to) : all
  return (
    <div className="px-1">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 rounded-xl px-1 py-1.5 text-left transition hover:bg-white/50">
        <span className={`text-ink-faint transition-transform ${open ? 'rotate-90' : ''}`}>
          <IconChevron size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-sm">Sidebar menu</span>
          <span className="block text-[0.7rem] text-ink-faint">{shown.length === VIEWS.length ? 'all shown' : `${shown.length} of ${VIEWS.length} shown`}: uncheck the ones you do not use, drag to reorder</span>
        </span>
      </button>
      {open && (
        <ul ref={listRef} className="mb-1 ml-6 mt-1 space-y-0.5">
          {rows.map((v) => {
            const on = !hidden.includes(v.id)
            const last = on && shown.length === 1
            const at = all.findIndex((x) => x.id === v.id)
            return (
              <li key={v.id} className={`flex items-center gap-1 rounded-lg transition ${drag && all[drag.from].id === v.id ? 'bg-white/70 shadow-md' : ''}`}>
                <label className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1 text-sm transition hover:bg-white/50 ${last ? 'opacity-60' : 'cursor-pointer'}`}>
                  <input type="checkbox" checked={on} disabled={last} onChange={() => set('hiddenViews', on ? [...hidden, v.id] : hidden.filter((x) => x !== v.id))} className="h-4 w-4 accent-[var(--color-lilac-500)]" />
                  <span className="text-lilac-600">
                    <v.icon size={16} />
                  </span>
                  {v.label}
                  <span className="text-[0.7rem] text-ink-faint">{v.hint}</span>
                </label>
                <span data-grip onPointerDown={begin(at)} role="button" aria-label={`Move ${v.label}`} title="Drag to reorder" className="grid h-7 w-6 shrink-0 cursor-grab touch-none place-items-center">
                  <GripDots />
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** The gestures that are easy to miss, folded away until wanted. */
const TIPS: { title: string; lines: string[] }[] = [
  { title: 'Everywhere', lines: ['N adds an item; / searches; Ctrl or Cmd + Z undoes.', 'Drag an item onto a group in the sidebar to tag it; drag a group onto another to nest it.', 'On a list or board, Tab to a row, then the arrow keys move between rows and Enter opens one.'] },
  { title: 'Pond', lines: ['Tap the water to add a thought; drag to pan; pinch or scroll to zoom.', 'Drag a group name to carry the whole group, or onto another group to put it inside.', 'Hold Shift (or turn on select) to pick several items.'] },
  { title: 'Spatial', lines: ['Drag a task onto a group to move it, or out into the open to leave it there, in no group. Tap empty space to add an item there.', 'Drag a group by its name or box; its subgroups come with it.', 'Hold a task over a folded group and it opens; carry it out over the sidebar to tag it.', 'The twirl beside a name folds the group; the sliders in the settings button change the angle and the radius.'] },
  { title: 'Lists', lines: ['Swipe a row far to the left to delete it (Undo brings it back).', 'Tick a checklist entry for a small high chime; ticking a whole task plays the larger one.'] },
]
function TipsList() {
  const [open, setOpen] = useState(false)
  return (
    <div className="px-1">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 rounded-xl px-1 py-1.5 text-left transition hover:bg-white/50">
        <span className={`text-ink-faint transition-transform ${open ? 'rotate-90' : ''}`}>
          <IconChevron size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-sm">Tips and gestures</span>
          <span className="block text-[0.7rem] text-ink-faint">the things that are easy to miss</span>
        </span>
      </button>
      {open && (
        <div className="mb-1 ml-6 mt-1 space-y-2.5 text-[0.8rem] text-ink-soft">
          {TIPS.map((t) => (
            <section key={t.title}>
              <h5 className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">{t.title}</h5>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                {t.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section>
    <h4 className="px-2 pb-0.5 pt-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">{title}</h4>
    {children}
  </section>
)

/**
 * A range that previews straight onto the page while it is dragged (no store update, so no React re-render of the
 * app per tick) and saves when you let go (or pause).
 */
function LiveRange({ value, preview, commit, ...rest }: { value: number; preview: (v: number) => void; commit: (v: number) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [local, setLocal] = useState(value)
  const dragging = useRef(false)
  const timer = useRef(0)
  // follow the saved value (a reset dot, another device) whenever it is not being dragged
  useEffect(() => {
    if (!dragging.current) setLocal(value)
  }, [value])
  const save = (v: number) => {
    window.clearTimeout(timer.current)
    commit(v)
  }
  return (
    <input
      {...rest}
      type="range"
      value={local}
      onChange={(e) => {
        const v = Number(e.target.value)
        dragging.current = true
        setScrubbing(true)
        setLocal(v)
        preview(v)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => save(v), 400)
      }}
      onPointerUp={(e) => {
        dragging.current = false
        setScrubbing(false)
        save(Number((e.target as HTMLInputElement).value))
      }}
      onPointerCancel={() => {
        dragging.current = false
        setScrubbing(false)
      }}
      onBlur={() => setScrubbing(false)}
      onKeyUp={(e) => {
        dragging.current = false
        setScrubbing(false)
        save(Number((e.target as HTMLInputElement).value))
        rest.onKeyUp?.(e)
      }}
    />
  )
}

/** One place for the display, sound and notification options (also reachable from the icons at the top). */
export function SettingsDialog() {
  const { open } = useSettingsDialog()
  const [crop, setCrop] = useState<{ top: number; right: number; bottom: number; left: number } | null>(null)
  // Holding a slider shrinks the dialog to just that control, so what it changes can be watched behind it.
  const peekProps = {
    onPointerDown: (e: React.PointerEvent<HTMLInputElement>) => {
      const block = e.currentTarget.closest('[data-slider-block]')?.getBoundingClientRect()
      const box = e.currentTarget.closest('[role=dialog]')?.getBoundingClientRect()
      if (!block || !box) return
      const pad = 3
      setCrop({ top: block.top - box.top - pad, left: block.left - box.left - pad, right: box.right - block.right - pad, bottom: box.bottom - block.bottom - pad })
      window.addEventListener('pointerup', () => setCrop(null), { once: true })
      window.addEventListener('pointercancel', () => setCrop(null), { once: true })
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.repeat) return
      const block = e.currentTarget.closest('[data-slider-block]')?.getBoundingClientRect()
      const box = e.currentTarget.closest('[role=dialog]')?.getBoundingClientRect()
      if (block && box) setCrop({ top: block.top - box.top - 3, left: block.left - box.left - 3, right: box.right - block.right - 3, bottom: box.bottom - block.bottom - 3 })
    },
    onKeyUp: () => setCrop(null),
  }
  const space = useStore((s) => s.settings.sidebarSpace)
  const hue = useStore((s) => s.settings.themeHue)
  const dateFormat = useStore((s) => s.settings.dateFormat)
  const clockFormat = useStore((s) => s.settings.clockFormat)
  const quickAdd = useStore((s) => s.settings.quickAdd)
  const sound = useStore((s) => s.settings.sound)
  const volume = useStore((s) => s.settings.volume)
  const setSetting = useStore((s) => s.setSetting)
  return (
    <Modal
      open={open}
      onClose={close}
      label="My settings"
      crop={crop}
      header={
        <div className="flex items-center">
          <h3 className="font-display text-xl">My settings</h3>
          {/* options save the moment they change, so there is nothing to confirm: just close */}
          <button type="button" onClick={close} aria-label="Close settings" className="-mr-1.5 ml-auto grid h-8 w-8 place-items-center rounded-full text-ink-soft transition hover:bg-white/70 hover:text-ink">
            <IconClose size={16} />
          </button>
        </div>
      }
    >
      <div className="space-y-1">
        <Group title="Soundscape">
          <Row k="sound" label="Audio" hint="master control for all sounds" inline />
          <div className={`mx-2 mb-1 ml-7 transition ${sound ? '' : 'opacity-45'}`}>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={volume}
              disabled={!sound}
              onChange={(e) => setSetting('volume', Number(e.target.value))}
              className="soft"
              aria-label="Volume"
            />
          </div>
          <Row k="sfxDrops" label="Water drops" hint="when you add" indent inline faded={!sound} />
          <Row k="sfxChimes" label="Task sounds" hint="finish, tag, move" indent inline faded={!sound} />
          <Row k="sfxPops" label="Bubble pops" hint="when you delete" indent inline faded={!sound} />
          <Row k="ambient" label="Ambient wind chimes" indent faded={!sound} />
        </Group>
        <Group title="Look & Feel">
          <div className="px-2 py-1.5" data-slider-block>
            <div className="flex items-baseline justify-between text-sm">
              <span>Color</span>
              <span className="text-[0.7rem] text-ink-faint">{Math.abs(hue - BASE_HUE) < 1 ? 'Default' : ''}</span>
            </div>
            <div className="relative mt-1 pb-1">
              <LiveRange min={0} max={360} value={hue} preview={applyTheme} commit={(v) => setSetting('themeHue', v)} className="soft hue relative z-10" aria-label="Interface color" {...peekProps} />
              <DefaultDot at={BASE_HUE / 360} color="#9f6fcd" label="Back to the original violet" onReset={() => setSetting('themeHue', BASE_HUE)} />
            </div>
          </div>
          <div className="px-2 py-1.5" data-slider-block>
            <div className="flex items-baseline justify-between text-sm">
              <span>Menu spacing</span>
              <span className="text-[0.7rem] text-ink-faint">{Math.abs(space - 0.5) < 0.005 ? 'Default' : space < 0.2 ? 'compact' : space > 0.8 ? 'relaxed' : ''}</span>
            </div>
            <div className="relative mt-1 pb-1">
              <LiveRange
                min={0}
                max={1}
                step={0.01}
                value={space}
                preview={applySpace}
                commit={(v) => setSetting('sidebarSpace', v)}
                {...peekProps}
                className="soft relative z-10"
                aria-label="Sidebar spacing"
              />
              <DefaultDot at={0.5} label="Reset spacing" onReset={() => setSetting('sidebarSpace', 0.5)} />
            </div>
            <div className="-mt-2.5 flex justify-between text-[0.68rem] text-ink-faint">
              <span>Compact</span>
              <span>Relaxed</span>
            </div>
          </div>
          <ViewsPicker />
          <div className="mt-1 border-t border-white/50" />
          <Row k="sizeByPriority" label="Bubbles scale by importance" hint="bubble size in Pond and Priority views" />
          <Row k="drift" label="Gentle drifting" hint="floating on the water" />
          <Row k="showDone" label="Show completed tasks" hint="finished tasks stay visible" />
          <CompletedRetention />
        </Group>
        <Group title="App options">
          <div className="space-y-1.5 px-2 py-1.5">
            <div>
              <span className="text-sm">Quick add understands</span>
              <span className="block text-[0.7rem] text-ink-faint">dates, times, people and groups in what you type</span>
            </div>
            <SegmentedToggle
              label="Quick add understanding"
              value={quickAdd}
              options={[
                { id: 'auto', label: 'Automatically' },
                { id: 'suggest', label: 'Suggest' },
                { id: 'off', label: 'Off' },
              ]}
              onChange={(v) => setSetting('quickAdd', v)}
            />
            <span className="block text-[0.7rem] text-ink-faint">
              {quickAdd === 'auto' ? 'Applied as you type, with a button to keep it as typed.' : quickAdd === 'suggest' ? 'Shown as a suggestion you tap to use; nothing is applied until you do.' : 'Your words are kept exactly as typed.'}
            </span>
          </div>
          <Row k="viewsClearFilters" label="Switching views resets filters" hint="start every view from Everything" />
          <Row k="autoUrgency" label="Automatic urgency" hint="increase urgency as deadline nears" />
          <Row k="limitPlay" label="Limit play time" hint="3 minutes of play at a time, then a break" />
          <Row k="tooltips" label="Tooltips" hint="labels when you hover an icon" />
          <NotificationsRow />
          <Row k="autoRemind" label="Remind me about due dates" hint="a reminder comes with every due date (you can change or remove it)" />
          <Row k="autoCompletePastDue" label="Automatically complete past-due items" hint="check off dated tasks after their date, and events after they end" />
          {accountsConfigured && <Row k="notifyShared" label="Tell others about my new tasks" hint="when I add one to a shared group (off by default)" />}
        </Group>
        <Group title="Date &amp; Time">
          <div className="space-y-2 px-2 py-1.5">
            <div className="flex flex-wrap items-start gap-3">
              <div>
                <span className="mb-1 block text-sm">Date format</span>
                <DateFormatPick value={dateFormat} onChange={(v) => setSetting('dateFormat', v)} />
              </div>
              <div>
                <div className="mb-1 text-sm">Time format</div>
                <SegmentedToggle
                  label="Time format"
                  value={clockFormat}
                  options={[
                    { id: '12', label: '12-hour' },
                    { id: '24', label: '24-hour' },
                  ]}
                  onChange={(v) => setSetting('clockFormat', v)}
                />
              </div>
            </div>
            <div className="text-sm">
              Time zone <span className="ml-1 text-[0.7rem] text-ink-faint">{deviceTimeZone().replace(/_/g, ' ')} · follows this device</span>
            </div>
          </div>
        </Group>
        <Group title="Help">
          <TipsList />
        </Group>
        <Group title="Demo data">
          <p className="px-2 pb-1 text-[0.7rem] text-ink-faint">A default sampling of imaginary tasks that demonstrate all the apps features.</p>
          <div className="flex flex-wrap gap-2 px-2 pb-1">
            <button type="button" onClick={() => useStore.getState().importDemo()} className="glass-soft rounded-full px-3.5 py-1.5 text-sm text-lilac-700 hover:bg-white/80">
              Add demo data
            </button>
            <button type="button" onClick={() => useStore.getState().removeDemo()} className="glass-soft rounded-full px-3.5 py-1.5 text-sm text-ink-soft hover:bg-white/80">
              Remove demo data
            </button>
          </div>
        </Group>
        <div className="!mt-4 border-t border-danger/25" role="separator" />
        <Group title="Danger zone">
          <div className="flex gap-2 px-2 pb-1">
            <button type="button" onClick={() => openDanger('clear')} className="whitespace-nowrap rounded-full border border-danger/40 px-3.5 py-1.5 text-sm text-danger-ink transition hover:bg-rose-soft/40">
              Clear all data
            </button>
            {accountsConfigured && (
              <button type="button" onClick={() => openDanger('delete')} className="whitespace-nowrap rounded-full border border-danger/40 px-3.5 py-1.5 text-sm text-danger-ink transition hover:bg-rose-soft/40">
                Delete account
              </button>
            )}
          </div>
          <p className="px-2 text-[0.7rem] text-ink-faint">Requires password confirmation</p>
        </Group>
      </div>
    </Modal>
  )
}
