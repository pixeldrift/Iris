import { useEffect, useRef } from 'react'
import { addDays, today } from '../core/dates'
import { useStore } from '../state/store'
import { IconClose, IconTrash } from './icons'
import { DoneButton, KINDS, STATUSES } from './shared'
import { TagInput } from './TagInput'

function SoftSlider({ label, left, right, value, onChange }: { label: string; left: string; right: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-xs font-medium text-ink-soft">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="soft"
        aria-label={label}
      />
      <span className="flex justify-between text-[0.68rem] text-ink-faint">
        <span>{left}</span>
        <span>{right}</span>
      </span>
    </label>
  )
}

export function TaskDetail() {
  const id = useStore((s) => s.selectedId)
  const task = useStore((s) => s.tasks.find((t) => t.id === s.selectedId))
  const update = useStore((s) => s.updateTask)
  const setDue = useStore((s) => s.setDue)
  const setStatus = useStore((s) => s.setStatus)
  const del = useStore((s) => s.deleteTask)
  const select = useStore((s) => s.select)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement && e.target.getAttribute('aria-label') === 'Add tag')) select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, select])

  useEffect(() => {
    if (task && task.title === 'New task') titleRef.current?.select()
  }, [task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!task) return null
  const t0 = today()

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-ink/10 md:hidden" onClick={() => select(null)} />
      <section
        key={task.id}
        className="glass glass-strong slide-in-right fixed inset-x-0 bottom-0 z-[70] flex max-h-[88dvh] flex-col rounded-t-3xl md:inset-x-auto md:bottom-3 md:right-3 md:top-3 md:max-h-none md:w-[24rem] md:rounded-3xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Task details"
      >
        <header className="flex items-center gap-3 px-5 pb-2 pt-5">
          <DoneButton task={task} size={26} />
          <input
            ref={titleRef}
            value={task.title}
            onChange={(e) => update(task.id, { title: e.target.value })}
            placeholder="What’s floating in your mind?"
            className="min-w-0 flex-1 bg-transparent font-display text-xl outline-none placeholder:text-ink-faint"
          />
          <button onClick={() => select(null)} className="rounded-full p-1.5 text-ink-soft hover:bg-white/60" aria-label="Close">
            <IconClose />
          </button>
        </header>

        <div className="scroll-soft min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-3 pt-2">
          <div className="flex gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k.id}
                onClick={() => update(task.id, { kind: k.id })}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  task.kind === k.id ? 'bg-lilac-500 text-white shadow shadow-lilac-500/30' : 'bg-white/50 text-ink-soft hover:bg-white/80'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          <textarea
            value={task.notes}
            onChange={(e) => update(task.id, { notes: e.target.value })}
            placeholder="Notes, thoughts, anything…"
            rows={3}
            className="glass-soft w-full resize-none rounded-2xl px-3.5 py-2.5 text-sm outline-none placeholder:text-ink-faint focus:bg-white/70"
          />

          <div className="space-y-3">
            <SoftSlider label="How much it matters" left="a passing thought" right="close to my heart" value={task.importance} onChange={(v) => update(task.id, { importance: v })} />
            <SoftSlider label="How pressing it feels" left="whenever" right="the tide is coming" value={task.urgency} onChange={(v) => update(task.id, { urgency: v })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-ink-soft">
              Begins
              <input
                type="date"
                value={task.start ?? ''}
                max={task.due ?? undefined}
                onChange={(e) => update(task.id, { start: e.target.value || null })}
                className="glass-soft mt-1 w-full rounded-xl px-2.5 py-1.5 text-sm font-normal text-ink outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-ink-soft">
              Due
              <input
                type="date"
                value={task.due ?? ''}
                onChange={(e) => setDue(task.id, e.target.value || null)}
                className="glass-soft mt-1 w-full rounded-xl px-2.5 py-1.5 text-sm font-normal text-ink outline-none"
              />
            </label>
            <div className="col-span-2 -mt-1 flex flex-wrap gap-1.5 text-xs">
              {[
                ['Today', t0],
                ['Tomorrow', addDays(t0, 1)],
                ['Next week', addDays(t0, 7)],
              ].map(([label, d]) => (
                <button key={label} onClick={() => setDue(task.id, d)} className="rounded-full bg-white/50 px-2.5 py-1 text-ink-soft hover:bg-white/80">
                  {label}
                </button>
              ))}
              {task.due && (
                <button onClick={() => update(task.id, { due: null, start: null })} className="rounded-full px-2.5 py-1 text-ink-faint hover:bg-white/60">
                  Clear dates
                </button>
              )}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">Stage</span>
            <div className="flex gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStatus(task.id, s.id)}
                  title={s.hint}
                  className={`flex-1 rounded-xl py-1.5 text-sm transition ${
                    task.status === s.id ? 'bg-lilac-100 font-medium text-lilac-700 ring-1 ring-lilac-300' : 'bg-white/40 text-ink-soft hover:bg-white/70'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="space-y-3 border-t border-white/60 px-5 pb-4 pt-3">
          <TagInput taskId={task.id} />
          <button
            onClick={() => {
              if (confirm('Let this one go?')) del(task.id)
            }}
            className="flex items-center gap-1.5 text-xs text-ink-faint transition hover:text-[#b04a6e]"
          >
            <IconTrash size={14} /> Delete
          </button>
        </footer>
      </section>
    </>
  )
}
