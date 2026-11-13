import * as sound from '../audio/engine'
import { useEffect, useRef, useState } from 'react'
import type { ListItem, ListStyle, Task } from '../core/types'
import { useStore } from '../state/store'
import { percentOfCount } from '../core/progress'
import { IconCheckHint, IconClose, IconPlus } from './icons'
import { SegmentedToggle } from './SegmentedToggle'
import { checkVars, useTaskHue } from './taskColor'

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

const STYLES: { id: ListStyle; label: string }[] = [
  { id: 'check', label: 'Checks' },
  { id: 'bullet', label: 'Bullets' },
  { id: 'number', label: 'Numbers' },
]

const EXAMPLES = ['Milk', 'Bread', 'Eggs']

/** The entries of a list task: tick them, rename them, add more. Numbers are automatic. */
export function ListEditor({ task, autoFocusFirst = false }: { task: Task; autoFocusFirst?: boolean }) {
  const update = useStore((s) => s.updateTask)
  const add = useRef<HTMLInputElement>(null)
  // an empty list shows three example entries (a preview of what a list looks like) until it is tapped to edit, which clears them
  const [touched, setTouched] = useState(false)
  const preview = task.items.length === 0 && !touched
  const items = task.items
  useEffect(() => {
    if (autoFocusFirst) requestAnimationFrame(() => add.current?.focus())
  }, [autoFocusFirst, items.length])
  const setProgress = useStore((s) => s.setProgress)
  const hue = useTaskHue(task)
  const set = (next: ListItem[]) => {
    update(task.id, { items: next })
    // ticking things off sets how far along the list is (ticked out of all), and the list moves to the column that reaches
    if (task.listStyle === 'check' && next.length > 0) setProgress(task.id, percentOfCount(next.filter((i) => i.done).length, next.length))
  }
  const patch = (id: string, p: Partial<ListItem>) => set(items.map((i) => (i.id === id ? { ...i, ...p } : i)))

  const commit = () => {
    const el = add.current
    if (!el || !el.value.trim()) return
    set([...items, { id: uid(), text: el.value.trim(), done: false }])
    sound.drop()
    el.value = ''
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-soft">Marked with</span>
        <SegmentedToggle label="Marked with" value={task.listStyle} options={STYLES} onChange={(v) => update(task.id, { listStyle: v })} />
      </div>
      {preview && (
        <ul aria-label="Example entries" onClick={() => (setTouched(true), requestAnimationFrame(() => add.current?.focus()))} className="mt-2 cursor-text space-y-1 opacity-50">
          {EXAMPLES.map((e, n) => (
            <li key={e} className="flex items-center gap-2 px-0.5 py-1 text-sm italic">
              {task.listStyle === 'check' ? <span aria-hidden className="h-[1.15rem] w-[1.15rem] shrink-0 rounded-full border border-lilac-300" /> : <span aria-hidden className="w-[1.15rem] shrink-0 text-center tabular-nums text-lilac-500">{task.listStyle === 'bullet' ? '•' : `${n + 1}.`}</span>}
              {e}
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-2 space-y-1">
        {items.map((it, n) => (
          <li key={it.id} className="group flex items-center gap-2">
            {task.listStyle === 'check' ? (
              <button
                role="checkbox"
                aria-checked={it.done}
                aria-label={`Done: ${it.text}`}
                onClick={() => {
                  if (it.done) sound.tickUndone()
                  else sound.tickDone()
                  patch(it.id, { done: !it.done })
                }}
                style={checkVars(hue)}
                className={`well-circle grid h-[1.15rem] w-[1.15rem] shrink-0 place-items-center rounded-full transition ${it.done ? 'is-on text-white' : 'text-[color:var(--chk-ring,var(--color-lilac-400))]'}`}
              >
                {it.done ? <span className="text-[0.6rem] leading-none">✓</span> : <span className="opacity-55"><IconCheckHint size={11} /></span>}
              </button>
            ) : (
              <span aria-hidden className="w-[1.15rem] shrink-0 text-center text-sm tabular-nums text-lilac-500">
                {task.listStyle === 'bullet' ? '•' : `${n + 1}.`}
              </span>
            )}
            <input
              value={it.text}
              onChange={(e) => patch(it.id, { text: e.target.value })}
              aria-label={`Item ${n + 1}`}
              className={`min-w-0 flex-1 rounded-lg bg-transparent px-1.5 py-1 text-sm outline-none focus:bg-white/60 ${task.listStyle === 'check' && it.done ? 'text-ink-faint line-through' : ''}`}
            />
            <button
              onClick={() => set(items.filter((x) => x.id !== it.id))}
              aria-label={`Remove ${it.text}`}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-faint opacity-60 transition hover:bg-white/70 hover:text-ink [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
            >
              <IconClose size={12} />
            </button>
          </li>
        ))}
      </ul>
      <div className="well mt-2 flex items-center gap-1 rounded-xl px-2 py-1">
        <IconPlus size={14} />
        <input
          ref={add}
          aria-label="Add item"
          placeholder="Add an item…"
          onFocus={() => setTouched(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
          }}
          onBlur={commit}
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-ink-faint"
        />
        <button type="button" onClick={() => { if (add.current) { add.current.value = ""; add.current.focus() } }} aria-label="Clear item" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-white/70"><IconClose size={12} /></button>
        <button type="button" onClick={commit} aria-label="Add item" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lilac-500 text-lg text-white shadow-sm transition hover:bg-lilac-600">↵</button>
      </div>
    </div>
  )
}
