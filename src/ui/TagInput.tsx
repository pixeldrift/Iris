import { createPortal } from 'react-dom'
import { useMemo, useRef, useState } from 'react'
import { tint } from '../core/color'
import { pathLabel } from '../core/folders'
import { tagsOf } from '../core/tasks'
import { fuzzyRank, fuzzyScore, sameName } from '../core/fuzzy'
import { useStore } from '../state/store'
import { IconClose, IconPlus } from './icons'
import { confirmTag, markTarget, taskElementAt } from './taskAt'

type Row =
  | { kind: 'folder' | 'person'; id: string; label: string; hue: number }
  | { kind: 'create-folder' | 'create-person'; label: string }

/**
 * Tags are folders, and people. Type to find one (typo-tolerant); if nothing
 * matches exactly, a + row offers to create it. "School/Essays" creates a
 * nested folder path; "@Sarah" creates a person.
 */
export function TagInput({ taskId }: { taskId: string }) {
  const task = useStore((s) => s.tasks.find((t) => t.id === taskId))
  const folders = useStore((s) => s.folders)
  const people = useStore((s) => s.people)
  const addToFolder = useStore((s) => s.addToFolder)
  const removeFromFolder = useStore((s) => s.removeFromFolder)
  const addPerson = useStore((s) => s.addPerson)
  const removePerson = useStore((s) => s.removePerson)
  const savePerson = useStore((s) => s.savePerson)
  const ensureFolderPath = useStore((s) => s.ensureFolderPath)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const well = useRef<HTMLDivElement>(null)
  const showToast = useStore((s) => s.showToast)
  const updateTask = useStore((s) => s.updateTask)
  // A tag is picked up by pressing on it and moving (no handle). Inside the box it goes between the others (the order is kept, `tagOrder`).
  // Taken outside the box it is only a copy that is torn off (the tag stays where it was) and carried: over another task it tags that task with it.
  const [carry, setCarry] = useState<{ id: string; kind: 'folder' | 'person'; label: string; hue: number; x: number; y: number; inside: boolean; order: string[] | null; over: string | null } | null>(null)

  const labeled = useMemo(() => folders.map((f) => ({ f, label: pathLabel(folders, f.id) })), [folders])

  const peopleOnly = q.trim().startsWith('@')
  const query = q.trim().replace(/^[#@]/, '')
  const leaf = query.split('/').pop()!.trim()

  const rows: Row[] = useMemo(() => {
    if (!task || !leaf) return []
    const out: Row[] = []
    const pplPool = people.filter((p) => !task.personIds.includes(p.id))
    const ppl = fuzzyRank(leaf, pplPool, (p) => p.name)
      .slice(0, 3)
      .map((p) => ({ kind: 'person' as const, id: p.id, label: p.name, hue: p.hue }))
    if (!peopleOnly) {
      const pool = labeled.filter((x) => !task.folderIds.includes(x.f.id))
      const ranked = fuzzyRank(leaf, pool, (x) => x.f.name)
      const byPath = query.includes('/') ? fuzzyRank(query, pool, (x) => x.label, 0.5) : []
      for (const m of [...new Set([...byPath, ...ranked])].slice(0, 4)) out.push({ kind: 'folder', id: m.f.id, label: m.label, hue: m.f.hue })
    }
    out.push(...ppl)
    if (!peopleOnly) {
      const exact = labeled.some((x) => sameName(x.label, query) || (!query.includes('/') && sameName(x.f.name, query)))
      if (!exact) out.push({ kind: 'create-folder', label: query })
    }
    if (!people.some((p) => sameName(p.name, leaf))) out.push({ kind: 'create-person', label: leaf })
    return out
  }, [task, leaf, query, people, labeled, peopleOnly])

  if (!task) return null

  const tagLabel = (kind: 'folder' | 'person', id: string) => {
    if (kind === 'folder') {
      const f = folders.find((x) => x.id === id)
      return { label: f?.name ?? 'Group', hue: f?.hue ?? 285 }
    }
    const p = people.find((x) => x.id === id)
    return { label: `@${(p?.name ?? 'Person').split(' ')[0]}`, hue: p?.hue ?? 285 }
  }
  const startCarry = (e: React.PointerEvent, tag: { kind: 'folder' | 'person'; id: string }) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    const sx = e.clientX
    const sy = e.clientY
    const ids = tagsOf(task).map((t) => t.id)
    // where each tag sits now (the box is measured once, so the order does not flicker as the others move out of the way)
    const rects = new Map([...(well.current?.querySelectorAll<HTMLElement>('[data-tag-chip]') ?? [])].map((el) => [el.dataset.tagChip!, el.getBoundingClientRect()] as const))
    const meta = tagLabel(tag.kind, tag.id)
    let started = false
    let order: string[] = ids
    let target: HTMLElement | null = null
    let over: { id: string; el: HTMLElement | null } | null = null
    const inBox = (x: number, y: number) => {
      const r = well.current?.getBoundingClientRect()
      return !!r && x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6
    }
    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return
        started = true
        document.body.classList.add('dragging')
      }
      const inside = inBox(ev.clientX, ev.clientY)
      if (inside) {
        // (the tags that come before the pointer, reading left to right and row by row)
        const before = ids.filter((x) => {
          if (x === tag.id) return false
          const r = rects.get(x)
          if (!r) return false
          return r.bottom < ev.clientY - 2 || (ev.clientY >= r.top - 2 && r.left + r.width / 2 < ev.clientX)
        }).length
        const others = ids.filter((x) => x !== tag.id)
        order = [...others.slice(0, before), tag.id, ...others.slice(before)]
        over = null
      } else {
        order = ids
        const hit = taskElementAt(ev.clientX, ev.clientY)
        over = hit && hit.id !== task.id ? hit : null
      }
      target = markTarget(over?.el ?? null, target, meta.hue)
      setCarry({ id: tag.id, kind: tag.kind, label: meta.label, hue: meta.hue, x: ev.clientX, y: ev.clientY, inside, order: inside ? order : null, over: over?.id ?? null })
    }
    const end = (ev: PointerEvent, cancelled: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      document.body.classList.remove('dragging')
      markTarget(null, target, 0)
      setCarry(null)
      if (!started && !cancelled && tag.kind === 'folder') {
        // pressed and released without dragging: bring that group (and this item) into view in whichever view is open
        useStore.getState().focusGroup(tag.id, task.id)
        return
      }
      if (!started || cancelled) return
      // the click that follows a drag must not do what a click on a tag does
      const swallow = (c: Event) => c.stopPropagation()
      window.addEventListener('click', swallow, { capture: true, once: true })
      window.setTimeout(() => window.removeEventListener('click', swallow, true), 50)
      if (inBox(ev.clientX, ev.clientY)) {
        if (order.some((x, i) => x !== ids[i])) updateTask(task.id, { tagOrder: order })
        return
      }
      if (!over) return
      const other = useStore.getState().tasks.find((t) => t.id === over!.id)
      if (!other) return
      const has = tag.kind === 'folder' ? other.folderIds.includes(tag.id) : other.personIds.includes(tag.id)
      const name = other.title || 'that item'
      if (has) return void showToast(`“${name}” already has ${meta.label}`)
      if (tag.kind === 'folder') addToFolder(other.id, tag.id)
      else addPerson(other.id, tag.id)
      confirmTag(other.id, over.el, meta.label, meta.hue)
      showToast(`Tagged “${name}” with ${meta.label}`)
    }
    const up = (ev: PointerEvent) => end(ev, false)
    const cancel = (ev: PointerEvent) => end(ev, true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }
  const chipState = (id: string): 'held' | 'stays' | undefined => (carry?.id !== id ? undefined : carry.inside ? 'held' : 'stays')
  // while one is held inside the box the tags are shown in the order it would leave them
  const shownTags = (() => {
    const all = tagsOf(task)
    if (!carry?.order) return all
    return carry.order.map((id) => all.find((t) => t.id === id)).filter((t): t is (typeof all)[number] => !!t)
  })()

  const choose = (i: number) => {
    const row = rows[i]
    if (!row) return
    if (row.kind === 'folder') addToFolder(task.id, row.id)
    else if (row.kind === 'person') addPerson(task.id, row.id)
    else if (row.kind === 'create-folder') addToFolder(task.id, ensureFolderPath(row.label))
    else addPerson(task.id, savePerson({ name: row.label }))
    setQ('')
    setCursor(0)
    inputRef.current?.focus()
  }

  return (
    <div ref={wrapRef} className="relative">
      <div ref={well} className="well flex flex-wrap items-center gap-1.5 rounded-2xl px-2.5 py-2">
        {shownTags.map((tag) => {
          if (tag.kind === 'folder') {
            const f = folders.find((x) => x.id === tag.id)
            if (!f) return null
            return (
              <Chip key={tag.id} id={tag.id} state={chipState(tag.id)} hue={f.hue} title={pathLabel(folders, tag.id)} onGrab={(e) => startCarry(e, tag)} onRemove={() => removeFromFolder(task.id, tag.id)}>
                {f.name}
              </Chip>
            )
          }
          const p = people.find((x) => x.id === tag.id)
          if (!p) return null
          return (
            <Chip key={tag.id} id={tag.id} state={chipState(tag.id)} hue={p.hue} onGrab={(e) => startCarry(e, tag)} onRemove={() => removePerson(task.id, tag.id)}>
              @{p.name.split(' ')[0]}
            </Chip>
          )
        })}
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setCursor(0)
            setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
            // once the on-screen keyboard has risen, bring the box (and its suggestions above it) into view
            window.setTimeout(() => wrapRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350)
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setCursor((c) => Math.min(rows.length - 1, c + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setCursor((c) => Math.max(0, c - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              choose(cursor)
            } else if (e.key === 'Backspace' && !q) {
              const last = tagsOf(task).at(-1)
              if (last?.kind === 'person') removePerson(task.id, last.id)
              else if (last) removeFromFolder(task.id, last.id)
            } else if (e.key === 'Escape') {
              setQ('')
              setOpen(false)
            }
          }}
          placeholder={task.folderIds.length + task.personIds.length ? 'add tag…' : 'Add a group, tag or @person…'}
          className="min-w-[8ch] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-ink-faint"
          aria-label="Add tag"
          data-proxy-enter
        />
      </div>

      {carry &&
        createPortal(
          // the tag carried by the pointer: inside the box it is the tag itself; outside it is a copy (a small + says so) and the original stays where it was
          <div className="pointer-events-none fixed z-[var(--z-drag)]" style={{ left: carry.x + 10, top: carry.y + 8 }}>
            <span className="chip-bubble inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-2.5 text-xs shadow-lg" style={{ ['--h' as string]: carry.hue < 0 ? 0 : carry.hue, ['--s' as string]: 1, transform: 'rotate(-2deg)' }}>
              {!carry.inside && <span className="font-bold">+</span>}
              {carry.label}
              {!carry.inside && carry.over && <span className="ml-1 font-normal opacity-70">tag this</span>}
            </span>
          </div>,
          document.body,
        )}

      {open && rows.length > 0 && (
        <ul className="glass glass-strong pop-in absolute inset-x-0 bottom-full z-30 mb-1.5 overflow-hidden rounded-2xl p-1.5 shadow-xl" style={{ ['--oy' as string]: '100%' }}>
          {rows.map((r, i) => (
            <li key={r.kind + r.label}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
                onMouseEnter={() => setCursor(i)}
                className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm transition ${i === cursor ? 'bg-lilac-100/80' : ''}`}
              >
                {r.kind === 'folder' || r.kind === 'person' ? (
                  <>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: `${tint(r.hue, 60, 72)}` }} />
                    <span className="truncate">
                      {r.kind === 'person' ? '@' : ''}
                      {r.label}
                    </span>
                    {fuzzyScore(leaf, r.label.split(' / ').pop()!) < 0.75 && <span className="ml-auto text-xs text-ink-faint">did you mean?</span>}
                  </>
                ) : (
                  <>
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-lilac-500 text-white">
                      <IconPlus size={12} />
                    </span>
                    <span className="truncate">
                      Create {r.kind === 'create-person' ? 'person ' : ''}
                      <b className="font-semibold">{r.kind === 'create-person' ? `@${r.label}` : r.label}</b>
                    </span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Chip({ id, state, hue, title, onGrab, onRemove, children }: { id: string; state?: 'held' | 'stays'; hue: number; title?: string; onGrab: (e: React.PointerEvent) => void; onRemove: () => void; children: React.ReactNode }) {
  // (held inside the box it is the gap the tag will fall into; taken out of the box it stays put, dashed, to show it is only a copy that is carried off)
  return (
    <span
      data-tag-chip={id}
      onPointerDown={onGrab}
      className={`chip-bubble pop-in inline-flex cursor-grab touch-none select-none items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1.5 text-xs transition-[opacity,outline-color] ${state === 'held' ? 'opacity-40' : ''} ${state === 'stays' ? 'outline outline-2 outline-offset-2 outline-dashed' : ''}`}
      style={{ ['--h' as string]: hue < 0 ? 0 : hue, ['--s' as string]: hue < 0 ? 0 : 1, ...(state === 'stays' ? { outlineColor: `hsl(${hue < 0 ? 0 : hue} 55% 60% / .8)` } : {}) }}
      title={title}
    >
      {children}
      <button className="rounded-full p-0.5 opacity-50 transition hover:bg-white/60 hover:opacity-100" onClick={onRemove} aria-label="Remove tag">
        <IconClose size={11} />
      </button>
    </span>
  )
}
