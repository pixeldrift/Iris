import { useMemo, useState } from 'react'
import { tint } from '../../core/color'
import { fromISO, MONTHS, today, WEEKDAYS } from '../../core/dates'
import { formatDate } from '../../core/locale'
import { completionsByDay, completionsByMonth, groupTotals, streakStats, summarize, windowFor } from '../../core/overview'
import { repeatOf } from '../../core/recurrence'
import type { Task } from '../../core/types'
import { useStore } from '../../state/store'
import { IconChevron } from '../icons'
import { ScrollFade } from '../ScrollFade'
import { SegmentedToggle } from '../SegmentedToggle'
import { useVisibleTasks } from '../useVisible'

type Range = 'week' | 'month' | 'year'
const RANGES = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
] as const

const windowLabel = (range: Range, from: string, to: string) =>
  range === 'year' ? from.slice(0, 4) : range === 'month' ? `${MONTHS[fromISO(from).getMonth()]} ${from.slice(0, 4)}` : `${formatDate(from)} – ${formatDate(to)}`

/** A bar chart of completions: one bar per day (week, month) or per month (year). */
function Bars({ counts, range, now }: { counts: Map<string, number>; range: Range; now: string }) {
  const entries = [...counts.entries()]
  const max = Math.max(3, ...entries.map(([, n]) => n))
  const label = (key: string) => {
    if (range === 'year') return MONTHS[Number(key.slice(5)) - 1][0]
    if (range === 'week') return WEEKDAYS[fromISO(key).getDay()].slice(0, 3)
    const day = Number(key.slice(8))
    return day === 1 || day % 5 === 0 ? String(day) : ''
  }
  const nowKey = range === 'year' ? now.slice(0, 7) : now
  const pretty = (key: string) => (range === 'year' ? `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}` : formatDate(key, { weekday: true }))
  return (
    <div role="img" aria-label={`Items completed: ${entries.map(([k, n]) => `${pretty(k)} ${n}`).join(', ')}`} className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 flex h-40 flex-col justify-between text-[0.6rem] tabular-nums text-ink-faint/70">
        {[max, Math.round(max / 2), 0].map((v, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-4 text-right">{v}</span>
            <span className="h-px flex-1 bg-lilac-200/60" />
          </div>
        ))}
      </div>
      <div className="relative ml-6 flex h-40 items-end gap-[3px]">
        {entries.map(([key, n]) => (
          <div key={key} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${pretty(key)}: ${n}`}>
            <div
              className={`w-full rounded-t-md transition-all ${n === 0 ? 'bg-lilac-200/50' : 'bg-gradient-to-t from-lilac-400 to-lilac-300'} ${key === nowKey ? 'ring-2 ring-lilac-500/70' : ''}`}
              style={{ height: n === 0 ? 3 : `${Math.max(6, (n / max) * 100)}%` }}
            />
            {(range === 'week' || range === 'year') && n > 0 && <span className="absolute -top-4 left-0 right-0 text-center text-[0.65rem] tabular-nums text-lilac-700">{n}</span>}
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[0.62rem] text-ink-faint">{label(key)}</span>
          </div>
        ))}
      </div>
      <div className="h-6" />
    </div>
  )
}

function Tile({ big, small, hint }: { big: string; small: string; hint?: string }) {
  return (
    <div className="glass-soft min-w-0 flex-1 rounded-2xl px-3.5 py-2.5">
      <div className="font-display text-2xl leading-none text-lilac-700">{big}</div>
      <div className="mt-1 text-xs text-ink-soft">{small}</div>
      {hint && <div className="truncate text-[0.68rem] text-ink-faint">{hint}</div>}
    </div>
  )
}

function Streak({ task, hue, now }: { task: Task; hue: number | null; now: string }) {
  const s = useMemo(() => streakStats(task, now), [task, now])
  return (
    <li className="glass-soft flex items-center gap-3 rounded-2xl px-3.5 py-2.5">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: hue === null ? 'var(--color-lilac-400)' : tint(hue, 62, 66) }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{task.title}</div>
        <div className="text-xs text-ink-soft">
          <span className="font-medium text-lilac-700">{s.current}</span> in a row · best {s.longest}
        </div>
      </div>
      {/* the last two weeks: filled = done, ring = due and missed, faint = not due */}
      <div className="hidden shrink-0 items-center gap-[3px] sm:flex" aria-label="The last two weeks">
        {s.recent.map((d) => (
          <span
            key={d.date}
            title={`${formatDate(d.date, { weekday: true })}: ${d.done ? 'done' : d.due ? 'missed' : 'not due'}`}
            className={`h-3 w-3 rounded-full ${d.done ? '' : d.due ? 'border-[1.5px]' : 'opacity-30'}`}
            style={d.done ? { background: hue === null ? 'var(--color-lilac-500)' : tint(hue, 62, 62) } : { borderColor: hue === null ? 'var(--color-lilac-300)' : tint(hue, 62, 74), background: d.due ? 'transparent' : hue === null ? 'var(--color-lilac-200)' : tint(hue, 50, 88) }}
          />
        ))}
      </div>
    </li>
  )
}

/** How you're doing over time: what got finished, which habits are on a run, and where the effort went. */
export function Overview() {
  const tasks = useVisibleTasks(true)
  const folders = useStore((s) => s.folders)
  const [range, setRange] = useState<Range>('month')
  const [offset, setOffset] = useState(0)
  const now = today()
  const win = windowFor(range, now, offset)
  // never past the present window: a later window is empty by definition
  const counts = useMemo(() => (range === 'year' ? completionsByMonth(tasks, win.from, win.to) : completionsByDay(tasks, win.from, win.to)), [tasks, range, win.from, win.to])
  const daily = useMemo(() => completionsByDay(tasks, win.from, win.to), [tasks, win.from, win.to])
  const sum = summarize(daily)
  const groups = useMemo(() => groupTotals(tasks, folders, win.from, win.to), [tasks, folders, win.from, win.to])
  const habits = useMemo(
    () =>
      tasks
        .filter((t) => repeatOf(t))
        .map((t) => ({ task: t, current: streakStats(t, now).current }))
        .sort((a, b) => b.current - a.current),
    [tasks, now],
  )
  const hueOf = (t: Task) => folders.find((f) => f.id === t.folderIds[0])?.hue ?? null
  const longestRun = habits[0]?.current ?? 0
  const maxGroup = Math.max(1, ...groups.map((g) => g.count))
  const spanDays = Math.min(sum.days, Math.max(1, range === 'year' ? 365 : sum.days))

  return (
    <div className="glass mx-auto flex h-full max-w-3xl flex-col rounded-[2rem] p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SegmentedToggle label="Range" value={range} options={RANGES} onChange={(r) => (setRange(r), setOffset(0))} />
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setOffset((o) => o - 1)} aria-label="Earlier" className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/60">
            <span className="inline-grid rotate-180 place-items-center">
              <IconChevron />
            </span>
          </button>
          <span className="min-w-[8.5rem] text-center text-sm font-medium text-lilac-700">{windowLabel(range, win.from, win.to)}</span>
          <button onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} aria-label="Later" className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/60 disabled:opacity-30">
            <IconChevron />
          </button>
        </div>
      </div>

      <ScrollFade className="pr-2">
        <div className="space-y-5 pb-3">
          <div className="flex flex-wrap gap-2">
            <Tile big={String(sum.total)} small="finished" hint={sum.total ? `${(sum.total / Math.max(1, sum.activeDays)).toFixed(1)} on a busy day` : undefined} />
            <Tile big={String(sum.activeDays)} small={sum.activeDays === 1 ? 'active day' : 'active days'} hint={`of ${spanDays}`} />
            <Tile big={sum.best ? String(sum.best.count) : '–'} small="best day" hint={sum.best ? formatDate(sum.best.date, { weekday: true }) : undefined} />
            <Tile big={String(longestRun)} small="longest run now" hint={habits[0] && longestRun > 0 ? habits[0].task.title : 'habits and repeats'} />
          </div>

          <section aria-label="Finished over time">
            <h3 className="mb-6 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">Finished {range === 'year' ? 'each month' : 'each day'}</h3>
            {sum.total === 0 ? <p className="py-8 text-center font-display text-lg italic text-ink-faint">Nothing finished in this period yet.</p> : <Bars counts={counts} range={range} now={now} />}
          </section>

          {habits.length > 0 && (
            <section aria-label="Streaks">
              <h3 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">Streaks</h3>
              <ul className="space-y-2">
                {habits.map(({ task }) => (
                  <Streak key={task.id} task={task} hue={hueOf(task)} now={now} />
                ))}
              </ul>
            </section>
          )}

          {groups.length > 0 && (
            <section aria-label="By group">
              <h3 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">Where it went</h3>
              <ul className="space-y-1.5">
                {groups.map((g) => (
                  <li key={g.id ?? 'none'} className="flex items-center gap-2.5 text-sm">
                    <span className="w-28 shrink-0 truncate">{g.name}</span>
                    <span className="h-3 flex-1 overflow-hidden rounded-full bg-white/50">
                      <span className="block h-full rounded-full" style={{ width: `${(g.count / maxGroup) * 100}%`, background: g.hue === null ? 'var(--color-lilac-300)' : tint(g.hue, 62, 72) }} />
                    </span>
                    <span className="w-6 text-right tabular-nums text-ink-soft">{g.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </ScrollFade>
    </div>
  )
}
