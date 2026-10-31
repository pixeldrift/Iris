import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { satOf } from '../../core/color'
import { plannedDate } from '../../core/tasks'
import type { Task } from '../../core/types'
import { useStore } from '../../state/store'
import { BubbleChrome } from '../BubbleChrome'
import { TitleFit } from '../TitleFit'
import { DueChip } from '../shared'
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
  // the type grows and shrinks with the bubble, so a title wraps the same way at every size
  const font = r * 0.2
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
              onPointerDown={(e) => {
                // pop mode: no dragging, no opening; the bubble goes the moment it is touched
                if (api.popMode()) {
                  e.stopPropagation()
                  useStore.getState().deleteTask(task.id)
                  return
                }
                onPointerDown(e, true)
              }}
              onKeyDown={(e) => e.key === 'Enter' && useStore.getState().select(task.id)}
              className={`pad group relative flex h-full w-full cursor-grab touch-none select-none flex-col items-center justify-center rounded-full px-3 pb-9 pt-6 text-center outline-none transition-[opacity,transform,filter] duration-500 hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-lilac-500 ${
                done ? 'opacity-55 saturate-50' : ''
              } ${match === false ? 'opacity-[0.22] saturate-[0.4]' : match ? 'search-hit' : ''}`}
              style={{ '--h': Math.max(0, hue), '--s': satOf(hue), '--u': task.urgency } as React.CSSProperties}
            >
              <TitleFit text={task.title || 'Untitled'} font={`${font}px`} lineHeight={1.15} done={done} watch={r} />
              {r >= 58 && plannedDate(task) && (
                <span className="mt-1 scale-90">
                  <DueChip task={task} compact />
                </span>
              )}
              <BubbleChrome task={task} r={r} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
