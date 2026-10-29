import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { satOf } from '../../core/color'
import { contactLink, detectContactIntent } from '../../core/people'
import { habitStreak, plannedDate } from '../../core/tasks'
import type { Task } from '../../core/types'
import { useStore } from '../../state/store'
import { IconBell, IconChat, IconList, IconMail, IconPhone, IconThought } from '../icons'
import { DoneButton, DueChip } from '../shared'
import { useFloatDrag } from '../useFloatDrag'
import { useLeaveClass } from '../useVisible'
import type { PondApi } from './types'

// stable pseudo-random motion per task so bubbles don't re-sync on re-render
export function motion(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return { cls: (['drift-a', 'drift-b', 'drift-c'] as const)[h % 3], dur: 9 + (h % 8), delay: -(h % 13) }
}

export const Lily = memo(function Lily({ task, r, api, start, match }: { task: Task; r: number; api: PondApi; start: { x: number; y: number }; match: boolean | null }) {
  const update = useStore((s) => s.updateTask)
  const drift = useStore((s) => s.settings.drift)
  const folders = useStore((s) => s.folders)
  const person = useStore((s) => s.people.find((p) => task.personIds.includes(p.id) && (p.phone || p.email)))
  const leave = useLeaveClass(task)
  const m = useMemo(() => motion(task.id), [task.id])
  const fresh = useRef(Date.now() - task.createdAt < 1500).current
  const hue = useMemo(() => {
    const f = folders.find((x) => x.id === task.folderIds[0])
    return f ? f.hue : task.kind === 'idea' ? 320 : task.kind === 'list' ? 200 : task.kind === 'event' ? 40 : task.kind === 'habit' ? 150 : 285
  }, [folders, task.folderIds, task.kind])

  const outer = useRef<HTMLDivElement>(null)
  const jig = useRef<HTMLDivElement>(null)
  useEffect(() => {
    api.register(task.id, outer.current, jig.current)
    return () => api.register(task.id, null, null)
  }, [api, task.id])

  const toClient = useCallback(
    (fx: number, fy: number) => {
      const rc = api.container.current!.getBoundingClientRect()
      const { w, h } = api.dims.current
      const v = api.view.current
      return { cx: rc.left + v.tx + fx * w * v.scale, cy: rc.top + v.ty + fy * h * v.scale }
    },
    [api],
  )
  const fromClient = useCallback(
    (cx: number, cy: number) => {
      const rc = api.container.current!.getBoundingClientRect()
      const { w, h } = api.dims.current
      const v = api.view.current
      return { fx: (cx - rc.left - v.tx) / v.scale / w, fy: (cy - rc.top - v.ty) / v.scale / h }
    },
    [api],
  )

  const { onPointerDown } = useFloatDrag(
    task,
    api.container,
    () => api.getFrac(task.id),
    (x, y) => api.isFree() && update(task.id, { x, y }),
    {
      toClient,
      fromClient,
      clamp: { minX: -3, maxX: 4, minY: -3, maxY: 4 },
      onGrab: () => api.grab(task.id),
      onDrag: (fx, fy) => api.drag(task.id, fx, fy),
      onRelease: (committed) => api.release(task.id, committed),
    },
  )

  const done = task.status === 'done'
  const font = Math.max(11, Math.min(15, r / 4.4))
  // the check circle grows with the bubble, but stays a modest size
  const cb = Math.round(Math.max(22, Math.min(28, r * 0.4)))
  const verb = detectContactIntent(task.title)?.verb
  const link = person && verb ? contactLink(verb, person) : null

  return (
    <div
      ref={outer}
      data-node
      className="absolute left-0 top-0 will-change-transform"
      style={{ width: r * 2, height: r * 2, transform: `translate(${start.x - r}px, ${start.y - r}px)` }}
    >
      <div ref={jig} className="h-full w-full">
        <div className={`h-full w-full ${fresh ? 'bloom-in' : ''} ${leave}`}>
          <div
            className={`h-full w-full ${drift ? m.cls : ''}`}
            style={{ '--dur': `${m.dur}s`, '--delay': `${m.delay}s` } as React.CSSProperties}
          >
            <div
              role="button"
              tabIndex={0}
              onPointerDown={(e) => onPointerDown(e, true)}
              onKeyDown={(e) => e.key === 'Enter' && useStore.getState().select(task.id)}
              className={`pad group relative flex h-full w-full cursor-grab touch-none select-none flex-col items-center justify-center rounded-full px-3 pb-9 pt-3 text-center outline-none transition-[opacity,transform,filter] duration-500 hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-lilac-500 ${
                done ? 'opacity-55 saturate-50' : ''
              } ${match === false ? 'opacity-[0.22] saturate-[0.4]' : match ? 'search-hit' : ''}`}
              style={{ '--h': Math.max(0, hue), '--s': satOf(hue), '--u': task.urgency } as React.CSSProperties}
            >
              <span className={`line-clamp-2 break-words font-display leading-[1.15] ${done ? 'line-through decoration-lilac-300' : ''}`} style={{ fontSize: font, textShadow: '0 0 3px rgba(255,255,255,0.95), 0 0 7px rgba(255,255,255,0.7)' }}>
                {task.title || 'Untitled'}
              </span>
              {r >= 58 && plannedDate(task) && (
                <span className="mt-1 scale-90">
                  <DueChip task={task} compact />
                </span>
              )}
              {/* the action row sits at the bottom of the bubble: checkbox (or idea mark), reminder bell, contact link */}
              <span className="absolute bottom-[9%] left-1/2 flex -translate-x-1/2 items-center gap-1.5">
                {task.kind === 'idea' ? (
                  <span title="Idea" role="img" aria-label="Idea" className="grid place-items-center text-lilac-500" style={{ width: cb, height: cb }}>
                    <IconThought size={cb} />
                  </span>
                ) : (
                  <DoneButton task={task} size={cb} />
                )}
                {((task.remindAt !== null && !task.reminded) || (task.alerts?.length ?? 0) > 0) && (
                  <span title="Reminder set" role="img" aria-label="Reminder set" className="text-lilac-500">
                    <IconBell size={15} />
                  </span>
                )}
                {!!task.repeat || task.kind === 'habit' ? habitStreak(task) > 0 && (
                  <span title={`${habitStreak(task)}-day streak`} className="flex items-center gap-0.5 text-[0.7rem] tabular-nums text-lilac-600">
                    ↻ {habitStreak(task)}
                  </span>
                ) : null}
                {task.kind === 'list' && (
                  <span title="List" className="flex items-center gap-0.5 text-[0.7rem] tabular-nums text-lilac-600">
                    <IconList size={14} />
                    {task.listStyle === 'check' && task.items.length > 0 ? `${task.items.filter((i) => i.done).length}/${task.items.length}` : task.items.length || ''}
                  </span>
                )}
                {link && (
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
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
