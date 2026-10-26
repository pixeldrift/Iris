import { useEffect, useRef, useState } from 'react'
import { WEEKDAYS } from '../core/dates'
import { allLinks } from '../core/people'
import { useStore } from '../state/store'
import { useExit } from './anim'
import { DatePicker } from './DatePicker'
import { askConfirm } from './dialogs'
import { IconCheck, IconTrash } from './icons'
import { DoneButton, KINDS, STATUSES } from './shared'
import { TagInput } from './TagInput'

function SoftSlider({ label, left, right, value, onChange }: { label: string; left: string; right: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-xs font-medium text-ink-soft">{label}</span>
      <input type="range" min={0} max={1} step={0.01} value={value} onChange={(e) => onChange(Number(e.target.value))} className="soft" aria-label={label} />
      <span className="flex justify-between text-[0.68rem] text-ink-faint">
        <span>{left}</span>
        <span>{right}</span>
      </span>
    </label>
  )
}

export function TaskDetail() {
  const id = useStore((s) => s.selectedId)
  const live = useStore((s) => s.tasks.find((t) => t.id === s.selectedId))
  const people = useStore((s) => s.people)
  const update = useStore((s) => s.updateTask)
  const setDue = useStore((s) => s.setDue)
  const setStatus = useStore((s) => s.setStatus)
  const del = useStore((s) => s.deleteTask)
  const select = useStore((s) => s.select)
  const checkContact = useStore((s) => s.checkContact)
  const titleRef = useRef<HTMLInputElement>(null)

  // keep the last task around so the panel can animate out
  const last = useRef(live)
  if (live) last.current = live
  const task = live ?? last.current
  const { mounted, closing } = useExit(!!id && !!live, 240)

  // "Saved" blinks whenever something about the task changes
  const sig = task ? JSON.stringify([task.title, task.notes, task.kind, task.status, task.importance, task.urgency, task.start, task.due, task.day, task.rollover, task.days, task.folderIds, task.personIds]) : ''
  const [savedTick, setSavedTick] = useState(0)
  const firstSig = useRef(sig)
  useEffect(() => {
    if (sig !== firstSig.current) setSavedTick((n) => n + 1)
    firstSig.current = sig
  }, [sig])
  useEffect(() => {
    firstSig.current = sig
    setSavedTick(0)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement && e.target.getAttribute('aria-label') === 'Add tag')) select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, select])

  useEffect(() => {
    if (id && live?.title === 'New task') titleRef.current?.select()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!task || !mounted) return null

  const linked = people.filter((p) => task.personIds.includes(p.id))
  const links = linked.flatMap((p) => allLinks(p).map((l) => ({ ...l, who: p.name.split(' ')[0] })))

  return (
    <>
      <div className={`fixed inset-0 z-[60] bg-ink/10 transition-opacity md:hidden ${closing ? 'opacity-0' : 'opacity-100'}`} onClick={() => select(null)} />
      <section
        className={`glass glass-strong fixed inset-x-0 bottom-0 z-[70] flex max-h-[88dvh] flex-col rounded-t-3xl md:inset-x-auto md:bottom-3 md:right-3 md:top-3 md:max-h-none md:w-[24rem] md:rounded-3xl ${
          closing ? 'slide-out-right' : 'slide-in-right'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Task details"
      >
        <header className="flex items-center gap-3 px-5 pb-2 pt-5">
          <DoneButton task={task} size={26} />
          <input
            ref={titleRef}
            value={task.title}
            onChange={(e) => update(task.id, { title: e.target.value })}
            onBlur={() => checkContact(task.id)}
            placeholder="What’s floating in your mind?"
            className="min-w-0 flex-1 bg-transparent font-display text-xl outline-none placeholder:text-ink-faint"
          />
        </header>

        <div className="scroll-soft min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-3 pt-2">
          <div className="flex gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k.id}
                onClick={() => update(task.id, { kind: k.id })}
                className={`rounded-full px-3 py-1 text-xs transition ${task.kind === k.id ? 'bg-lilac-500 text-white shadow shadow-lilac-500/30' : 'bg-white/50 text-ink-soft hover:bg-white/80'}`}
              >
                {k.label}
              </button>
            ))}
          </div>

          {links.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {links.map((l) => (
                <a key={l.href} href={l.href} className="rounded-full bg-lilac-100 px-3.5 py-1.5 text-sm text-lilac-700 shadow-sm transition hover:bg-lilac-200">
                  {l.label} {l.who}
                </a>
              ))}
            </div>
          )}

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

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <DatePicker label="Do on" value={task.day} onChange={(v) => update(task.id, { day: v })} />
              <DatePicker label="Due by" value={task.due} onChange={(v) => setDue(task.id, v)} />
              <DatePicker label="Begins (timeline)" value={task.start} max={task.due} onChange={(v) => update(task.id, { start: v })} />
              <div className="text-xs font-medium text-ink-soft">
                If I don’t finish
                <button
                  type="button"
                  onClick={() => update(task.id, { rollover: !task.rollover })}
                  aria-pressed={task.rollover}
                  className="glass-soft mt-1 flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-sm font-normal text-ink"
                >
                  {task.rollover ? 'Carry to next day' : 'Leave it here'}
                  <span className={`relative h-4 w-7 shrink-0 rounded-full transition ${task.rollover ? 'bg-lilac-500' : 'bg-ink-faint/40'}`}>
                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${task.rollover ? 'left-[0.85rem]' : 'left-0.5'}`} />
                  </span>
                </button>
              </div>
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-ink-soft">
                Only on these days <span className="font-normal text-ink-faint">{task.days?.length ? '' : '· any day'}</span>
              </span>
              <div className="flex gap-1">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((l, i) => {
                  const on = !!task.days?.includes(i)
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={on}
                      aria-label={WEEKDAYS[i]}
                      onClick={() => {
                        const cur = task.days ?? []
                        const next = on ? cur.filter((d) => d !== i) : [...cur, i].sort()
                        update(task.id, { days: next.length ? next : null })
                      }}
                      className={`grid h-8 flex-1 place-items-center rounded-full text-xs transition ${on ? 'bg-lilac-500 text-white shadow shadow-lilac-500/30' : 'bg-white/50 text-ink-soft hover:bg-white/80'}`}
                    >
                      {l}
                    </button>
                  )
                })}
              </div>
              {!!task.days?.length && task.rollover && <p className="mt-1 text-[0.68rem] text-ink-faint">If missed, it moves to the next of these days, unless that’s after the due date.</p>}
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
                  className={`flex-1 rounded-xl py-1.5 text-sm transition ${task.status === s.id ? 'bg-lilac-100 font-medium text-lilac-700 ring-1 ring-lilac-300' : 'bg-white/40 text-ink-soft hover:bg-white/70'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="space-y-3 border-t border-white/60 px-5 pb-4 pt-3">
          <TagInput taskId={task.id} />
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                if (await askConfirm({ title: 'Let this one go?', message: `“${task.title || 'Untitled'}” will pop and be gone.`, confirmLabel: 'Pop it', cancelLabel: 'Keep', danger: true })) del(task.id)
              }}
              className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-ink-faint transition hover:text-[#b04a6e]"
            >
              <IconTrash size={14} /> Delete
            </button>
            <span key={savedTick} className={`ml-auto flex items-center gap-1 text-xs text-lilac-600 ${savedTick ? 'saved-blink' : ''}`} aria-live="polite">
              <IconCheck size={13} /> Saved automatically
            </span>
            <button onClick={() => select(null)} className="rounded-full bg-lilac-500 px-4 py-1.5 text-sm font-medium text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600">
              Done
            </button>
          </div>
        </footer>
      </section>
    </>
  )
}
