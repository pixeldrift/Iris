import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { canReparent, nextHue, reorder } from '../core/folders'
import { sameName } from '../core/fuzzy'
import { detectContactIntent, matchPerson, type ContactVerb } from '../core/people'
import { seedData } from '../core/seed'
import { urgencyForDue } from '../core/tasks'
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
  magnet: boolean
  sizeByPriority: boolean
  showDone: boolean
  sortKey: SortKey
  sortDesc: boolean
  pondGroup: PondGroup
}

export interface ContactPrompt {
  taskId: string
  name: string
  verb: ContactVerb
}

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
  contactPrompt: ContactPrompt | null

  setScope: (s: Scope) => void
  setView: (v: ViewId) => void
  select: (id: string | null) => void
  setSidebar: (open: boolean) => void
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void

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

  addFolder: (name: string, parentId?: string | null) => string
  ensureFolderPath: (path: string, parentId?: string | null) => string
  renameFolder: (id: string, name: string) => void
  deleteFolder: (id: string) => void
  /** Re-parent and/or reorder: `beforeId` = sibling to sit in front of (null = last). */
  moveFolder: (id: string, parentId: string | null, beforeId?: string | null) => void

  savePerson: (p: Partial<Person> & { name: string }) => string
  deletePerson: (id: string) => void

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
  magnet: true,
  sizeByPriority: true,
  showDone: false,
  sortKey: 'flow',
  sortDesc: false,
  pondGroup: 'free',
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
      contactPrompt: null,

      setScope: (scope) => set({ scope, sidebarOpen: false }),
      setView: (view) => set({ view, sidebarOpen: false }),
      select: (selectedId) => set({ selectedId }),
      setSidebar: (sidebarOpen) => set({ sidebarOpen }),
      setSetting: (k, v) => {
        set((s) => ({ settings: { ...s.settings, [k]: v } }))
        applyAudio(get().settings)
      },

      addTask: (p) => {
        const { scope, folders } = get()
        const id = uid()
        const folderIds = p.folderIds ?? (scope.type === 'folder' ? [scope.id] : [])
        const personIds = p.personIds ?? (scope.type === 'person' ? [scope.id] : [])
        const due = p.due ?? (scope.type === 'day' ? scope.date : null)
        const task: Task = {
          id,
          notes: '',
          kind: 'task' as TaskKind,
          status: 'todo',
          importance: 0.5,
          urgency: urgencyForDue(0.3, due),
          x: 0.5,
          y: 0.5,
          start: null,
          due,
          folderIds,
          personIds,
          createdAt: Date.now(),
          completedAt: null,
          ...p,
        }
        task.folderIds = task.folderIds.filter((f) => folders.some((x) => x.id === f))
        set((s) => ({ tasks: [...s.tasks, task] }))
        get().checkContact(id)
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

      addFolder: (name, parentId = null) => {
        const { folders } = get()
        const id = uid()
        const sibs = folders.filter((f) => f.parentId === parentId)
        const folder: Folder = {
          id,
          name: name.trim() || 'Untitled',
          parentId,
          hue: nextHue(folders.length),
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
          createdAt: Date.now(),
          ...p,
        }
        set((s) => ({ people: [...s.people, person] }))
        return person.id
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
            s.setDue(taskId, value)
            sound.plink()
            return true
          case 'inbox':
            s.updateTask(taskId, { due: null, start: null, folderIds: [], personIds: [] })
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
      version: 2,
      partialize: (s) => ({
        tasks: s.tasks,
        folders: s.folders,
        people: s.people,
        scope: s.scope,
        view: s.view,
        settings: s.settings,
      }),
      migrate: (persisted, from) => {
        const p = persisted as Partial<State> & { settings?: Partial<Settings> }
        if (from < 2) {
          p.people = p.people ?? []
          p.tasks = (p.tasks ?? []).map((t) => ({ ...t, personIds: t.personIds ?? [] }))
          p.folders = (p.folders ?? []).map((f, i) => ({ ...f, sort: f.sort ?? i }))
        }
        p.settings = { ...DEFAULT_SETTINGS, ...(p.settings as Settings) }
        return p as State
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) } }
      },
      onRehydrateStorage: () => (s) => {
        if (s) applyAudio(s.settings)
      },
    },
  ),
)
