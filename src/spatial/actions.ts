import { canReparent } from '../core/folders'
import * as sound from '../audio/engine'
import { useStore } from '../state/store'

/** A task dropped into another group joins it (and leaves the one it was in). 'none' takes it out of its group. */
export function retagTask(id: string, clusterId: string) {
  const st = useStore.getState()
  const t = st.tasks.find((x) => x.id === id)
  if (!t) return
  const have = new Set(st.folders.map((f) => f.id))
  const cur = t.folderIds.find((x) => have.has(x))
  let ids = t.folderIds.filter((x) => x !== cur)
  if (clusterId !== 'none') ids = [clusterId, ...ids.filter((x) => x !== clusterId)]
  st.updateTask(id, { folderIds: ids })
  sound.plink()
}

/** A group let go on another group's name goes inside it. */
export function reparentGroup(id: string, parent: string) {
  const st = useStore.getState()
  if (id !== 'none' && parent !== 'none' && canReparent(st.folders, id, parent)) st.moveFolder(id, parent)
}
