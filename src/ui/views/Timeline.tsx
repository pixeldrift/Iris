import { useMemo, useRef, useState } from 'react'
import { addDays, diffDays, fromISO, MONTHS, today } from '../../core/dates'
import { spanOf } from '../../core/tasks'
import type { Task } from '../../core/types'
import { useStore } from '../../state/store'
import { IconChevron } from '../icons'
import { useLeaveClass, useVisibleTasks } from '../useVisible'

const DAY_W = 38
const DAYS = 70
const LABEL_W = 190

type Preview = { id: string; start: string; end: string }

function Bar({ task, winStart, onPreview, preview }: { task: Task; winStart: string; onPreview: (p: Preview | null) => void; preview: Preview | null }) {
  const update = useStore((s) => s.updateTask)
  const select = useStore((s) => s.select)
  const folders = useStore((s) => s.folders)
  const hue = folders.find((f) => f.id === task.folderIds[0])?.hue ?? 285
  const leave = useLeaveClass(task)
  const base = spanOf(task)!
  const span = preview && preview.id === task.id ? preview : { start: base.start, end: base.end }
  const left = diffDays(winStart, span.start) * DAY_W
  const width = (diffDays(span.start, span.end) + 1) * DAY_W

  const begin = (mode: 'move' | 'left' | 'right') => (e: React.PointerEvent) => {
    e.stopPropagation()
    if (e.button !== 0) return
    const sx = e.clientX
    let moved = false
    let cur: Preview = { id: task.id, ...base }
    const move = (ev: PointerEvent) => {
      const ds = Math.round((ev.clientX - sx) / DAY_W)
      if (ds !== 0) moved = true
      let { start, end } = base
      if (mode === 'move') {
        start = addDays(start, ds)
        end = addDays(end, ds)
      } else if (mode === 'left') {
        start = addDays(start, ds)
        if (start > end) start = end
      } else {
        end = addDays(end, ds)
        if (end < start) end = start
      }
      cur = { id: task.id, start, end }
      onPreview(cur)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onPreview(null)
      if (!moved) select(task.id)
      else update(task.id, { start: cur.start, due: cur.end })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      onPointerDown={begin('move')}
      className={`absolute top-1.5 flex h-8 cursor-grab touch-none items-center overflow-hidden rounded-full px-3 text-xs shadow-sm ring-1 ring-white/80 transition-[box-shadow] hover:shadow-md ${task.status === 'done' ? 'opacity-50' : ''} ${leave}`}
      style={{
        left,
        width,
        background: `linear-gradient(90deg, hsla(${hue},70%,86%,.95), hsla(${hue},65%,78%,.95))`,
        color: `hsl(${hue},35%,25%)`,
      }}
    >
      <span onPointerDown={begin('left')} className="absolute inset-y-0 left-0 w-2.5 cursor-ew-resize" />
      <span className="truncate">{task.title}</span>
      <span onPointerDown={begin('right')} className="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize" />
    </div>
  )
}

export function Timeline() {
  const visible = useVisibleTasks()
  const update = useStore((s) => s.updateTask)
  const select = useStore((s) => s.select)
  const t0 = today()
  const [winStart, setWinStart] = useState(addDays(t0, -7))
  const [preview, setPreview] = useState<Preview | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => {
    const vis = visible
    const dated = vis.filter((t) => spanOf(t)).sort((a, b) => spanOf(a)!.start.localeCompare(spanOf(b)!.start))
    const undated = vis.filter((t) => !spanOf(t) && t.status !== 'done')
    return [...dated, ...undated]
  }, [visible])

  const days = Array.from({ length: DAYS }, (_, i) => addDays(winStart, i))
  const todayX = diffDays(winStart, t0) * DAY_W + DAY_W / 2
  const gridW = DAYS * DAY_W

  const months: { label: string; x: number; w: number }[] = []
  days.forEach((d, i) => {
    const dt = fromISO(d)
    const last = months[months.length - 1]
    if (!last || last.label !== `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`) months.push({ label: `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`, x: i * DAY_W, w: DAY_W })
    else last.w += DAY_W
  })

  return (
    <div className="glass flex h-full flex-col rounded-[2rem] p-3 md:p-4">
      <div className="mb-2 flex items-center gap-1 px-1">
        <h3 className="font-display text-xl">Timeline</h3>
        <button onClick={() => setWinStart(addDays(winStart, -28))} className="ml-3 rounded-full p-1.5 hover:bg-white/60" aria-label="Earlier">
          <span className="inline-block rotate-180">
            <IconChevron />
          </span>
        </button>
        <button
          onClick={() => {
            setWinStart(addDays(t0, -7))
            scroller.current?.scrollTo({ left: 0, behavior: 'smooth' })
          }}
          className="rounded-full px-2.5 py-1 text-xs text-ink-soft hover:bg-white/60"
        >
          Today
        </button>
        <button onClick={() => setWinStart(addDays(winStart, 28))} className="rounded-full p-1.5 hover:bg-white/60" aria-label="Later">
          <IconChevron />
        </button>
        <span className="ml-auto text-xs text-ink-faint">drag bars to shift · drag edges to stretch · click empty row to schedule</span>
      </div>

      <div ref={scroller} className="scroll-soft min-h-0 flex-1 overflow-auto rounded-2xl bg-white/30">
        <div style={{ width: LABEL_W + gridW }} className="relative min-h-full">
          {/* header */}
          <div className="sticky top-0 z-20 flex bg-white/70 backdrop-blur-md">
            <div className="sticky left-0 z-30 shrink-0 bg-white/80" style={{ width: LABEL_W }} />
            <div className="relative" style={{ width: gridW }}>
              <div className="relative h-6">
                {months.map((m) => (
                  <span key={m.label} className="absolute top-1 truncate pl-2 text-[0.7rem] font-medium text-lilac-700" style={{ left: m.x, width: m.w }}>
                    {m.label}
                  </span>
                ))}
              </div>
              <div className="flex">
                {days.map((d) => {
                  const dt = fromISO(d)
                  return (
                    <span
                      key={d}
                      className={`grid shrink-0 place-items-center pb-1 text-[0.65rem] tabular-nums ${d === t0 ? 'font-bold text-lilac-600' : 'text-ink-faint'}`}
                      style={{ width: DAY_W }}
                    >
                      {dt.getDate()}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>

          {/* rows */}
          {rows.map((t) => {
            const has = !!spanOf(t)
            return (
              <div key={t.id} className="flex border-t border-white/60">
                <button
                  onClick={() => select(t.id)}
                  className="sticky left-0 z-10 shrink-0 truncate bg-white/70 px-3 text-left text-sm backdrop-blur-md hover:bg-white/90"
                  style={{ width: LABEL_W, height: 44 }}
                >
                  {t.title}
                </button>
                <div
                  className="relative"
                  style={{
                    width: gridW,
                    height: 44,
                    backgroundImage: `linear-gradient(90deg, rgba(205,177,235,.18) 1px, transparent 1px)`,
                    backgroundSize: `${DAY_W}px 100%`,
                    cursor: has ? undefined : 'copy',
                  }}
                  onClick={(e) => {
                    if (has) return
                    const rect = e.currentTarget.getBoundingClientRect()
                    const day = addDays(winStart, Math.floor((e.clientX - rect.left) / DAY_W))
                    update(t.id, { start: day, due: addDays(day, 2) })
                  }}
                >
                  {has ? (
                    <Bar task={t} winStart={winStart} preview={preview} onPreview={setPreview} />
                  ) : (
                    <span className="pointer-events-none absolute left-3 top-3 text-xs italic text-ink-faint">unscheduled</span>
                  )}
                </div>
              </div>
            )
          })}
          {rows.length === 0 && <p className="py-16 text-center font-display text-lg italic text-ink-faint" style={{ marginLeft: LABEL_W }}>No tasks to chart.</p>}

          {/* today line */}
          <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-lilac-500/60" style={{ left: LABEL_W + todayX }} />
        </div>
      </div>
    </div>
  )
}
