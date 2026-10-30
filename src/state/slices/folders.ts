import { canReparent, nextHue, reorder, shapeFor, withoutFolder } from '../../core/folders'
import { sameName } from '../../core/fuzzy'
import type { Folder } from '../../core/types'
import * as sound from '../../audio/engine'
import { initial, uid } from '../defaults'
import type { SetState, GetState, FoldersSlice } from '../types'

export const createFoldersSlice = (set: SetState, get: GetState): FoldersSlice => ({
      folders: initial.folders,
      updateFolder: (id, patch) => set((s) => ({ folders: s.folders.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),

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
            ...withoutFolder(s.folders, s.tasks, id),
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
})
