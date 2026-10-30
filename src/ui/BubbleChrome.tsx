import { contactLink, detectContactIntent } from '../core/people'
import { habitStreak } from '../core/tasks'
import type { Task } from '../core/types'
import { useStore } from '../state/store'
import { IconBell, IconChat, IconList, IconMail, IconPhone, KindIcon } from './icons'
import { DoneButton } from './shared'

/**
 * What every bubble carries, in the pond and on the priority grid alike: the item's type at the top, the checkbox fixed at
 * the bottom centre whatever else there is, and the extras (call / email, reminder bell, habit streak, list count) riding
 * the bottom arc either side of it. It is laid out for radius `r`, and scales with the bubble's `--r` variable if that
 * changes while it is being dragged (the priority grid resizes bubbles as you carry them).
 */
export function BubbleChrome({ task, r: radius, minIcon = 46, minExtras = 0, floor = 44 }: { task: Task; r: number; minIcon?: number; minExtras?: number; floor?: number }) {
  // laid out as if the bubble were at least this big, then scaled down to fit: a small bubble gets a small, still-legible set
  const r = Math.max(radius, floor)
  const person = useStore((s) => s.people.find((p) => task.personIds.includes(p.id) && (p.phone || p.email)))
  // the check circle grows with the bubble, but stays a modest size
  const cb = Math.round(Math.max(r >= 44 ? 22 : 16, Math.min(28, r * 0.4)))
  const verb = detectContactIntent(task.title)?.verb
  const link = person && verb ? contactLink(verb, person) : null
  // the little extras, placed along the bottom arc either side of the checkbox (right first, then left, alternating)
  const extras: { key: string; w: number; node: React.ReactNode }[] = []
  if (link)
    extras.push({
      key: 'link',
      w: cb,
      node: (
        <a
          href={link.href}
          title={`${link.label} ${person!.name.split(' ')[0]}`}
          aria-label={`${link.label} ${person!.name}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="pop-in grid shrink-0 place-items-center rounded-full bg-lilac-500 text-white shadow-md shadow-lilac-500/40 transition hover:scale-110 hover:bg-lilac-600"
          style={{ width: cb, height: cb }}
        >
          {link.label === 'Email' ? <IconMail size={13} /> : link.label === 'Text' ? <IconChat size={13} /> : <IconPhone size={13} />}
        </a>
      ),
    })
  if ((task.remindAt !== null && !task.reminded) || (task.alerts?.length ?? 0) > 0)
    extras.push({ key: 'bell', w: 15, node: <span title="Reminder set" role="img" aria-label="Reminder set" className="text-lilac-500"><IconBell size={15} /></span> })
  if ((!!task.repeat || task.kind === 'habit') && habitStreak(task) > 0)
    extras.push({ key: 'streak', w: 28, node: <span title={`${habitStreak(task)}-day streak`} className="flex items-center gap-0.5 text-[0.7rem] tabular-nums text-lilac-600">↻ {habitStreak(task)}</span> })
  if (task.kind === 'list')
    extras.push({
      key: 'list',
      w: 34,
      node: (
        <span title="List" className="flex items-center gap-0.5 text-[0.7rem] tabular-nums text-lilac-600">
          <IconList size={14} />
          {task.listStyle === 'check' && task.items.length > 0 ? `${task.items.filter((i) => i.done).length}/${task.items.length}` : task.items.length || ''}
        </span>
      ),
    })
  // the checkbox's centre is `rho` from the bubble's centre; each extra sits on that same circle, `dx` to one side
  const rho = 0.82 * r - cb / 2
  const reach = { 1: cb / 2 + 6, [-1]: cb / 2 + 6 } as Record<number, number>
  const arc = (radius >= minExtras ? extras : []).map((it, i) => {
    const side = i % 2 === 0 ? 1 : -1
    const dx = reach[side] + it.w / 2
    reach[side] += it.w + 6
    const d = Math.min(dx, rho * 0.97)
    return { ...it, x: r + side * d, y: r + Math.sqrt(Math.max(0, rho * rho - d * d)) }
  })


  return (
    <span aria-hidden={false} className="pointer-events-none absolute inset-0" style={{ transform: `scale(calc(var(--r, ${radius}) / ${r}))` }}>
      {radius >= minIcon && (
        <span title={task.kind} className="absolute left-1/2 top-[9%] -translate-x-1/2 text-lilac-600/70" aria-hidden>
          <KindIcon kind={task.kind} size={Math.round(Math.max(12, Math.min(16, r * 0.19)))} />
        </span>
      )}
      <span className="pointer-events-auto absolute bottom-[9%] left-1/2 -translate-x-1/2">
        <DoneButton task={task} size={cb} />
      </span>
      {arc.map((it) => (
        <span key={it.key} className="pointer-events-auto absolute flex items-center" style={{ left: it.x, top: it.y, transform: 'translate(-50%, -50%)' }}>
          {it.node}
        </span>
      ))}
    </span>
  )
}
