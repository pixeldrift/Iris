import { useEffect } from 'react'
import { useStore } from '../state/store'
import { pulseTask } from './taskAt'

/**
 * A group's tag was clicked in an item's details: the item is ringed wherever it shows, in that group's colour. (The views with a camera, the
 * pond and the spatial workspace, also move to the group themselves; the lists scroll to the item.)
 */
export function FocusHost() {
  const req = useStore((s) => s.focusReq)
  useEffect(() => {
    if (!req) return
    const st = useStore.getState()
    const hue = st.folders.find((f) => f.id === req.folderId)?.hue ?? 285
    // (the canvases bring their camera over first: the ring comes when it has arrived)
    const canvas = st.view === 'pond' || st.view === 'spatial' || st.view === 'priority'
    const t = window.setTimeout(() => {
      const el = pulseTask(req.taskId, hue)
      if (!canvas) el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, canvas ? 650 : 40)
    return () => window.clearTimeout(t)
  }, [req])
  return null
}
