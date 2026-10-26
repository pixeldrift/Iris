import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { canReparent, nextHue } from '../core/folders'
import { sameName } from '../core/fuzzy'
import { seedData } from '../core/seed'
import { urgencyForDue } from '../core/tasks'
import type { Folder, Scope, SortKey, Task, TaskKind, TaskStatus, ViewId } from '../core/types'
import * as sound from '../audio/engine'

export interface Settings {
  sound: boolean
  ambient: boolean
  drift: boolean
  sizeByPriority: boolean
  showDone: boolean
  sortKey: SortKey
  sortDesc: boolean
}

interface State {
  tasks: Task[]
  folders: Folder[]
  scope: Scope
  view: ViewId
  settings: Settings
  selectedId: string | null
  sidebarOpen: boolean

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
  setDue: (taskId: string, due: string | null) => void

  addFolder: (name: string, parentId?: string | null) => string
  /** "School/English 101" -> finds or creates the chain; returns the leaf id. */
  ensureFolderPath: (path: string, parentId?: string | null) => string
  renameFolder: (id: string, name: string) => void
  deleteFolder: (id: string) => void
  moveFolder: (id: string, parentId: string | null) => void

  /** Single entry point for every drag & drop in the app. */
  dropTask: (taskId: string, target: string) => boolean
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

const initial = seedData()

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      tasks: initial.tasks,
      folders: initial.folders,
      scope: { type: 'all' },
      view: 'pond',
      settings: {
        sound: true,
        ambient: false,
        drift: true,
        sizeByPriority: true,
        showDone: false,
        sortKey: 'flow',
        sortDesc: false,
      },
      selectedId: null,
      sidebarOpen: false,

      setScope: (scope) => set({ scope, sidebarOpen: false }),
      setView: (view) => set({ view, sidebarOpen: false }),
      select: (selectedId) => set({ selectedId }),
      setSidebar: (sidebarOpen) => set({ sidebarOpen }),
      setSetting: (k, v) => {
        set((s) => ({ settings: { ...s.settings, [k]: v } }))
        if (k === 'sound') sound.setFx(v as boolean)
        if (k === 'ambient') sound.setAmbient(v as boolean)
      },

      addTask: (p) => {
        const { scope, folders } = get()
        const id = uid()
        const folderIds = p.folderIds ?? (scope.type === 'folder' ? [scope.id] : [])
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
          createdAt: Date.now(),
          completedAt: null,
          ...p,
        }
        task.folderIds = task.folderIds.filter((f) => folders.some((x) => x.id === f))
        set((s) => ({ tasks: [...s.tasks, task] }))
        return id
      },
      updateTask: (id, patch) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      deleteTask: (id) =>
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
        })),
      toggleDone: (id) => {
        const t = get().tasks.find((x) => x.id === id)
        if (!t) return
        get().setStatus(id, t.status === 'done' ? 'todo' : 'done')
      },
      setStatus: (id, status) => {
        const t = get().tasks.find((x) => x.id === id)
        if (!t || t.status === status) return
        if (status === 'done') sound.bloom()
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
        const folder: Folder = {
          id,
          name: name.trim() || 'Untitled',
          parentId,
          hue: nextHue(folders.length),
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
          // children move up a level; tasks just lose the tag
          return {
            folders: s.folders
              .filter((f) => f.id !== id)
              .map((f) => (f.parentId === id ? { ...f, parentId: target.parentId } : f)),
            tasks: s.tasks.map((t) => ({ ...t, folderIds: t.folderIds.filter((f) => f !== id) })),
            scope: s.scope.type === 'folder' && s.scope.id === id ? { type: 'all' } : s.scope,
          }
        }),
      moveFolder: (id, parentId) => {
        if (!canReparent(get().folders, id, parentId)) return
        set((s) => ({ folders: s.folders.map((f) => (f.id === id ? { ...f, parentId } : f)) }))
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
          case 'day':
            s.setDue(taskId, value)
            sound.plink()
            return true
          case 'inbox':
            s.updateTask(taskId, { due: null, start: null, folderIds: [] })
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
      version: 1,
      partialize: (s) => ({
        tasks: s.tasks,
        folders: s.folders,
        scope: s.scope,
        view: s.view,
        settings: s.settings,
      }),
      onRehydrateStorage: () => (s) => {
        if (s) {
          sound.setFx(s.settings.sound)
          // ambient needs a user gesture; it is switched on from the UI
          s.settings.ambient = false
        }
      },
    },
  ),
)
