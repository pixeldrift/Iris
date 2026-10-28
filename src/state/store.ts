import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { addDays, today } from '../core/dates'
import { canReparent, descendantIds, nextHue, pathOf, reorder, shapeFor } from '../core/folders'
import { sameName } from '../core/fuzzy'
import { fullName, MAX_FAVORITES, splitName } from '../core/people'
import { detectContactIntent, matchPerson, type ContactVerb } from '../core/people'
import { seedData } from '../core/seed'
import { currentOccurrence, repeatOf } from '../core/recurrence'
import { eventStart } from '../core/reminders'
import { rolloverDay, urgencyForDue } from '../core/tasks'
import type { Folder, Person, PondGroup, Scope, SortKey, Task, TaskKind, TaskStatus, ViewId } from '../core/types'
import * as sound from '../audio/engine'

export interface Settings {
  /** Master switch: tapping the sound icon flips this. */
  sound: boolean
  sfxDrops: boolean
  sfxChimes: boolean
  sfxPops: boolean
  ambient: boolean
  volume: number
  drift: boolean
  sizeByPriority: boolean
  showDone: boolean
  sortKey: SortKey
  sortDesc: boolean
  pondGroup: PondGroup
  /** Sidebar spacing, 0 (compact) to 1 (relaxed). */
  sidebarSpace: number
  /** Timeline: show the task names in a column on the left instead of on the bars. */
  timelineLegend: boolean
  /** The interface's base color, as a hue (271 is the original violet). */
  themeHue: number
  /** How dates are written (see core/locale). */
  dateFormat: 'us' | 'us-numeric' | 'dmy' | 'iso'
  clockFormat: '12' | '24'
}

export interface ContactPrompt {
  taskId: string
  name: string
  verb: ContactVerb
}

// (the Views list is pinned at the top and is not one of the movable sections)
export const SECTION_IDS = ['people', 'week', 'folders'] as const

interface State {
  tasks: Task[]
  folders: Folder[]
  people: Person[]
  scope: Scope
  view: ViewId
  settings: Settings
  selectedId: string | null
  sidebarOpen: boolean
  /** Not persisted: ids mid exit-animation. */
  removing: Record<string, true>
  lingering: Record<string, true>
  /** Sidebar sections: their order and which are folded shut. */
  sidebar: { order: string[]; collapsed: string[] }
  contactPrompt: ContactPrompt | null
  toast: { id: number; text: string; action?: { label: string; run: () => void } } | null

  setScope: (s: Scope) => void
  setView: (v: ViewId) => void
  select: (id: string | null) => void
  setSidebar: (open: boolean) => void
  /** What is typed in the search box (not saved). Views filter or highlight by it. */
  search: string
  setSearch: (q: string) => void
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void
  toggleSection: (id: string) => void
  /** Put a sidebar section before `beforeId` (null = last). */
  moveSection: (id: string, beforeId: string | null) => void
  updateFolder: (id: string, patch: Partial<Folder>) => void

  addTask: (p: Partial<Task> & { title: string }) => string
  updateTask: (id: string, patch: Partial<Task>) => void
  deleteTask: (id: string) => void
  toggleDone: (id: string) => void
  setStatus: (id: string, s: TaskStatus) => void
  addToFolder: (taskId: string, folderId: string) => void
  removeFromFolder: (taskId: string, folderId: string) => void
  addPerson: (taskId: string, personId: string) => void
  removePerson: (taskId: string, personId: string) => void
  setDue: (taskId: string, due: string | null) => void
  /** Plan the task for a day (separate from its deadline). */
  setDay: (taskId: string, day: string | null) => void
  /** Move unfinished tasks planned for past days to their next available day. */
  rollover: () => void
  /** Dragging a bubble into another pond cluster re-tags it to match. */
  assignToGroup: (taskId: string, mode: PondGroup, key: string) => void
  showToast: (text: string, action?: { label: string; run: () => void }) => void

  addFolder: (name: string, parentId?: string | null) => string
  ensureFolderPath: (path: string, parentId?: string | null) => string
  renameFolder: (id: string, name: string) => void
  deleteFolder: (id: string) => void
  /** Re-parent and/or reorder: `beforeId` = sibling to sit in front of (null = last). */
  moveFolder: (id: string, parentId: string | null, beforeId?: string | null) => void

