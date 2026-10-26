import { useCallback, useRef } from 'react'
import { create } from 'zustand'

/**
 * One pointer-based drag system for the whole app (mouse, pen and touch).
 * Anything with `data-drop="kind:value"` is a drop target; the store's
 * `dropTask` decides what each kind means. Folder rows reuse it to re-parent.
 */
export interface Payload {
  type: 'task' | 'folder'
  id: string
}

interface DndState {
  drag: { payload: Payload; label: string; ghost: boolean; x: number; y: number } | null
  over: string | null
}

export const useDnd = create<DndState>(() => ({ drag: null, over: null }))

export function targetAt(x: number, y: number): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const t = (el as HTMLElement).closest?.('[data-drop]') as HTMLElement | null
    if (t?.dataset.drop) return t.dataset.drop
  }
  return null
}

export interface DragEnd {
  target: string | null
  x: number
  y: number
}

interface Options {
  payload: Payload
  label: string
  /** Show a floating chip under the pointer (off for things that move themselves). */
  ghost?: boolean
  /** Touch must start from a handle so scrolling still works. */
  touchNeedsHandle?: boolean
  onStart?: () => void
  onMove?: (x: number, y: number, dx: number, dy: number) => void
  onEnd?: (e: DragEnd) => void
  onClick?: (e: PointerEvent) => void
}

export function usePointerDrag(opts: Options) {
  const optsRef = useRef(opts)
  optsRef.current = opts

  return useCallback((e: React.PointerEvent, isHandle = false) => {
    if (e.button !== 0) return
    const o = optsRef.current
    if (e.pointerType === 'touch' && o.touchNeedsHandle && !isHandle) return
    const sx = e.clientX
    const sy = e.clientY
    let started = false

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx
      const dy = ev.clientY - sy
      if (!started) {
        if (Math.hypot(dx, dy) < 5) return
        started = true
        document.body.classList.add('dragging')
        optsRef.current.onStart?.()
      }
      const cur = optsRef.current
      useDnd.setState({
        drag: { payload: cur.payload, label: cur.label, ghost: cur.ghost ?? true, x: ev.clientX, y: ev.clientY },
        over: targetAt(ev.clientX, ev.clientY),
      })
      cur.onMove?.(ev.clientX, ev.clientY, dx, dy)
    }
    const finish = (ev: PointerEvent, cancelled: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      document.body.classList.remove('dragging')
      useDnd.setState({ drag: null, over: null })
      const cur = optsRef.current
      if (started) {
        cur.onEnd?.({ target: cancelled ? null : targetAt(ev.clientX, ev.clientY), x: ev.clientX, y: ev.clientY })
      } else if (!cancelled) {
        cur.onClick?.(ev)
      }
    }
    const up = (ev: PointerEvent) => finish(ev, false)
    const cancel = (ev: PointerEvent) => finish(ev, true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }, [])
}

/** Props + live state for a drop target. */
export function useDropTarget(id: string) {
  const over = useDnd((s) => s.over === id)
  const active = useDnd((s) => s.drag !== null)
  return { over, active, props: { 'data-drop': id } as const }
}

export function DragLayer() {
  const drag = useDnd((s) => s.drag)
  if (!drag || !drag.ghost) return null
  return (
    <div
      className="pointer-events-none fixed z-[100] max-w-[220px] truncate rounded-full border border-white/70 bg-white/80 px-3.5 py-1.5 text-sm text-ink shadow-[0_8px_30px_rgba(132,83,180,0.28)] backdrop-blur-md"
      style={{ left: drag.x + 12, top: drag.y + 12 }}
    >
      {drag.label}
    </div>
  )
}
