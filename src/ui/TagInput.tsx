import { useMemo, useRef, useState } from 'react'
import { pathLabel } from '../core/folders'
import { fuzzyRank, fuzzyScore, sameName } from '../core/fuzzy'
import { useStore } from '../state/store'
import { IconClose, IconPlus } from './icons'

/**
 * Tags are folders. Type to find one (typo-tolerant); if nothing matches
 * exactly, a + row offers to create it. "School/Essays" creates a nested path.
 */
export function TagInput({ taskId }: { taskId: string }) {
  const task = useStore((s) => s.tasks.find((t) => t.id === taskId))
  const folders = useStore((s) => s.folders)
  const addToFolder = useStore((s) => s.addToFolder)
  const removeFromFolder = useStore((s) => s.removeFromFolder)
  const ensureFolderPath = useStore((s) => s.ensureFolderPath)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const labelled = useMemo(
    () => folders.map((f) => ({ f, label: pathLabel(folders, f.id) })),
    [folders],
  )

  const query = q.trim().replace(/^#/, '')
  const leaf = query.split('/').pop()!.trim()

  const matches = useMemo(() => {
    if (!leaf) return []
    const pool = labelled.filter((x) => !task?.folderIds.includes(x.f.id))
    const ranked = fuzzyRank(leaf, pool, (x) => x.f.name)
    // path-style queries ("school/eng") match against the full label too
    const byPath = query.includes('/') ? fuzzyRank(query, pool, (x) => x.label, 0.5) : []
    return [...new Set([...byPath, ...ranked])].slice(0, 5)
  }, [leaf, query, labelled, task])

  const exact = labelled.some((x) => sameName(x.label, query) || (!query.includes('/') && sameName(x.f.name, query)))
  const canCreate = !!leaf && !exact
  const rows = [
    ...matches.map((m) => ({ kind: 'existing' as const, id: m.f.id, label: m.label, hue: m.f.hue })),
    ...(canCreate ? [{ kind: 'create' as const, id: '', label: query, hue: 285 }] : []),
  ]

  if (!task) return null

  const choose = (i: number) => {
    const row = rows[i]
    if (!row) return
    const id = row.kind === 'existing' ? row.id : ensureFolderPath(row.label)
    addToFolder(task.id, id)
    setQ('')
    setCursor(0)
    inputRef.current?.focus()
  }

  return (
    <div className="relative">
      <div className="glass-soft flex flex-wrap items-center gap-1.5 rounded-2xl px-2.5 py-2">
        {task.folderIds.map((fid) => {
          const f = folders.find((x) => x.id === fid)
          if (!f) return null
          return (
            <span
              key={fid}
              className="group inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1.5 text-xs"
              style={{ background: `hsla(${f.hue},70%,88%,.8)`, color: `hsl(${f.hue},35%,32%)` }}
              title={pathLabel(folders, fid)}
            >
              {f.name}
              <button
                className="rounded-full p-0.5 opacity-50 transition hover:bg-white/60 hover:opacity-100"
                onClick={() => removeFromFolder(task.id, fid)}
                aria-label={`Remove ${f.name}`}
              >
                <IconClose size={11} />
              </button>
            </span>
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
          onFocus={() => setOpen(true)}
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
            } else if (e.key === 'Backspace' && !q && task.folderIds.length) {
              removeFromFolder(task.id, task.folderIds[task.folderIds.length - 1])
            } else if (e.key === 'Escape') {
              setQ('')
              setOpen(false)
            }
          }}
          placeholder={task.folderIds.length ? 'add tag…' : 'Add to a folder or tag…'}
          className="min-w-[8ch] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-ink-faint"
          aria-label="Add tag"
        />
      </div>

      {open && rows.length > 0 && (
        <ul className="glass absolute inset-x-0 bottom-full z-30 mb-1.5 overflow-hidden rounded-2xl p-1.5 shadow-xl">
          {rows.map((r, i) => (
            <li key={r.kind + r.label}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
                onMouseEnter={() => setCursor(i)}
                className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm transition ${
                  i === cursor ? 'bg-lilac-100/80' : ''
                }`}
              >
                {r.kind === 'existing' ? (
                  <>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: `hsl(${r.hue},60%,72%)` }} />
                    <span className="truncate">{r.label}</span>
                    {fuzzyScore(leaf, r.label.split(' / ').pop()!) < 0.75 && (
                      <span className="ml-auto text-xs text-ink-faint">did you mean?</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-lilac-500 text-white">
                      <IconPlus size={12} />
                    </span>
                    <span className="truncate">
                      Create <b className="font-semibold">{r.label}</b>
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
