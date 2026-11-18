import * as sound from '../audio/engine'
import { createPortal } from 'react-dom'
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

  // Reordering: a grip on each entry (kept well away from the delete button). Holding it and moving up or down takes the entry past its neighbours as the
  // pointer crosses them; the arrow keys do the same from the grip. The entries are shown in the new order while it is held and kept when it is let go.
  const rows = useRef(new Map<string, HTMLLIElement>())
  const [moving, setMoving] = useState<{ id: string; order: string[]; x: number; y: number } | null>(null)
  const shown = moving ? moving.order.map((id) => items.find((i) => i.id === id)).filter((i): i is ListItem => !!i) : items
  const startMove = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    e.preventDefault()
    const mids = new Map([...rows.current].map(([k, el]) => [k, el.getBoundingClientRect()] as const).map(([k, r]) => [k, r.top + r.height / 2] as const))
    const ids = items.map((i) => i.id)
    let order = ids
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    document.body.classList.add('dragging')
    const at = (y: number) => {
      const others = ids.filter((x) => x !== id)
      const before = others.filter((x) => (mids.get(x) ?? 0) < y).length
      return [...others.slice(0, before), id, ...others.slice(before)]
    }
    const move = (ev: PointerEvent) => {
      order = at(ev.clientY)
      setMoving({ id, order, x: ev.clientX, y: ev.clientY })
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      document.body.classList.remove('dragging')
      setMoving(null)
      if (order.some((x, i) => x !== ids[i])) {
        sound.drop()
        set(order.map((x) => items.find((i) => i.id === x)!))
      }
    }
    setMoving({ id, order, x: e.clientX, y: e.clientY })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }
  const nudge = (id: string, by: -1 | 1) => {
    const at = items.findIndex((i) => i.id === id)
    const to = at + by
    if (at < 0 || to < 0 || to >= items.length) return
    const next = [...items]
    next.splice(to, 0, ...next.splice(at, 1))
    set(next)
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-item-grip="${id}"]`)?.focus())
  }

  const commit = () => {
    const el = add.current
    if (!el || !el.value.trim()) return
    set([...items, { id: uid(), text: el.value.trim(), done: false }])
    sound.drop()
    el.value = ''
  }
  const clear = () => {
    if (add.current) add.current.value = ''
    add.current?.focus()
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
        {shown.map((it, n) => (
          <li key={it.id} ref={(el) => void (el ? rows.current.set(it.id, el) : rows.current.delete(it.id))} className={`group flex items-center gap-2 rounded-lg transition-opacity ${moving?.id === it.id ? 'bg-white/50 opacity-60 ring-1 ring-lilac-300/70' : ''}`}>
            {task.listStyle === 'check' ? (
              <button
                role="checkbox"
                aria-checked={it.done}
                aria-label={`Completed: ${it.text}`}
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
            {/* the grip: just a few dots, the same kind as the grab dots elsewhere. Pressed and held, it moves the entry; a gap separates it from the delete button */}
            {items.length > 1 && (
              <button
                type="button"
                data-item-grip={it.id}
                aria-label={`Move ${it.text || 'this item'} (arrow keys move it up or down)`}
                title="Drag to reorder"
                onPointerDown={(e) => startMove(e, it.id)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') (e.preventDefault(), nudge(it.id, -1))
                  else if (e.key === 'ArrowDown') (e.preventDefault(), nudge(it.id, 1))
                }}
                className="grid h-7 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-ink-faint transition hover:bg-white/60 active:cursor-grabbing"
              >
                <span aria-hidden className="grid grid-cols-2 gap-[3px]">
                  {[0, 1, 2, 3, 4, 5].map((d) => (
                    <span key={d} className="emboss-dot" />
                  ))}
                </span>
              </button>
            )}
            <button
              onClick={() => set(items.filter((x) => x.id !== it.id))}
              aria-label={`Remove ${it.text}`}
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-faint opacity-60 transition hover:bg-white/70 hover:text-ink [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 ${items.length > 1 ? 'ml-3' : ''}`}
            >
              <IconClose size={12} />
            </button>
          </li>
        ))}
      </ul>
      {moving &&
        createPortal(
          <div className="pointer-events-none fixed z-[var(--z-drag)] max-w-[240px] truncate rounded-full border border-white/70 bg-white/85 px-3 py-1 text-sm text-ink shadow-[0_8px_30px_rgba(132,83,180,0.28)] backdrop-blur-md" style={{ left: moving.x + 14, top: moving.y + 10 }}>
            {items.find((i) => i.id === moving.id)?.text || 'Item'}
          </div>,
          document.body,
        )}
      <div className="well mt-2 flex items-center gap-1 rounded-xl px-2 py-1">
        <IconPlus size={14} />
        <input
          ref={add}
          autoFocus={autoFocusFirst}
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
        {/* (pressing these must not take focus off the box first: leaving it adds what is typed, which would make "clear" add it) */}
        <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={clear} aria-label="Clear" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-white/70">
          <IconClose size={12} />
        </button>
        <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => { commit(); add.current?.focus() }} aria-label="Add" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lilac-500 text-lg leading-none text-white shadow-sm transition hover:bg-lilac-600">
          <span aria-hidden>↵</span>
        </button>
      </div>
    </div>
  )
}
