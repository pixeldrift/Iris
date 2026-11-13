import { addDays, fromISO, today } from '../../core/dates'
import { descendantIds, pathOf } from '../../core/folders'
import { detectContactIntent, matchPerson } from '../../core/people'
import { hasProgress, patchForStage, percentForStage, percentOfCount, percentsFor, planRank, stageForPercent, stageIndex, stagesForTask, stagesOf, topRank } from '../../core/progress'
import { currentOccurrence, repeatOf } from '../../core/recurrence'
import { isPastEvent } from '../../core/schedule'
import { remindFromRule } from '../../core/reminders'
import { rolloverDay, tagsOf, urgencyForDue } from '../../core/tasks'
import type { Task, TaskKind, TaskStatus } from '../../core/types'
import { firstOf } from '../../core/scope'
import * as sound from '../../audio/engine'
import { initial, uid } from '../defaults'
import type { SetState, GetState, TasksSlice } from '../types'

export const createTasksSlice = (set: SetState, get: GetState): TasksSlice => ({
      tasks: initial.tasks,

      addTask: (p) => {
        const { scope, folders } = get()
        const id = uid()
        const folderIds = p.folderIds ?? (firstOf(scope, 'folder') ? [firstOf(scope, 'folder')!.id] : [])
        const personIds = p.personIds ?? (firstOf(scope, 'person') ? [firstOf(scope, 'person')!.id] : [])
        const due = p.due ?? null
        const day = p.day ?? firstOf(scope, 'day')?.date ?? null
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
            // and the deadline's own reminder follows the deadline
            if (next.dueRemindBefore != null && ('due' in patch || 'dueTime' in patch)) {
              next.dueRemindAt = remindFromRule(next, next.dueRemindBefore, Date.now(), 'due')
              next.dueReminded = false
            }
            // the type is only which fields are shown: giving a task a time makes it an event, and taking the time away makes it a task again
            if ('time' in patch) {
              if (patch.time && next.kind === 'task') next.kind = 'event'
              else if (!patch.time && next.kind === 'event') next.kind = 'task'
            }
            // adding a repeat makes a plain task a habit (something you keep doing)
            if (patch.repeat && !t.repeat && next.kind === 'task') next.kind = 'habit'
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
          else sound.undone()
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
      moveToStage: (id, i, given, keepProgress = false) => {
        const t = get().tasks.find((x) => x.id === id)
        if (!t) return
        const stages = given ?? stagesForTask(t, get().folders)
        const to = patchForStage(stages, i)
        // moving between columns sets how far along it is, to that column's break point (a count follows, if there is one)
        const percents = percentsFor(stages.length, (get().folders.find((f) => f.stages === stages) ?? get().folders.find((f) => f.id === t.folderIds[0]))?.stagePercents)
        const at = percentForStage(i, percents)
        const withProgress: Partial<Task> = !keepProgress && hasProgress(t.kind) ? { progress: at, ...(t.tally ? { tally: { ...t.tally, done: Math.round((t.tally.total * at) / 100) } } : {}) } : {}
        if (stageIndex(t, stages) === Math.max(0, Math.min(stages.length - 1, i)) && t.status === to.status && t.stage === to.stage) {
          if (Object.keys(withProgress).length && (t.progress ?? null) !== at) get().updateTask(id, withProgress)
          return
        }
        if (t.status === 'done' && to.status !== 'done') sound.undone()
        if (to.status === 'done' && t.status !== 'done') {
          sound.bloom()
          // keep it on screen long enough to bloom, then it fades out
          set((s) => ({ lingering: { ...s.lingering, [id]: true } }))
          window.setTimeout(() => {
            // If it was undone during the grace period, or its details are still open, do not remove it.
            if (get().selectedId === id || get().tasks.find((x) => x.id === id)?.status !== 'done') return
            set((s) => {
              const { [id]: _l, ...lingering } = s.lingering
              return { lingering }
            })
          }, 5000)
        }
        if (t.status === 'done' && to.status !== 'done') {
          set((s) => {
            const { [id]: _l, ...lingering } = s.lingering
            return { lingering }
          })
        }
        get().updateTask(id, { ...to, ...withProgress, completedAt: to.status === 'done' ? (t.completedAt ?? Date.now()) : null })
      },
      setProgress: (id, pct) => {
        const t = get().tasks.find((x) => x.id === id)
        if (!t || !hasProgress(t.kind)) return
        const p = Math.max(0, Math.min(100, Math.round(pct)))
        get().updateTask(id, { progress: p, ...(t.tally ? { tally: { ...t.tally, done: Math.round((t.tally.total * p) / 100) } } : {}) })
        // and it belongs in the column that percent reaches
        const stages = stagesForTask(t, get().folders)
        const percents = percentsFor(stages.length, get().folders.find((f) => f.id === t.folderIds[0])?.stagePercents)
        const to = stageForPercent(p, percents)
        if (stageIndex({ stage: t.stage, status: t.status }, stages) !== to) get().moveToStage(id, to, stages, true)
      },
      setTally: (id, tally) => {
        const t = get().tasks.find((x) => x.id === id)
        if (!t || !hasProgress(t.kind)) return
        if (!tally) return get().updateTask(id, { tally: null })
        const total = Math.max(0, Math.round(tally.total))
        const done = Math.max(0, Math.min(total, Math.round(tally.done)))
        get().updateTask(id, { tally: { done, total } })
        if (total > 0) get().setProgress(id, percentOfCount(done, total))
      },
      addToFolder: (taskId, folderId) => {
        const t = get().tasks.find((x) => x.id === taskId)
        if (!t || t.folderIds.includes(folderId)) return
        get().updateTask(taskId, { folderIds: [...t.folderIds, folderId], tagOrder: [...tagsOf(t).map((x) => x.id), folderId] })
      },
      removeFromFolder: (taskId, folderId) => {
        const t = get().tasks.find((x) => x.id === taskId)
        if (!t) return
        get().updateTask(taskId, { folderIds: t.folderIds.filter((f) => f !== folderId), tagOrder: tagsOf(t).map((x) => x.id).filter((x) => x !== folderId) })
      },
      addPerson: (taskId, personId) => {
        const t = get().tasks.find((x) => x.id === taskId)
        if (!t || t.personIds.includes(personId)) return
        get().updateTask(taskId, { personIds: [...t.personIds, personId], tagOrder: [...tagsOf(t).map((x) => x.id), personId] })
      },
      removePerson: (taskId, personId) => {
        const t = get().tasks.find((x) => x.id === taskId)
        if (!t) return
        get().updateTask(taskId, { personIds: t.personIds.filter((p) => p !== personId), tagOrder: tagsOf(t).map((x) => x.id).filter((x) => x !== personId) })
      },
      setDue: (taskId, due, dueTime) => {
        const t = get().tasks.find((x) => x.id === taskId)
        if (!t) return
        const time = due ? (dueTime === undefined ? (t.dueTime ?? null) : dueTime) : null
        const patch: Partial<Task> = { due, dueTime: time, urgency: urgencyForDue(t.urgency, due) }
        if (due && t.start && t.start > due) patch.start = due
        get().updateTask(taskId, patch)
        // A due date brings a reminder with it (unless this item has had one before, or the person has turned that off): with a time, an hour
        // before; without, the morning of. It shows like any other reminder, so it can be changed or taken away, and stays gone once it has been.
        if (due && get().settings.autoRemind && t.kind !== 'idea' && t.dueRemindBefore === undefined && (t.dueRemindAt ?? null) === null) {
          const now = Date.now()
          if (time) {
            const [h, m] = time.split(':').map(Number)
            const d = fromISO(due)
            d.setHours(h, m, 0, 0)
            const at = d.getTime() - 60 * 60_000
            if (at > now) get().setReminder(taskId, at, null, 'due')
          } else {
            const at = remindFromRule({ day: null, due, time: null }, 0, now, 'due')
            if (at) get().setReminder(taskId, at, 0, 'due')
          }
        }
      },

      setDay: (taskId, day) => get().updateTask(taskId, { day }),
      rollover: () => {
        const now = today()
        const snapshot = get()
        if (snapshot.settings.autoCompletePastDue) {
          for (const t of snapshot.tasks) {
            if (t.status === 'done' || t.draft || repeatOf(t) || t.kind === 'idea') continue
            const past = t.kind === 'event' ? isPastEvent(t) : !!(t.due ?? t.day) && (t.due ?? t.day)! < now
            if (past) get().setStatus(t.id, 'done')
          }
        }
        const moves = new Map<string, string>()
        for (const t of get().tasks) {
          const to = rolloverDay(t, now)
          if (to && to !== t.day) moves.set(t.id, to)
        }
        if (moves.size) {
          set((s) => ({ tasks: s.tasks.map((t) => (moves.has(t.id) ? { ...t, day: moves.get(t.id)! } : t)) }))
          get().showToast(`Carried ${moves.size} unfinished ${moves.size === 1 ? 'task' : 'tasks'} forward`)
        }
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
      setReminder: (id, at, before = null, which = 'do') =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id !== id ? t : which === 'due' ? { ...t, dueRemindAt: at, dueReminded: false, dueRemindBefore: at === null ? null : before } : { ...t, remindAt: at, reminded: false, remindBefore: at === null ? null : before },
          ),
        })),
      discardDraft: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id || !t.draft) })),
      pruneCompleted: () => set((s) => {
        const durations = { hour: 60 * 60_000, day: 24 * 60 * 60_000, week: 7 * 24 * 60 * 60_000 } as const
        const retention = s.settings.completedRetention
        if (retention === 'never') return s
        const cutoff = Date.now() - durations[retention]
        const removed = new Set(s.tasks.filter((t) => t.status === 'done' && t.completedAt != null && t.completedAt <= cutoff).map((t) => t.id))
        if (!removed.size) return s
        const lingering = Object.fromEntries(Object.entries(s.lingering).filter(([id]) => !removed.has(id)))
        const removing = Object.fromEntries(Object.entries(s.removing).filter(([id]) => !removed.has(id)))
        return { tasks: s.tasks.filter((t) => !removed.has(t.id)), lingering, removing, selectedId: s.selectedId && removed.has(s.selectedId) ? null : s.selectedId }
      }),
      clearCompleted: () => set((s) => {
        const removed = new Set(s.tasks.filter((t) => t.status === 'done').map((t) => t.id))
        const lingering = Object.fromEntries(Object.entries(s.lingering).filter(([id]) => !removed.has(id)))
        const removing = Object.fromEntries(Object.entries(s.removing).filter(([id]) => !removed.has(id)))
        return {
          tasks: s.tasks.filter((t) => t.status !== 'done'),
          lingering,
          removing,
          selectedId: s.selectedId && removed.has(s.selectedId) ? null : s.selectedId,
        }
      }),

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

      applyRanks: (ranks) => set((s) => ({ tasks: s.tasks.map((t) => (t.id in ranks ? { ...t, rank: ranks[t.id] } : t)) })),
      dropTask: (taskId, target, hint) => {
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
          case 'list': {
            // dropped in the list view: where it lands among the others, as the new order (the list then follows "My order")
            if (!hint) return false
            const order = hint.ids.filter((id) => id !== taskId)
            const at = Math.max(0, Math.min(order.length, hint.index))
            const merged = [...order.slice(0, at), taskId, ...order.slice(at)]
            get().applyRanks(Object.fromEntries(merged.map((id, i) => [id, i * 1024])))
            get().setSetting('sortKey', 'manual')
            get().setSetting('sortDesc', false)
            return true
          }
          case 'stage': {
            // stage:<group id or ->:<stage id>: the columns of the Progress view it was dropped in
            const [fid, ...sid] = value.split(':')
            const folder = fid === '-' ? null : s.folders.find((f) => f.id === fid)
            const stages = stagesOf(folder)
            const stageId = sid.join(':')
            s.setStage(taskId, stageId, stages)
            // where it lands in the column: the spot it was dropped on, or at the top
            const now = get().tasks
            let plan: { rank: number; patches: Record<string, number> }
            if (hint) {
              const col = hint.ids.map((id) => now.find((x) => x.id === id)).filter((x): x is Task => !!x && x.id !== taskId)
              plan = planRank(col, hint.index)
            } else {
              const i = stages.findIndex((st) => st.id === stageId)
              plan = { rank: topRank(now.filter((x) => x.id !== taskId && stageIndex(x, stages) === i)), patches: {} }
            }
            get().applyRanks({ ...plan.patches, [taskId]: plan.rank })
            return true
          }
          default:
            return false
        }
      },
})
