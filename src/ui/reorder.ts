import { useRef, useState } from 'react'

/**
 * Reordering the items of a grid by dragging one onto another: HTML drag and drop with a mouse, and press-and-hold-then-drag on touch (the
 * long press is what tells it apart from a scroll or a tap). Items carry `data-reorder-index`. `consumedClick()` is true once right after
 * a drop, so the click that follows it can be ignored.
 */
export function useReorderGrid(onReorder: (from: number, to: number) => void) {
  const grid = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null)
  const hold = useRef<number | null>(null)
  const touching = useRef<{ from: number; to: number } | null>(null)
  const swallow = useRef(false)

  const reset = () => {
    if (hold.current !== null) window.clearTimeout(hold.current)
    hold.current = null
    touching.current = null
    setDrag(null)
  }
  const drop = (from: number, to: number) => {
    onReorder(from, to)
    swallow.current = true
    window.setTimeout(() => (swallow.current = false), 0)
  }
  const finishTouch = () => {
    const t = touching.current
    reset()
    if (t) drop(t.from, t.to)
  }

  const gridProps = {
    ref: grid,
    onPointerMove: (e: React.PointerEvent) => {
      const t = touching.current
      if (!t) return
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-reorder-index]')
      if (!over) return
      t.to = Number(over.dataset.reorderIndex)
      setDrag({ from: t.from, to: t.to })
    },
    onPointerUp: finishTouch,
    onPointerCancel: finishTouch,
  }
  const itemProps = (i: number) => ({
    'data-reorder-index': i,
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(i))
      setDrag({ from: i, to: i })
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDrag((d) => (d ? { ...d, to: i } : d))
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      drop(Number(e.dataTransfer.getData('text/plain')), i)
      setDrag(null)
    },
    onDragEnd: () => setDrag(null),
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return
      hold.current = window.setTimeout(() => {
        touching.current = { from: i, to: i }
        setDrag({ from: i, to: i })
        grid.current?.setPointerCapture(e.pointerId)
      }, 280)
    },
    onPointerUp: () => {
      if (hold.current !== null) window.clearTimeout(hold.current)
      hold.current = null
    },
  })
  return { drag, gridProps, itemProps, consumedClick: () => swallow.current && !(swallow.current = false) }
}
