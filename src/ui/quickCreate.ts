import { parseQuickAdd, type QuickAdd } from '../core/quickadd'
import type { Task } from '../core/types'
import { useStore } from '../state/store'
import { askNotify } from './notify'
import { assignToUser, shareTask } from '../sync/share'

/** What a quick line understood, as the fields of a new task. `startIn` / `personIds` are what the box was already set to (a group's +, say). */
export function fieldsFromQuickAdd(q: QuickAdd | null | undefined, preset: { folderIds?: string[]; personIds?: string[] } = {}): Partial<Task> {
  const startIn = preset.folderIds
  return {
    ...(q?.day ? { day: q.day } : {}),
    ...(q?.due ? { due: q.due } : {}),
    ...(q?.dueTime ? { dueTime: q.dueTime } : {}),
    ...(q?.time ? { time: q.time } : {}),
    ...(q?.endTime ? { endTime: q.endTime } : {}),
    ...(q?.remindAt ? { remindAt: q.remindAt } : {}),
    ...(q?.place ? { place: q.place } : {}),
    ...(q?.remindBefore ? { remindBefore: q.remindBefore } : {}),
    ...(q?.repeat ? { repeat: q.repeat } : {}),
    ...(q?.folderIds.length || startIn?.length ? { folderIds: [...new Set([...(startIn ?? []), ...(q?.folderIds ?? [])])] } : {}),
    ...(q?.personIds.length || preset.personIds?.length ? { personIds: [...new Set([...(preset.personIds ?? []), ...(q?.personIds ?? [])])] } : {}),
    ...(q?.tagOrder.length || startIn?.length || preset.personIds?.length ? { tagOrder: [...new Set([...(startIn ?? []), ...(preset.personIds ?? []), ...(q?.tagOrder ?? [])])] } : {}),
  }
}

/** Read a line the way the New dialog does (dates, times, repeats, #groups, @people, places, reminders), without applying anything. */
export function understandLine(text: string): QuickAdd | null {
  const st = useStore.getState()
  if (st.settings.quickAdd === 'off' || !text.trim()) return null
  return parseQuickAdd(text, new Date(), { folders: st.folders, people: st.people })
}

/**
 * Make an item from a typed line, with whatever the quick-add understanding found when `apply` is true (the caller decides: always in
 * "automatically" mode, once accepted in "suggest" mode, never for "keep as typed"). Returns the new item's id.
 */
export function createFromLine(text: string, apply: boolean): string {
  const st = useStore.getState()
  const q = apply ? understandLine(text) : null
  const id = st.addTask({ title: q?.title || text.trim(), ...(q?.kind ? { kind: q.kind } : {}), ...fieldsFromQuickAdd(q) })
  // a due date typed into the line brings its reminder, like one chosen in the details
  const made = useStore.getState().tasks.find((x) => x.id === id)
  if (made?.due && made.kind !== 'idea') useStore.getState().setDue(id, made.due, made.dueTime ?? null)
  if (q?.remindAt) void askNotify()
  if (q?.action && q.action.type !== 'tag') {
    const { type, personId } = q.action
    const person = useStore.getState().people.find((p) => p.id === personId)
    const userId = person?.link?.userId
    const task = useStore.getState().tasks.find((x) => x.id === id)
    if (userId && task) {
      const done = { assign: `Assigned to ${person?.name}.`, invite: `Invitation sent to ${person?.name}.`, share: `Shared with ${person?.name}.` }[type]
      const act = type === 'assign' ? assignToUser(task, userId) : shareTask(task, userId, type === 'invite' ? 'viewer' : 'editor', type === 'invite' ? 'event' : undefined)
      act.then(() => useStore.getState().showToast(done)).catch((e) => useStore.getState().showToast(e instanceof Error ? e.message : 'Could not complete that action.'))
    }
  }
  return id
}
