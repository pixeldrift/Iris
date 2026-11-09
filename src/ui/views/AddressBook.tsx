import { useMemo, useState } from 'react'
import { formatBirthday } from '../../core/locale'
import { fuzzyScore } from '../../core/fuzzy'
import { useStore } from '../../state/store'
import { IconHeart, IconLink, IconPlus } from '../icons'
import { openPerson } from '../PeopleDialogs'
import { allCategories, wantsLetters } from '../../core/people'
import { SegmentedToggle } from '../SegmentedToggle'
import { Avatar, CountBubble } from '../shared'
import { Tip } from '../Tip'

// the toggle names groups of people, so the presets read as plurals (a category itself stays as it was typed)
const PLURAL: Record<string, string> = { friend: 'Friends', coworker: 'Coworkers', colleague: 'Colleagues', neighbor: 'Neighbors', classmate: 'Classmates', relative: 'Relatives' }

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
  // judged on the whole book, so the headings don't come and go as you search or filter
  const letters = wantsLetters(people)

  const rows = useMemo(() => {
    const t = q.trim()
    const inCat = cat ? people.filter((p) => (p.categories ?? []).some((c) => c.toLowerCase() === cat.toLowerCase())) : people
    const list = t ? inCat.filter((p) => `${p.name} ${p.company ?? ''} ${p.email} ${p.phone} ${(p.extras ?? []).map((x) => x.value).join(' ')}`.toLowerCase().includes(t.toLowerCase()) || fuzzyScore(t, p.name) >= 0.6) : inCat
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [people, q, cat])
  // how many open tasks each person has, counted once rather than for every row
  const open = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of tasks) if (t.status !== 'done') for (const id of t.personIds) m.set(id, (m.get(id) ?? 0) + 1)
    return m
  }, [tasks])
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
      {/* desktop: search, categories and add on one line; a phone puts the categories on a line of their own */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people…"
          aria-label="Search people"
          className="well order-1 min-w-0 flex-1 rounded-xl px-3.5 py-2 text-sm placeholder:text-ink-faint md:max-w-64 md:flex-none md:basis-64"
        />
        <div className="order-3 min-w-0 basis-full md:order-2 md:basis-auto">
          <SegmentedToggle
            label="Category"
            value={cat ?? '__all'}
            options={[{ id: '__all', label: 'All' }, ...cats.map((c) => ({ id: c, label: PLURAL[c.toLowerCase()] ?? c }))]}
            onChange={(v) => setCat(v === '__all' ? null : v)}
          />
        </div>
        <Tip label="Add a person">
          <button onClick={() => openPerson()} aria-label="Add a person" className="order-2 grid h-9 w-9 place-items-center rounded-full bg-lilac-500 text-white shadow-md shadow-lilac-500/30 transition hover:bg-lilac-600 md:order-3 md:ml-auto">
            <IconPlus size={16} />
          </button>
        </Tip>
      </div>
      <div className="scroll-soft mt-2 min-h-0 flex-1 overflow-y-auto">
        {groups.map(([letter, list]) => (
          <section key={letter} className="mb-2">
            {letters && <h3 className="px-2 pb-0.5 font-display text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">{letter}</h3>}
            {list.map((p) => {
              const n = open.get(p.id) ?? 0
              return (
                <div key={p.id} className="group flex items-center gap-3 rounded-2xl px-2 py-1.5 transition hover:bg-white/50">
                  <button onClick={() => openPerson({ id: p.id })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Avatar person={p} size={36} />
                    <span className="min-w-0">
                      <span className="block truncate text-[0.95rem]">
                        {p.name}
                        {p.link && (
                          <span className="ml-1.5 inline-block align-middle text-lilac-500" title="Connected: kept up to date by them" role="img" aria-label="Connected">
                            <IconLink size={13} />
                          </span>
                        )}
                        {p.isMe && <span className="ml-1.5 rounded-full bg-lilac-100 px-1.5 py-0.5 align-middle text-[0.62rem] font-medium text-lilac-700">Me</span>}
                      </span>
                      <span className="block truncate text-xs text-ink-soft">{[...(p.categories ?? []), p.company, p.phone, p.email, p.birthday ? `Birthday ${formatBirthday(p.birthday)}` : ''].filter(Boolean).join(' · ') || 'No details yet'}</span>
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
