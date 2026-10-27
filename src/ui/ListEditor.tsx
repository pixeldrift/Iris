import { useRef } from 'react'
import type { ListItem, ListStyle, Task } from '../core/types'
import { useStore } from '../state/store'
import { IconClose, IconPlus } from './icons'

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

const STYLES: { id: ListStyle; label: string }[] = [
  { id: 'check', label: 'Checks' },
  { id: 'bullet', label: 'Bullets' },
  { id: 'number', label: 'Numbers' },
]

/** The entries of a list task: tick them, rename them, add more. Numbers are automatic. */
export function ListEditor({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask)
  const add = useRef<HTMLInputElement>(null)
  const items = task.items
  const set = (next: ListItem[]) => update(task.id, { items: next })
  const patch = (id: string, p: Partial<ListItem>) => set(items.map((i) => (i.id === id ? { ...i, ...p } : i)))

  const commit = () => {
    const el = add.current
    if (!el || !el.value.trim()) return
    set([...items, { id: uid(), text: el.value.trim(), done: false }])
    el.value = ''
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="mr-auto text-xs font-medium text-ink-soft">Marked with</span>
        {STYLES.map((s) => (
          <button
            key={s.id}
            onClick={() => update(task.id, { listStyle: s.id })}
            aria-pressed={task.listStyle === s.id}
            className={`rounded-full px-2.5 py-0.5 text-xs transition ${task.listStyle === s.id ? 'bg-lilac-500 text-white' : 'bg-white/50 text-ink-soft hover:bg-white/80'}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <ul className="mt-2 space-y-1">
        {items.map((it, n) => (
          <li key={it.id} className="group flex items-center gap-2">
            {task.listStyle === 'check' ? (
              <button
                role="checkbox"
                aria-checked={it.done}
                aria-label={`Done: ${it.text}`}
                onClick={() => patch(it.id, { done: !it.done })}
                className={`grid h-[1.15rem] w-[1.15rem] shrink-0 place-items-center rounded-full border transition ${it.done ? 'border-lilac-500 bg-lilac-500 text-white' : 'border-lilac-300 bg-white/60'}`}
              >
                {it.done && <span className="text-[0.6rem] leading-none">✓</span>}
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
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-faint opacity-60 transition hover:bg-white/70 hover:text-ink md:opacity-0 md:group-hover:opacity-100"
            >
              <IconClose size={12} />
            </button>
          </li>
        ))}
      </ul>
      <div className="well mt-2 flex items-center gap-2 rounded-xl px-2.5 py-1">
        <IconPlus size={14} />
        <input
          ref={add}
          aria-label="Add item"
          placeholder="Add an item…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
          }}
          onBlur={commit}
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-ink-faint"
        />
      </div>
    </div>
  )
}
