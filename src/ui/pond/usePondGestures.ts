import { useEffect } from 'react'
import { openCompose } from '../NewTask'
import { MAX_SCALE, MIN_SCALE, type View } from './types'

/** Pan with a finger or the mouse, pinch to zoom, wheel to zoom about the cursor, and tap the water to add. */
export function usePondGestures(o: {
  ref: React.RefObject<HTMLDivElement | null>
  view: React.MutableRefObject<View>
  dims: React.MutableRefObject<{ w: number; h: number }>
  applyView: () => void
  zoomAbout: (factor: number, px: number, py: number) => void
  select: (id: string | null) => void
  checkOffscreen: () => void
}) {
  const { ref, view, dims, applyView, zoomAbout, select, checkOffscreen } = o
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ptrs = new Map<number, { x: number; y: number }>()
    let mode: 'none' | 'tap' | 'pan' | 'pinch' = 'none'
    let base = { x: 0, y: 0, v: view.current, dist: 1, mid: { x: 0, y: 0 } }

    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const rebase = () => {
      const pts = [...ptrs.values()]
      const mid = pts.length === 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0]
      base = { x: pts[0].x, y: pts[0].y, v: { ...view.current }, dist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1 : 1, mid }
    }

    const move = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return
      ptrs.set(e.pointerId, local(e))
      const pts = [...ptrs.values()]
      if (pts.length >= 2) {
        mode = 'pinch'
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
        const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, base.v.scale * (dist / base.dist)))
        const wx = (base.mid.x - base.v.tx) / base.v.scale
        const wy = (base.mid.y - base.v.ty) / base.v.scale
        view.current = { scale: s, tx: mid.x - wx * s, ty: mid.y - wy * s }
        applyView()
        return
      }
      const dx = pts[0].x - base.x
      const dy = pts[0].y - base.y
      if (mode === 'tap' && Math.hypot(dx, dy) > 6) {
        mode = 'pan'
        el.style.cursor = 'grabbing'
      }
      if (mode === 'pan') {
        view.current = { ...base.v, tx: base.v.tx + dx, ty: base.v.ty + dy }
        applyView()
      }
    }
    const up = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return
      const p = local(e)
      ptrs.delete(e.pointerId)
      if (ptrs.size === 0) {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        if (mode === 'tap' && e.type === 'pointerup') {
          select(null)
          const v = view.current
          const { w: W, h: H } = dims.current
          openCompose({ x: (p.x - v.tx) / v.scale / W, y: (p.y - v.ty) / v.scale / H })
        }
        mode = 'none'
        el.style.cursor = ''
        checkOffscreen()
      } else {
        mode = 'pan' // lifted one finger of a pinch: carry on panning, never create
        rebase()
      }
    }
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('[data-node],[data-ui]')) return
      if (e.button !== 0 && e.pointerType === 'mouse') return
      if (ptrs.size === 0) {
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        window.addEventListener('pointercancel', up)
      }
      ptrs.set(e.pointerId, local(e))
      mode = ptrs.size >= 2 ? 'pinch' : 'tap'
      rebase()
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Shift + wheel (or a sideways scroll) slides the view
        const v = view.current
        view.current = { ...v, tx: v.tx - (e.deltaX || e.deltaY) * unit, ty: v.ty - (e.deltaX ? e.deltaY : 0) * unit }
        applyView()
        return
      }
      // The wheel zooms about the cursor (one mouse notch is a gentle step); a trackpad pinch arrives as ctrl + wheel
      const k = e.ctrlKey ? 0.01 : 0.0018
      const factor = Math.min(1.45, Math.max(0.69, Math.exp(-e.deltaY * unit * k)))
      zoomAbout(factor, e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('wheel', wheel)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [applyView, zoomAbout, select, checkOffscreen, ref, view, dims]) // eslint-disable-line react-hooks/exhaustive-deps
}
