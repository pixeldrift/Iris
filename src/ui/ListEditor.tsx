import * as sound from '../audio/engine'
import { useEffect, useRef, useState } from 'react'
import type { ListItem, ListStyle, Task } from '../core/types'
import { blockOf, checkedLast, depthOf, moveBlock, numbering, tidyDepths } from '../core/listitems'
import { useFlip } from './flip'
import { Gap } from './sidebar/parts'
import { useCarried, useGapDepth, useRowDrag } from './sidebar/rowDrag'
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

const INDENT = 24

function EndGap({ listId }: { listId: string }) {
  const depth = useGapDepth(listId, null)
  return <Gap open={depth !== null} inset={(depth ?? 0) * INDENT} />
}

/** One entry of a checklist: its marker, its text, and a grip to carry it (with what is inside it) somewhere else. */
function ChecklistRow({ listId, it, items, number, style, hue, onDone, onText, onRemove, onDrop, onKey }: { listId: string; it: ListItem; items: ListItem[]; number: number; style: ListStyle; hue: number | null; onDone: (done: boolean) => void; onText: (t: string) => void; onRemove: () => void; onDrop: (beforeId: string | null, depth: number) => void; onKey: (k: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') => void }) {
  const row = useRef<HTMLLIElement>(null)
  const d = depthOf(it)
  const block = blockOf(items, it.id)
  const carried = useCarried(it.id)
  const gap = useGapDepth(listId, it.id)
  const drag = useRowDrag({ listId, type: 'item', id: it.id, label: it.text || 'Item', row, followers: block.slice(1), hierarchy: { depth: d, step: INDENT }, onDrop: ({ beforeId, depth }) => onDrop(beforeId, depth) })
  return (
    <>
      <Gap open={gap !== null} inset={(gap ?? 0) * INDENT} />
      <li
        ref={row}
        data-reorder-row={it.id}
        data-reorder-depth={d}
        data-lift-id={`item:${it.id}`}
        data-flip={it.id}
        onPointerDown={(e) => {
          // (the text box and the buttons keep their own presses; the rest of the row picks it up)
          if ((e.target as HTMLElement).closest('input,button')) return
          drag(e)
        }}
        style={{ marginLeft: d * INDENT }}
        className={`group flex items-center gap-2 rounded-lg transition-opacity ${carried ? 'bg-white/50 opacity-40 ring-1 ring-lilac-300/70' : ''}`}
      >
        {style === 'check' ? (
          <button
            role="checkbox"
            aria-checked={it.done}
            aria-label={`Completed: ${it.text}`}
            onClick={() => onDone(!it.done)}
            style={checkVars(hue)}
            className={`well-circle grid h-[1.15rem] w-[1.15rem] shrink-0 place-items-center rounded-full transition ${it.done ? 'is-on text-white' : 'text-[color:var(--chk-ring,var(--color-lilac-400))]'}`}
          >
            {it.done ? <span className="text-[0.6rem] leading-none">✓</span> : <span className="opacity-55"><IconCheckHint size={11} /></span>}
          </button>
        ) : style === 'bullet' ? (
          <span aria-hidden className="grid w-[1.15rem] shrink-0 place-items-center text-[1.6rem] leading-none text-lilac-500">
            {d % 2 ? '◦' : '•'}
          </span>
        ) : (
          <span aria-hidden className="w-[1.15rem] shrink-0 text-center text-sm tabular-nums text-lilac-500">
            {number}.
          </span>
        )}
        <input
          value={it.text}
          onChange={(e) => onText(e.target.value)}
          aria-label={`Item ${it.text || ''}`.trim()}
          className={`min-w-0 flex-1 rounded-lg bg-transparent px-1.5 py-1 text-sm outline-none focus:bg-white/60 ${style === 'check' && it.done ? 'text-ink-faint line-through' : ''}`}
        />
        {items.length > 1 && (
          <button
            type="button"
            data-item-grip={it.id}
            aria-label={`Move ${it.text || 'this item'} (arrow keys move it; right and left indent it)`}
            title="Drag to reorder or nest"
            onPointerDown={(e) => {
              e.stopPropagation()
              drag(e, true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') (e.preventDefault(), onKey(e.key))
            }}
            className="grid h-7 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-ink-faint transition hover:bg-white/60 active:cursor-grabbing"
          >
            <span aria-hidden className="grid grid-cols-2 gap-[3px]">
              {[0, 1, 2, 3, 4, 5].map((k) => (
                <span key={k} className="emboss-dot" />
              ))}
            </span>
          </button>
        )}
        <button
          onClick={onRemove}
          aria-label={`Remove ${it.text}`}
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-faint opacity-60 transition hover:bg-white/70 hover:text-ink [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 ${items.length > 1 ? 'ml-3' : ''}`}
        >
          <IconClose size={12} />
        </button>
      </li>
    </>
  )
}

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
  // checked entries sink to the bottom unless that has been switched off
  const doneLast = task.listStyle === 'check' && (task.listDoneLast ?? true)
  const set = (list: ListItem[]) => {
    const next = doneLast ? checkedLast(tidyDepths(list)) : tidyDepths(list)
    update(task.id, { items: next })
    // ticking things off sets how far along the list is (ticked out of all), and the list moves to the column that reaches
    if (task.listStyle === 'check' && next.length > 0) setProgress(task.id, percentOfCount(next.filter((i) => i.done).length, next.length))
  }
  // a list made before this (or one edited elsewhere) is put in order too
  useEffect(() => {
    if (!doneLast) return
    const sorted = checkedLast(tidyDepths(task.items))
    if (sorted !== task.items) update(task.id, { items: sorted })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneLast, task.items])
  const patch = (id: string, p: Partial<ListItem>) => set(items.map((i) => (i.id === id ? { ...i, ...p } : i)))

  // Reordering is the sidebar's own drag (see sidebar/rowDrag): the row is lifted, a line shows the gap, the others glide aside; sideways travel puts an entry
  // inside the one above it (or back out), as with groups. The arrow keys do the same from the grip: up and down to move, right and left to indent or outdent.
  const listRef = useRef<HTMLUListElement>(null)
  useFlip(listRef)
  const drop = (id: string, beforeId: string | null, depth: number) => set(moveBlock(items, id, beforeId, depth))
  const nudge = (id: string, key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') => {
    const at = items.findIndex((i) => i.id === id)
    if (at < 0) return
    const d = depthOf(items[at])
    if (key === 'ArrowRight') {
      if (at > 0 && d < depthOf(items[at - 1]) + 1) set(items.map((i) => (blockOf(items, id).includes(i.id) ? { ...i, depth: depthOf(i) + 1 } : i)))
    } else if (key === 'ArrowLeft') {
      if (d > 0) set(items.map((i) => (blockOf(items, id).includes(i.id) ? { ...i, depth: depthOf(i) - 1 } : i)))
    } else {
      // one visible place up or down, past a whole neighbouring block
      const block = blockOf(items, id)
      const rest = items.filter((i) => !block.includes(i.id))
      const here = rest.findIndex((_, k) => k >= at) < 0 ? rest.length : rest.findIndex((_, k) => k >= at)
      const to = key === 'ArrowUp' ? here - 1 : here + 1
      if (to < 0 || to > rest.length) return
      drop(id, rest[to]?.id ?? null, d)
    }
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-item-grip="${id}"]`)?.focus())
  }
  const numbers = numbering(items)

  const commit = () => {
    const el = add.current
    if (!el || !el.value.trim()) return
    // (the newest goes at the top, where it is in view however long the list is)
    set([{ id: uid(), text: el.value.trim(), done: false }, ...items])
    sound.drop()
    el.value = ''
  }
  const clear = () => {
    if (add.current) add.current.value = ''
    add.current?.focus()
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <SegmentedToggle label="Marked with" value={task.listStyle} options={STYLES} onChange={(v) => update(task.id, { listStyle: v })} />
        {task.listStyle === 'check' && (
          <button
            type="button"
            aria-pressed={doneLast}
            title="Keep checked items at the bottom"
            onClick={() => {
              const on = !doneLast
              update(task.id, { listDoneLast: on, ...(on ? { items: checkedLast(tidyDepths(items)) } : {}) })
            }}
            className={`ml-auto whitespace-nowrap rounded-full px-3 py-1 text-xs transition ${doneLast ? 'bg-lilac-500 text-white shadow shadow-lilac-500/30' : 'glass-soft text-ink-soft hover:bg-white/70'}`}
          >
            Checked last
          </button>
        )}
      </div>
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
      {preview && (
        <ul aria-label="Example entries" onClick={() => (setTouched(true), requestAnimationFrame(() => add.current?.focus()))} className="mt-2 cursor-text space-y-1 opacity-50">
          {EXAMPLES.map((e, n) => (
            <li key={e} className="flex items-center gap-2 px-0.5 py-1 text-sm italic">
              {task.listStyle === 'check' ? <span aria-hidden className="h-[1.15rem] w-[1.15rem] shrink-0 rounded-full border border-lilac-300" /> : <span aria-hidden className={`w-[1.15rem] shrink-0 text-center tabular-nums text-lilac-500 ${task.listStyle === 'bullet' ? 'text-[1.6rem] leading-none' : ''}`}>{task.listStyle === 'bullet' ? '•' : `${n + 1}.`}</span>}
              {e}
            </li>
          ))}
        </ul>
      )}
      <ul ref={listRef} data-reorder-list={`items:${task.id}`} className="mt-2 space-y-1">
        {items.map((it, n) => (
          <ChecklistRow
            key={it.id}
            listId={`items:${task.id}`}
            it={it}
            items={items}
            number={numbers[n]}
            style={task.listStyle}
            hue={hue}
            onDone={(done) => {
              if (done) sound.tickDone()
              else sound.tickUndone()
              patch(it.id, { done })
            }}
            onText={(text) => patch(it.id, { text })}
            onRemove={() => set(items.filter((x) => x.id !== it.id))}
            onDrop={(beforeId, depth) => {
              sound.drop()
              drop(it.id, beforeId, depth)
            }}
            onKey={(k) => nudge(it.id, k)}
          />
        ))}
        <EndGap listId={`items:${task.id}`} />
      </ul>
    </div>
  )
}
