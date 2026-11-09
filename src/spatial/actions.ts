import { canReparent } from '../core/folders'
import * as sound from '../audio/engine'
import { useStore } from '../state/store'
import { targetAt, useDnd } from '../ui/dnd'
import { openCompose } from '../ui/NewTask'

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

/** Something carried on the canvas is over the rest of the app: light up whatever it would drop onto (the sidebar's groups, and so on). */
export function showCarry(kind: 'task' | 'group', id: string, label: string, x: number, y: number) {
  const over = targetAt(x, y)
  useDnd.setState({ drag: { payload: { type: kind === 'task' ? 'task' : 'folder', id }, label, ghost: !!over, x, y }, over })
  document.body.classList.add('dragging')
}
export function endCarry() {
  if (!useDnd.getState().drag) return
  useDnd.setState({ drag: null, over: null, liftH: 0 })
  document.body.classList.remove('dragging')
}
/** Let go over something outside the canvas (a group in the sidebar): a task is dropped the way the other views do it, a group goes inside it. */
export function dropOutside(kind: 'task' | 'group', id: string, x: number, y: number): boolean {
  const target = targetAt(x, y)
  if (!target) return false
  if (kind === 'task') useStore.getState().dropTask(id, target)
  else if (target.startsWith('folder:')) reparentGroup(id, target.slice('folder:'.length))
  return true
}

/** Tapping blank space inside a group: the new-item box opens with that group already on it (as in the pond). Unsorted has no group to add. */
export function addInGroup(id: string) {
  openCompose(null, id === 'none' ? null : { folderIds: [id] })
}
