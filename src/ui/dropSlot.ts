import { useEffect, useMemo } from 'react'
import { useBoardSlot } from './boardSlot'
import { useDnd, useDropTarget } from './dnd'

/**
 * While an item is carried over a list: where in it the item would land (above or below the middle of each row that has
 * `data-card-id`), published so the drop can use it. `deps` should change when the rows do.
 */
export function useDropSlot(target: string, list: React.RefObject<HTMLElement | null>, deps: unknown[]) {
  const { over, active, props } = useDropTarget(target)
  const dragId = useDnd((s) => (s.drag?.payload.type === 'task' ? s.drag.payload.id : null))
  const dragY = useDnd((s) => (over && s.drag?.payload.type === 'task' ? s.drag.y : null))
  const slot = useMemo(() => {
    if (dragY === null || !list.current) return null
    const rows = [...list.current.querySelectorAll<HTMLElement>('[data-card-id]')].filter((e) => e.dataset.cardId !== dragId)
    let index = 0
    for (const c of rows) {
      const r = c.getBoundingClientRect()
      if (dragY > r.top + r.height / 2) index++
      else break
    }
    return { index, before: rows[index]?.dataset.cardId ?? null, ids: rows.map((c) => c.dataset.cardId!) }
  }, [dragY, dragId, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
  const ids = slot?.ids.join(',')
  useEffect(() => {
    if (slot) useBoardSlot.setState({ target, index: slot.index, ids: slot.ids })
    else if (useBoardSlot.getState().target === target) useBoardSlot.setState({ target: null, index: 0, ids: [] })
  }, [slot?.index, ids, target]) // eslint-disable-line react-hooks/exhaustive-deps
  return { slot, over, active, props }
}
