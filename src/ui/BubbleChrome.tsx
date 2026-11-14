import { contactLink, detectContactIntent } from '../core/people'
import { habitStreak } from '../core/tasks'
import type { Task } from '../core/types'
import { useStore } from '../state/store'
import { IconBell, IconChat, IconMail, IconPhone, IconPin, KindIcon } from './icons'
import { hasProgress, progressOf } from '../core/progress'
import { isDoneNow } from '../core/recurrence'
import { DoneButton, TallyIncrement } from './shared'

/**
 * What every bubble carries, in the pond and on the priority grid alike: the item's type at the top, the checkbox fixed at
 * the bottom centre whatever else there is, and the extras (call / email, reminder bell, habit streak, list count) riding
 * the bottom arc either side of it. It is laid out for radius `r`, and scales with the bubble's `--r` variable if that
 * changes while it is being dragged (the priority grid resizes bubbles as you carry them).
 */
export function BubbleChrome({ task, r: radius, minExtras = 0, floor = 44, hideImageOnlyCheckbox = false }: { task: Task; r: number; minExtras?: number; floor?: number; hideImageOnlyCheckbox?: boolean }) {
  // laid out as if the bubble were at least this big, then scaled down to fit: a small bubble gets a small, still-legible set
  const r = Math.max(radius, floor)
  const person = useStore((s) => s.people.find((p) => task.personIds.includes(p.id) && (p.phone || p.email)))
  // the check circle grows with the bubble, but stays a modest size
  const cb = Math.round(Math.max(r >= 44 ? 22 : 16, Math.min(28, r * 0.4)))
  const verb = detectContactIntent(task.title)?.verb
  const link = person && verb ? contactLink(verb, person) : null
  // call / email / message: a little smaller than the checkbox
  const link_d = Math.round(cb * 0.68)
  // the little extras, placed along the bottom arc either side of the checkbox (right first, then left, alternating)
  const extras: { key: string; w: number; node: React.ReactNode }[] = []
  if (link)
    extras.push({
      key: 'link',
      w: link_d,
      node: (
        <a
          href={link.href}
          title={`${link.label} ${person!.name.split(' ')[0]}`}
          aria-label={`${link.label} ${person!.name}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="pop-in grid shrink-0 place-items-center rounded-full bg-lilac-500 text-white shadow-md shadow-lilac-500/40 transition hover:scale-110 hover:bg-lilac-600"
          style={{ width: link_d, height: link_d }}
        >
          {link.label === 'Email' ? <IconMail size={9} /> : link.label === 'Text' ? <IconChat size={9} /> : <IconPhone size={9} />}
        </a>
      ),
    })
  if ((task.remindAt !== null && !task.reminded) || (task.dueRemindAt != null && !task.dueReminded) || (task.alerts?.length ?? 0) > 0)
    extras.push({ key: 'bell', w: 13, node: <span title="Reminder set" role="img" aria-label="Reminder set" className="text-lilac-500"><IconBell size={13} /></span> })
  if (task.place.trim())
    extras.push({ key: 'pin', w: 13, node: <span title={task.place} role="img" aria-label={`At ${task.place}`} className="text-lilac-500"><IconPin size={13} /></span> })
  if ((!!task.repeat || task.kind === 'habit') && habitStreak(task) > 0)
    extras.push({ key: 'streak', w: 24, node: <span title={`${habitStreak(task)}-day streak`} className="flex items-center gap-0.5 text-[0.6rem] tabular-nums text-lilac-600">↻ {habitStreak(task)}</span> })
  if (task.kind === 'list')
    extras.push({
      key: 'list',
      w: 28,
      node: (
        <span title="List" className="flex items-center gap-0.5 text-[0.6rem] tabular-nums text-lilac-600">
          {task.listStyle === 'check' && task.items.length > 0 ? `${task.items.filter((i) => i.done).length}/${task.items.length}` : task.items.length || ''}
        </span>
      ),
    })
  // the checkbox's centre is `rho` from the bubble's centre; each extra sits on that same circle, `dx` to one side
  const rho = 0.86 * r - cb / 2
  const reach = { 1: cb / 2 + 6, [-1]: cb / 2 + 6 } as Record<number, number>
  const arc = (radius >= minExtras ? extras : []).map((it, i) => {
    // call / email / message sit on the left; everything else alternates, starting on the right
    const side = it.key === 'link' ? -1 : (link ? i - 1 : i) % 2 === 0 ? 1 : -1
    const dx = reach[side] + it.w / 2
    reach[side] += it.w + 6
    const d = Math.min(dx, rho * 0.97)
    return { ...it, x: r + side * d, y: r + Math.sqrt(Math.max(0, rho * rho - d * d)) }
  })


  return (
    // laid out in a square of its own, 2r across (the size the positions below were worked out for), centred on the bubble and
    // scaled to the bubble's real radius: so everything keeps its place whatever size the bubble is (or is being dragged to)
    <span aria-hidden={false} className="pointer-events-none absolute left-1/2 top-1/2" style={{ width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r, transform: `scale(calc(var(--r, ${radius}) / ${r}))` }}>
      {/* the type icon is left off a picture that already says what it is: a thought that is only a photo, and a task (its check box says so) */}
      {!(task.image && ((task.kind === 'idea' && !task.title.trim()) || task.kind === 'task')) && (
        <span title={task.kind} className="absolute left-1/2 top-[5.5%] -translate-x-1/2 text-lilac-600/70" aria-hidden>
          <KindIcon kind={task.kind} size={Math.round(Math.max(12, Math.min(16, r * 0.19)))} />
        </span>
      )}
      <ProgressArc task={task} r={r} />
      {task.tally && <span className="pointer-events-auto absolute bottom-[22%] right-[8%]"><TallyIncrement task={task} compact /></span>}
      {!(hideImageOnlyCheckbox && task.image && !task.title.trim()) && (
        <span className="pointer-events-auto absolute bottom-[7%] left-1/2 -translate-x-1/2">
          <DoneButton task={task} size={cb} />
        </span>
      )}
      {arc.map((it) => (
        <span key={it.key} className="pointer-events-auto absolute flex items-center" style={{ left: it.x, top: it.y, transform: 'translate(-50%, -50%)' }}>
          {it.node}
        </span>
      ))}
    </span>
  )
}

/**
 * How far along an item is, as a short arc hugging the bottom of the bubble, under the checkbox and almost touching the rim, filling from
 * left to right. (A curve that follows the bubble, not a smile: it is a thin line, the same width all along, with a faint track.) Only
 * for items that have progress; at 0% or when done there is nothing to show.
 */
function ProgressArc({ task, r }: { task: Task; r: number }) {
  if (!hasProgress(task.kind) || isDoneNow(task)) return null
  const pct = progressOf(task)
  if (pct <= 0) return null
  const sw = Math.max(2.5, r * 0.045)
  const R = r - sw / 2 - r * 0.03
  const span = 124 // degrees of rim it covers, centred on the very bottom
  const at = (deg: number) => [r + R * Math.cos((deg * Math.PI) / 180), r + R * Math.sin((deg * Math.PI) / 180)]
  const [lx, ly] = at(90 + span / 2) // the left end (SVG angles run clockwise from 3 o'clock, so the bottom is 90)
  const [rx, ry] = at(90 - span / 2)
  const [px, py] = at(90 + span / 2 - (span * Math.min(100, pct)) / 100)
  return (
    <svg aria-hidden width={r * 2} height={r * 2} viewBox={`0 0 ${r * 2} ${r * 2}`} className="pointer-events-none absolute left-0 top-0 overflow-visible">
      <path d={`M${lx},${ly} A${R},${R} 0 0 0 ${rx},${ry}`} fill="none" style={{ stroke: 'hsla(var(--h, 285), calc(50% * var(--s, 1)), 62%, 0.22)' }} strokeWidth={sw} strokeLinecap="round" />
      <path d={`M${lx},${ly} A${R},${R} 0 0 0 ${px},${py}`} fill="none" style={{ stroke: 'hsl(var(--h, 285), calc(58% * var(--s, 1)), 58%)' }} strokeWidth={sw} strokeLinecap="round" />
    </svg>
  )
}
