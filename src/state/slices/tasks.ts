import { addDays, today } from '../../core/dates'
import { descendantIds, pathOf } from '../../core/folders'
import { detectContactIntent, matchPerson } from '../../core/people'
import { patchForStage, stageIndex, stagesForTask, stagesOf } from '../../core/progress'
import { currentOccurrence, repeatOf } from '../../core/recurrence'
import { remindFromRule } from '../../core/reminders'
import { rolloverDay, urgencyForDue } from '../../core/tasks'
import type { Task, TaskKind, TaskStatus } from '../../core/types'
import * as sound from '../../audio/engine'
import { initial, uid } from '../defaults'
import type { SetState, GetState, TasksSlice } from '../types'

export const createTasksSlice = (set: SetState, get: GetState): TasksSlice => ({
      tasks: initial.tasks,

      addTask: (p) => {
        const { scope, folders } = get()
        const id = uid()
        const folderIds = p.folderIds ?? (scope.type === 'folder' ? [scope.id] : [])
        const personIds = p.personIds ?? (scope.type === 'person' ? [scope.id] : [])
        const due = p.due ?? null
        const day = p.day ?? (scope.type === 'day' ? scope.date : null)
        const task: Task = {
          id,
          notes: '',
          kind: 'task' as TaskKind,
          items: [],
          listStyle: 'check' as const,
          time: null,
          endTime: null,
          place: '',
          log: [],
          repeat: null,
          alerts: [],
          alertsDone: [],
          remindAt: null,
          reminded: false,
          status: 'todo',
          importance: 0.5,
          urgency: urgencyForDue(0.3, due),
          x: 0.5,
          y: 0.5,
          start: null,
          due,
          day,
          rollover: true,
          days: null,
          folderIds,
          personIds,
          createdAt: Date.now(),
          completedAt: null,
          ...p,
        }
        task.folderIds = task.folderIds.filter((f) => folders.some((x) => x.id === f))
        set((s) => ({ tasks: [...s.tasks, task] }))
        if (!task.draft) get().checkContact(id)
        return id
      },
      updateTask: (id, patch) =>
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== id) return t
            const next = { ...t, ...patch }
            // a "day before" reminder follows its date when the date (or time) moves
            if (next.remindBefore != null && ('day' in patch || 'due' in patch || 'time' in patch)) {
              next.remindAt = remindFromRule(next, next.remindBefore)
              next.reminded = false
            }
            return next
          }),
        })),
      deleteTask: (id) => {
        if (get().removing[id]) return
        sound.pop()
        set((s) => ({ removing: { ...s.removing, [id]: true } }))
        window.setTimeout(() => {
          set((s) => {
            const { [id]: _gone, ...removing } = s.removing
            return {
              removing,
              tasks: s.tasks.filter((t) => t.id !== id),
              selectedId: s.selectedId === id ? null : s.selectedId,
            }
          })
        }, 420)
        // the panel closes right away, the bubble pops on its own
        if (get().selectedId === id) set({ selectedId: null })
      },
      toggleDone: (id) => {
        const t = get().tasks.find((x) => x.id === id)
        if (!t) return
        if (repeatOf(t)) {
          // a repeating task is ticked for its current occurrence (today's, or the next one), never finished
          const day = currentOccurrence(t, today()) ?? today()
          const had = t.log.includes(day)
          if (!had) sound.bloom()
          set((s) => ({ tasks: s.tasks.map((x) => (x.id === id ? { ...x, log: had ? x.log.filter((d) => d !== day) : [...x.log, day].sort() } : x)) }))
          return
        }
        get().setStatus(id, t.status === 'done' ? 'todo' : 'done')
      },
      setStatus: (id, status) => {
        const t = get().tasks.find((x) => x.id === id)
        if (!t) return
        const n = stagesForTask(t, get().folders).length
        get().moveToStage(id, status === 'done' ? n - 1 : status === 'doing' ? Math.min(1, n - 2) : 0)
      },
      setStage: (id, stageId, stages) => {
        const t = get().tasks.find((x) => x.id === id)
        if (!t) return
        const list = stages ?? stagesForTask(t, get().folders)
        const i = list.findIndex((st) => st.id === stageId)
        if (i >= 0) get().moveToStage(id, i, list)
      },
      moveToStage: (id, i, given) => {
        const t = get().tasks.find((x) => x.id === id)
        if (!t) return
        const stages = given ?? stagesForTask(t, get().folders)
        const to = patchForStage(stages, i)
        if (stageIndex(t, stages) === Math.max(0, Math.min(stages.length - 1, i)) && t.status === to.status && t.stage === to.stage) return
        if (to.status === 'done' && t.status !== 'done') {
          sound.bloom()
          // keep it on screen long enough to bloom, then it fades out
          set((s) => ({ lingering: { ...s.lingering, [id]: true } }))
          window.setTimeout(() => {
            set((s) => {
              const { [id]: _l, ...lingering } = s.lingering
              return { lingering }
            })
          }, 1500)
        }
        get().updateTask(id, { ...to, completedAt: to.status === 'done' ? (t.completedAt ?? Date.now()) : null })
      },
      addToFolder: (taskId, folderId) => {
        const t = get().tasks.find((x) => x.id === taskId)
        if (!t || t.folderIds.includes(folderId)) return
        get().updateTask(taskId, { folderIds: [...t.folderIds, folderId] })
      },
      removeFromFolder: (taskId, folderId) => {
        const t = get().tasks.find((x) => x.id === taskId)
        if (!t) return
        get().updateTask(taskId, { folderIds: t.folderIds.filter((f) => f !== folderId) })
      },
      addPerson: (taskId, personId) => {
        const t = get().tasks.find((x) => x.id === taskId)
        if (!t || t.personIds.includes(personId)) return
        get().updateTask(taskId, { personIds: [...t.personIds, personId] })
      },
      removePerson: (taskId, personId) => {
        const t = get().tasks.find((x) => x.id === taskId)
        if (!t) return
        get().updateTask(taskId, { personIds: t.personIds.filter((p) => p !== personId) })
      },
      setDue: (taskId, due) => {
        const t = get().tasks.find((x) => x.id === taskId)
        if (!t) return
        const patch: Partial<Task> = { due, urgency: urgencyForDue(t.urgency, due) }
        if (due && t.start && t.start > due) patch.start = due
        get().updateTask(taskId, patch)
      },

      setDay: (taskId, day) => get().updateTask(taskId, { day }),
      rollover: () => {
        const now = today()
        const moves = new Map<string, string>()
        for (const t of get().tasks) {
          const to = rolloverDay(t, now)
          if (to && to !== t.day) moves.set(t.id, to)
        }
        if (!moves.size) return
        set((s) => ({ tasks: s.tasks.map((t) => (moves.has(t.id) ? { ...t, day: moves.get(t.id)! } : t)) }))
        get().showToast(`Carried ${moves.size} unfinished ${moves.size === 1 ? 'task' : 'tasks'} forward`)
      },
      assignToGroup: (taskId, mode, key) => {
        const s = get()
        const t = s.tasks.find((x) => x.id === taskId)
        if (!t) return
        if (mode === 'kind') s.updateTask(taskId, { kind: key as TaskKind })
        else if (mode === 'person') {
          const rest = t.personIds.slice(1).filter((p) => p !== key)
          s.updateTask(taskId, { personIds: key === 'none' ? rest : [key, ...rest] })
        } else if (mode === 'folder') {
          const oldRoot = t.folderIds[0] ? pathOf(s.folders, t.folderIds[0])[0] : undefined
          const drop = oldRoot ? descendantIds(s.folders, oldRoot.id) : new Set<string>()
          const keep = t.folderIds.filter((f) => !drop.has(f) && f !== key)
          s.updateTask(taskId, { folderIds: key === 'none' ? keep : [key, ...keep] })
        } else if (mode === 'due') {
          const now = today()
          if (key === 'today') s.setDue(taskId, now)
          else if (key === 'week') s.setDue(taskId, addDays(now, 3))
          else if (key === 'later') s.setDue(taskId, addDays(now, 14))
          else if (key === 'someday') s.updateTask(taskId, { due: null, day: null })
          else return
        }
        sound.plink()
      },
      setReminder: (id, at, before = null) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, remindAt: at, reminded: false, remindBefore: at === null ? null : before } : t)) })),
      discardDraft: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id || !t.draft) })),

      checkContact: (taskId) => {
        const { tasks, people, contactPrompt } = get()
        const t = tasks.find((x) => x.id === taskId)
        if (!t || t.contactDeclined || t.personIds.length || contactPrompt) return
        const intent = detectContactIntent(`${t.title}`)
        if (!intent) return
        const known = matchPerson(people, intent.name)
        if (known) get().addPerson(taskId, known.id)
        else set({ contactPrompt: { taskId, name: intent.name, verb: intent.verb } })
      },
      resolveContact: (personId) => {
        const prompt = get().contactPrompt
        if (!prompt) return
        if (personId) get().addPerson(prompt.taskId, personId)
        else get().updateTask(prompt.taskId, { contactDeclined: true })
        set({ contactPrompt: null })
      },

      dropTask: (taskId, target) => {
        const [kind, ...rest] = target.split(':')
        const value = rest.join(':')
        const s = get()
        const t = s.tasks.find((x) => x.id === taskId)
        if (!t) return false
        switch (kind) {
          case 'folder':
            if (!s.folders.some((f) => f.id === value)) return false
            s.addToFolder(taskId, value)
            sound.plink()
            return true
          case 'person':
            if (!s.people.some((p) => p.id === value)) return false
            s.addPerson(taskId, value)
            sound.plink()
            return true
          case 'day':
            s.setDay(taskId, value)
            sound.plink()
            return true
          case 'inbox':
            s.updateTask(taskId, { due: null, day: null, start: null, folderIds: [], personIds: [] })
            sound.plink()
            return true
          case 'status':
            s.setStatus(taskId, value as TaskStatus)
            return true
          case 'stage': {
            // stage:<group id or ->:<stage id>: the columns of the Progress view it was dropped in
            const [fid, ...sid] = value.split(':')
            const folder = fid === '-' ? null : s.folders.find((f) => f.id === fid)
            s.setStage(taskId, sid.join(':'), stagesOf(folder))
            return true
          }
          default:
            return false
        }
      },
})