  savePerson: (p: Partial<Person> & { name: string }) => string
  deletePerson: (id: string) => void
  togglePersonFavorite: (id: string) => void
  /** Throw away a task that was only being set up in the quick-add box. */
  discardDraft: (id: string) => void
  /** Make sure the signed-in person has their own contact entry (the same id on every device). */
  ensureMe: (user: { id: string; name: string; email: string }) => void
  /** Set (or clear with null) the alert on a task. */
  setReminder: (id: string, at: number | null) => void

  /** Look at a task's title for "call/email Sarah" and link or ask. */
  checkContact: (taskId: string) => void
  resolveContact: (personId: string | null) => void

  /** Single entry point for every drag & drop in the app. */
  dropTask: (taskId: string, target: string) => boolean
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

const initial = seedData()

const DEFAULT_SETTINGS: Settings = {
  sound: true,
  sfxDrops: true,
  sfxChimes: true,
  sfxPops: true,
  ambient: false,
  volume: 0.7,
  drift: true,
  sizeByPriority: true,
  showDone: false,
  sortKey: 'flow',
  sortDesc: false,
  pondGroup: 'free',
  sidebarSpace: 0.5,
  timelineLegend: false,
  themeHue: 271,
  dateFormat: 'us',
  clockFormat: '12',
}

export const applyAudio = (s: Settings) =>
  sound.setAudioConfig({
    master: s.sound,
    drops: s.sfxDrops,
    chimes: s.sfxChimes,
    pops: s.sfxPops,
    ambient: s.ambient,
    volume: s.volume,
  })

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      tasks: initial.tasks,
      folders: initial.folders,
      people: initial.people,
      scope: { type: 'all' },
      view: 'pond',
      settings: DEFAULT_SETTINGS,
      selectedId: null,
      sidebarOpen: false,
      removing: {},
      lingering: {},
      sidebar: { order: [...SECTION_IDS], collapsed: [] },
      contactPrompt: null,
      toast: null,

      setScope: (scope) => set({ scope, sidebarOpen: false }),
      setView: (view) => set({ view, sidebarOpen: false }),
      select: (selectedId) => set({ selectedId }),
      setSidebar: (sidebarOpen) => set({ sidebarOpen }),
      search: '',
      setSearch: (search) => set({ search }),
      setSetting: (k, v) => {
        set((s) => ({ settings: { ...s.settings, [k]: v } }))
        applyAudio(get().settings)
      },

