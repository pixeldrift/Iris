import { create } from 'zustand'
import { unlock } from '../audio/engine'
import { useStore } from '../state/store'
import type { Settings } from '../state/store'
import { Modal } from './dialogs'
import { askNotify, notifyState } from './notify'
import { useState } from 'react'

const useSettingsDialog = create<{ open: boolean }>(() => ({ open: false }))
export const openSettings = () => useSettingsDialog.setState({ open: true })
const close = () => useSettingsDialog.setState({ open: false })

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]

function Row({ k, label, hint, indent = false, faded = false }: { k: BoolKey; label: string; hint?: string; indent?: boolean; faded?: boolean }) {
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
      className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/50 ${indent ? 'ml-5 w-[calc(100%-1.25rem)]' : ''} ${faded ? 'opacity-45' : ''}`}
    >
      <span className="min-w-0 flex-1 text-sm">
        {label}
        {hint && <span className="ml-2 text-[0.7rem] text-ink-faint">{hint}</span>}
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? 'bg-lilac-500' : 'bg-ink-faint/40'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[1.1rem]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section>
    <h4 className="px-2 pb-0.5 pt-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">{title}</h4>
    {children}
  </section>
)

/** One place for the display, sound and notification options (also reachable from the icons at the top). */
export function SettingsDialog() {
  const { open } = useSettingsDialog()
  const [perm, setPerm] = useState(notifyState())
  const sound = useStore((s) => s.settings.sound)
  const volume = useStore((s) => s.settings.volume)
  const setSetting = useStore((s) => s.setSetting)
  return (
    <Modal open={open} onClose={close} label="My settings">
      <div className="space-y-1">
        <h3 className="font-display text-xl">My settings</h3>
        <Group title="Soundscape">
          <Row k="sound" label="Audio" hint="master control for all sounds" />
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
          <Row k="sfxDrops" label="Water drops" hint="when you add" indent faded={!sound} />
          <Row k="sfxChimes" label="Chimes and blooms" hint="finish, tag, move" indent faded={!sound} />
          <Row k="sfxPops" label="Bubble pops" hint="when you delete" indent faded={!sound} />
          <Row k="ambient" label="Ambient wind chimes" indent faded={!sound} />
        </Group>
        <Group title="Pond">
          <Row k="sizeByPriority" label="Scale by importance" hint="bubble size" />
          <Row k="drift" label="Gentle drifting" hint="floating on the water" />
          <Row k="showDone" label="Show bloomed tasks" hint="finished tasks stay visible" />
        </Group>
        <Group title="Reminders">
          <div className="flex items-center gap-3 px-2 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-sm">Notifications</span>
              <span className="block text-[0.7rem] text-ink-faint">
                {perm === 'granted' ? 'On: reminders can appear even when Lilac is in the background' : perm === 'denied' ? 'Blocked in this browser: allow them in its site settings' : perm === 'unsupported' ? 'Not supported here: reminders show inside the app' : 'Off: allow them to be reminded outside the app'}
              </span>
            </span>
            {perm === 'default' && (
              <button type="button" onClick={async () => setPerm(await askNotify())} className="shrink-0 rounded-full bg-lilac-500 px-3 py-1 text-xs text-white shadow shadow-lilac-500/30">
                Allow
              </button>
            )}
          </div>
        </Group>
        <div className="flex justify-end pt-2">
          <button type="button" onClick={close} className="rounded-full bg-lilac-500 px-5 py-2 text-sm font-medium text-white shadow-md shadow-lilac-500/30">
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}
