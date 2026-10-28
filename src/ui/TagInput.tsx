import { useMemo, useRef, useState } from 'react'
import { tint } from '../core/color'
import { pathLabel } from '../core/folders'
import { fuzzyRank, fuzzyScore, sameName } from '../core/fuzzy'
import { useStore } from '../state/store'
import { IconClose, IconPlus } from './icons'

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

  const labelled = useMemo(() => folders.map((f) => ({ f, label: pathLabel(folders, f.id) })), [folders])

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
      const pool = labelled.filter((x) => !task.folderIds.includes(x.f.id))
      const ranked = fuzzyRank(leaf, pool, (x) => x.f.name)
      const byPath = query.includes('/') ? fuzzyRank(query, pool, (x) => x.label, 0.5) : []
      for (const m of [...new Set([...byPath, ...ranked])].slice(0, 4)) out.push({ kind: 'folder', id: m.f.id, label: m.label, hue: m.f.hue })
    }
    out.push(...ppl)
    if (!peopleOnly) {
      const exact = labelled.some((x) => sameName(x.label, query) || (!query.includes('/') && sameName(x.f.name, query)))
      if (!exact) out.push({ kind: 'create-folder', label: query })
    }
    if (!people.some((p) => sameName(p.name, leaf))) out.push({ kind: 'create-person', label: leaf })
    return out
  }, [task, leaf, query, people, labelled, peopleOnly])

  if (!task) return null

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
      <div className="well flex flex-wrap items-center gap-1.5 rounded-2xl px-2.5 py-2">
        {task.folderIds.map((fid) => {
          const f = folders.find((x) => x.id === fid)
          if (!f) return null
          return (
            <Chip key={fid} hue={f.hue} title={pathLabel(folders, fid)} onRemove={() => removeFromFolder(task.id, fid)}>
              {f.name}
            </Chip>
          )
        })}
        {task.personIds.map((pid) => {
          const p = people.find((x) => x.id === pid)
          if (!p) return null
          return (
            <Chip key={pid} hue={p.hue} onRemove={() => removePerson(task.id, pid)}>
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
              if (task.personIds.length) removePerson(task.id, task.personIds[task.personIds.length - 1])
              else if (task.folderIds.length) removeFromFolder(task.id, task.folderIds[task.folderIds.length - 1])
            } else if (e.key === 'Escape') {
              setQ('')
              setOpen(false)
            }
          }}
          placeholder={task.folderIds.length + task.personIds.length ? 'add tag…' : 'Add a group, tag or @person…'}
          className="min-w-[8ch] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-ink-faint"
          aria-label="Add tag"
        />
      </div>

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

function Chip({ hue, title, onRemove, children }: { hue: number; title?: string; onRemove: () => void; children: React.ReactNode }) {
  return (
    <span
      className="pop-in inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1.5 text-xs"
      style={{ background: `${tint(hue, 70, 88, .8)}`, color: `${tint(hue, 35, 32)}` }}
      title={title}
    >
      {children}
      <button className="rounded-full p-0.5 opacity-50 transition hover:bg-white/60 hover:opacity-100" onClick={onRemove} aria-label="Remove tag">
        <IconClose size={11} />
      </button>
    </span>
  )
}