      toggleSection: (id) =>
        set((s) => ({
          sidebar: { ...s.sidebar, collapsed: s.sidebar.collapsed.includes(id) ? s.sidebar.collapsed.filter((x) => x !== id) : [...s.sidebar.collapsed, id] },
        })),
      moveSection: (id, beforeId) =>
        set((s) => {
          const rest = s.sidebar.order.filter((x) => x !== id)
          const at = beforeId ? rest.indexOf(beforeId) : -1
          rest.splice(at < 0 ? rest.length : at, 0, id)
          return { sidebar: { ...s.sidebar, order: rest } }
        }),
      updateFolder: (id, patch) => set((s) => ({ folders: s.folders.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),

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
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
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
        if (!t || t.status === status) return
        if (status === 'done') {
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
        get().updateTask(id, { status, completedAt: status === 'done' ? Date.now() : null })
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
      showToast: (text, action) => {
        const id = Date.now()
        set({ toast: { id, text, action } })
        window.setTimeout(() => set((s) => (s.toast?.id === id ? { toast: null } : s)), action ? 6000 : 3600)
      },

      addFolder: (name, parentId = null) => {
        const { folders } = get()
        const id = uid()
        const sibs = folders.filter((f) => f.parentId === parentId)
        const folder: Folder = {
          id,
          name: name.trim() || 'Untitled',
          parentId,
          hue: nextHue(folders.length),
          shape: shapeFor(folders.length),
          sort: sibs.length ? Math.max(...sibs.map((f) => f.sort)) + 1 : 0,
          createdAt: Date.now(),
        }
        set({ folders: [...folders, folder] })
        return id
      },
      ensureFolderPath: (path, parentId = null) => {
        let parent = parentId
        for (const part of path.split('/').map((p) => p.trim()).filter(Boolean)) {
          const existing = get().folders.find((f) => f.parentId === parent && sameName(f.name, part))
          parent = existing ? existing.id : get().addFolder(part, parent)
        }
        return parent as string
      },
      renameFolder: (id, name) => {
        if (!name.trim()) return
        set((s) => ({ folders: s.folders.map((f) => (f.id === id ? { ...f, name: name.trim() } : f)) }))
      },
      deleteFolder: (id) =>
        set((s) => {
          const target = s.folders.find((f) => f.id === id)
          if (!target) return s
          return {
            folders: s.folders
              .filter((f) => f.id !== id)
              .map((f) => (f.parentId === id ? { ...f, parentId: target.parentId } : f)),
            tasks: s.tasks.map((t) => ({ ...t, folderIds: t.folderIds.filter((f) => f !== id) })),
            scope: s.scope.type === 'folder' && s.scope.id === id ? { type: 'all' } : s.scope,
          }
        }),
      moveFolder: (id, parentId, beforeId = null) => {
        const { folders } = get()
        if (!canReparent(folders, id, parentId) || beforeId === id) return
        const order = reorder(folders, id, parentId, beforeId)
        set({
          folders: folders.map((f) =>
            f.id === id ? { ...f, parentId, sort: order.get(id)! } : order.has(f.id) ? { ...f, sort: order.get(f.id)! } : f,
          ),
        })
        sound.plink()
      },

      savePerson: (p) => {
        const existing = p.id ? get().people.find((x) => x.id === p.id) : undefined
        // the sidebar has room for six favorites: a seventh is saved, just not hearted
        if (p.favorite && !existing?.favorite && get().people.filter((x) => x.favorite && x.id !== p.id).length >= MAX_FAVORITES) {
          p = { ...p, favorite: false }
          get().showToast(`The sidebar keeps ${MAX_FAVORITES} favorites. Unheart someone to make room.`)
        }
        if (existing) {
          set((s) => ({ people: s.people.map((x) => (x.id === existing.id ? { ...x, ...p } : x)) }))
          return existing.id
        }
        const person: Person = {
          id: uid(),
          phone: '',
          email: '',
          address: '',
          notes: '',
          hue: nextHue(get().people.length + 3),
          favorite: false,
          createdAt: Date.now(),
          ...p,
        }
        set((s) => ({ people: [...s.people, person] }))
        return person.id
      },
      setReminder: (id, at) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, remindAt: at, reminded: false } : t)) })),
      ensureMe: (user) => {
        const id = `me-${user.id}`
        if (get().people.some((p) => p.id === id)) return
        const n = splitName(user.name || user.email.split('@')[0])
        set((s) => ({
          people: [...s.people, { id, name: fullName(n.first, n.last), first: n.first, last: n.last, phone: '', email: user.email, address: '', notes: '', hue: 285, favorite: false, isMe: true, createdAt: Date.now() }],
        }))
      },
      discardDraft: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id || !t.draft) })),
      togglePersonFavorite: (id) => {
        const p = get().people.find((x) => x.id === id)
        if (!p) return
        if (!p.favorite && get().people.filter((x) => x.favorite && !x.isMe).length >= MAX_FAVORITES) {
          get().showToast(`The sidebar keeps ${MAX_FAVORITES} favorites. Unheart someone to make room.`)
          return
        }
        set((s) => ({ people: s.people.map((x) => (x.id === id ? { ...x, favorite: !x.favorite } : x)) }))
      },
      deletePerson: (id) =>
        set((s) => ({
          people: s.people.filter((p) => p.id !== id),
          tasks: s.tasks.map((t) => ({ ...t, personIds: t.personIds.filter((x) => x !== id) })),
          scope: s.scope.type === 'person' && s.scope.id === id ? { type: 'all' } : s.scope,
        })),

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
          default:
            return false
        }
      },
    }),
    {
      name: 'lilac-v1',
      version: 11,
      partialize: (s) => ({
        tasks: s.tasks,
        folders: s.folders,
        people: s.people,
        scope: s.scope,
        view: s.view,
        settings: s.settings,
        sidebar: s.sidebar,
      }),
      migrate: (persisted, from) => {
        const p = persisted as Partial<State> & { settings?: Partial<Settings> }
        if (from < 2) {
          p.people = p.people ?? []
          p.tasks = (p.tasks ?? []).map((t) => ({ ...t, personIds: t.personIds ?? [] }))
          p.folders = (p.folders ?? []).map((f, i) => ({ ...f, sort: f.sort ?? i }))
        }
        if (from < 3) {
          p.tasks = (p.tasks ?? []).map((t) => ({ ...t, day: t.day ?? null, rollover: t.rollover ?? true, days: t.days ?? null }))
        }
        if (from < 5) {
          // folders saved before flowers existed get a spread of shapes, in their existing order
          p.folders = (p.folders ?? []).map((f, i) => ({ ...f, shape: f.shape ?? shapeFor(i) }))
        }
        if (from < 6) {
          // reminders became plain tasks: a reminder is any task with an alarm, not a type of its own
          p.tasks = (p.tasks ?? []).map((t) => ({ ...t, kind: (t.kind as string) === 'reminder' ? 'task' : t.kind, items: t.items ?? [], listStyle: t.listStyle ?? 'check' }))
        }
        if (from < 7) {
          p.tasks = (p.tasks ?? []).map((t) => ({ ...t, time: t.time ?? null, endTime: t.endTime ?? null, place: t.place ?? '', log: t.log ?? [] }))
        }
        if (from < 8) {
          // everyone already in the sidebar stays there: hearts are for the people added from now on
          p.people = (p.people ?? []).map((x) => ({ ...x, favorite: x.favorite ?? true }))
        }
        if (from < 9) {
          p.tasks = (p.tasks ?? []).map((t) => ({ ...t, remindAt: t.remindAt ?? null, reminded: t.reminded ?? false }))
        }
        if (from < 10) {
          // one model for repeating things: a habit's weekdays become its recurrence
          p.tasks = (p.tasks ?? []).map((t) => {
            const start = new Date(t.createdAt ?? Date.now())
            const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
            if (t.kind === 'habit' && !t.repeat) {
              return { ...t, repeat: t.days?.length ? { freq: 'weekly' as const, interval: 1, byDay: t.days, from } : { freq: 'daily' as const, interval: 1, from }, days: null }
            }
            return { ...t, repeat: t.repeat ?? null }
          })
        }
        if (from < 11) {
          // events keep their reminders as "minutes before the start"; an old one-off reminder becomes one of those
          p.tasks = (p.tasks ?? []).map((t) => {
            const alerts = t.alerts ?? []
            const start = t.kind === 'event' ? eventStart(t) : null
            if (start && t.remindAt !== null && t.remindAt <= start && !alerts.length) {
              return { ...t, alerts: [Math.round((start - t.remindAt) / 60000)], alertsDone: t.reminded ? [`${start}:${Math.round((start - t.remindAt) / 60000)}`] : [], remindAt: null, reminded: false }
            }
            return { ...t, alerts, alertsDone: t.alertsDone ?? [] }
          })
        }
        p.settings = { ...DEFAULT_SETTINGS, ...(p.settings as Settings) }
        return p as State
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>
        const settings = { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) }
        // the lavender flower was retired: folders that had it become bluebells
        if (p.folders) p.folders = p.folders.map((f) => ((f.shape as string) === 'lavender' ? { ...f, shape: 'bell' as const } : f))
        if (!['free', 'folder', 'due', 'kind', 'person'].includes(settings.pondGroup)) settings.pondGroup = 'free'
        // sections added in later versions slot in at the end; unknown ones are dropped
        const saved = (p as Partial<State>).sidebar
        const order = [...(saved?.order ?? []).filter((x) => (SECTION_IDS as readonly string[]).includes(x)), ...SECTION_IDS.filter((x) => !(saved?.order ?? []).includes(x))]
        // a task left half-made when the page closed is not a task
        if (p.tasks) p.tasks = p.tasks.filter((t) => !t.draft)
        return { ...current, ...p, settings, sidebar: { order, collapsed: saved?.collapsed ?? [] } }
      },
      onRehydrateStorage: () => (s) => {
        if (s) applyAudio(s.settings)
      },
    },
  ),
)
