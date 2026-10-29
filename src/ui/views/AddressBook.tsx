import { useMemo, useState } from 'react'
import { formatDate } from '../../core/locale'
import { tint } from '../../core/color'
import { fuzzyScore } from '../../core/fuzzy'
import { useStore } from '../../state/store'
import { IconHeart, IconPlus } from '../icons'
import { openPerson } from '../PeopleDialogs'
import { allCategories } from '../../core/people'
import { CountBubble } from '../shared'
import { Tip } from '../Tip'

/** Everyone you know. Heart the ones who should be one tap away in the sidebar. */
export function AddressBook() {
  const people = useStore((s) => s.people)
  const allTasks = useStore((s) => s.tasks)
  const tasks = useMemo(() => allTasks.filter((t) => !t.draft), [allTasks])
  const toggle = useStore((s) => s.togglePersonFavorite)
  const setScope = useStore((s) => s.setScope)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const cats = allCategories(people)

  const rows = useMemo(() => {
    const t = q.trim()
    const inCat = cat ? people.filter((p) => (p.categories ?? []).some((c) => c.toLowerCase() === cat.toLowerCase())) : people
    const list = t ? inCat.filter((p) => `${p.name} ${p.email} ${p.phone} ${(p.extras ?? []).map((x) => x.value).join(' ')}`.toLowerCase().includes(t.toLowerCase()) || fuzzyScore(t, p.name) >= 0.6) : inCat
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [people, q, cat])
  const groups = useMemo(() => {
    const m = new Map<string, typeof rows>()
    for (const p of rows) {
      const k = (p.name[0] ?? '#').toUpperCase()
      m.set(k, [...(m.get(k) ?? []), p])
    }
    return [...m]
  }, [rows])

  return (
    <div className="glass flex h-full min-h-0 flex-col rounded-[2rem] p-4 md:p-5">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people…"
          aria-label="Search people"
          className="well min-w-0 flex-1 rounded-xl px-3.5 py-2 text-sm placeholder:text-ink-faint"
        />
        <Tip label="Add a person">
          <button onClick={() => openPerson()} aria-label="Add a person" className="grid h-9 w-9 place-items-center rounded-full bg-lilac-500 text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600">
            <IconPlus size={16} />
          </button>
        </Tip>
      </div>
      <div className="no-scrollbar mt-2.5 flex items-center gap-1.5 overflow-x-auto py-0.5" role="group" aria-label="Category">
        {[null, ...cats].map((c) => (
          <button
            key={c ?? 'all'}
            onClick={() => setCat(c)}
            aria-pressed={cat === c}
            className={`shrink-0 rounded-full px-3 py-1 text-xs transition ${cat === c ? 'bg-lilac-500 text-white shadow shadow-lilac-500/30' : 'bg-white/50 text-ink-soft hover:bg-white/80'}`}
          >
            {c ?? 'All'}
          </button>
        ))}
      </div>
      <div className="scroll-soft mt-2 min-h-0 flex-1 overflow-y-auto">
        {groups.map(([letter, list]) => (
          <section key={letter} className="mb-2">
            <h3 className="px-2 pb-0.5 font-display text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">{letter}</h3>
            {list.map((p) => {
              const n = tasks.filter((t) => t.personIds.includes(p.id) && t.status !== 'done').length
              return (
                <div key={p.id} className="group flex items-center gap-3 rounded-2xl px-2 py-1.5 transition hover:bg-white/50">
                  <button onClick={() => openPerson({ id: p.id })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold" style={{ background: tint(p.hue, 65, 86), color: tint(p.hue, 38, 32) }}>
                      {p.name[0]?.toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[0.95rem]">
                        {p.name}
                        {p.isMe && <span className="ml-1.5 rounded-full bg-lilac-100 px-1.5 py-0.5 align-middle text-[0.62rem] font-medium text-lilac-700">Me</span>}
                      </span>
                      <span className="block truncate text-xs text-ink-soft">{[...(p.categories ?? []), p.phone, p.email, p.birthday ? `Birthday ${formatDate(p.birthday)}` : ''].filter(Boolean).join(' · ') || 'No details yet'}</span>
                    </span>
                  </button>
                  <button onClick={() => setScope({ type: 'person', id: p.id })} className="shrink-0 transition hover:scale-110" title="Show their open tasks" aria-label={`${n} open tasks for ${p.name}`}>
                    <CountBubble n={n} />
                  </button>
                  <Tip label={p.favorite ? 'Remove from sidebar' : 'Keep in the sidebar'}>
                    <button
                      onClick={() => toggle(p.id)}
                      aria-pressed={p.favorite}
                      aria-label={p.favorite ? `Unfavorite ${p.name}` : `Favorite ${p.name}`}
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition hover:bg-white/70 ${p.favorite ? 'text-lilac-500' : 'text-ink-faint'}`}
                    >
                      <IconHeart size={18} filled={p.favorite} />
                    </button>
                  </Tip>
                </div>
              )
            })}
          </section>
        ))}
        {rows.length === 0 && <p className="px-3 py-8 text-center font-display text-lg italic text-ink-faint">{people.length ? 'No one by that name.' : 'No one yet. Add the people you keep in touch with.'}</p>}
      </div>
    </div>
  )
}
