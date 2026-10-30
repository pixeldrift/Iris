import { isDemoFolder, isDemoPerson, isDemoTask, seedData } from '../../core/seed'
import type { SetState, GetState, DataSlice } from '../types'

export const createDataSlice = (set: SetState, get: GetState): DataSlice => ({
      importDemo: () => {
        const seed = seedData()
        const s = get()
        const tasks = seed.tasks.filter((t) => !s.tasks.some((x) => x.id === t.id))
        const folders = seed.folders.filter((f) => !s.folders.some((x) => x.id === f.id))
        const people = seed.people.filter((p) => !s.people.some((x) => x.id === p.id))
        set((st) => ({ tasks: [...st.tasks, ...tasks], folders: [...st.folders, ...folders], people: [...st.people, ...people] }))
        get().showToast(tasks.length + folders.length + people.length ? 'Demo data added' : 'The demo data is already here')
      },
      removeDemo: () => {
        set((st) => {
          const tasks = st.tasks.filter((t) => !isDemoTask(t.id))
          // a demo group or person stays if something of yours still uses it
          const usedFolders = new Set(tasks.flatMap((t) => t.folderIds))
          const usedPeople = new Set(tasks.flatMap((t) => t.personIds))
          const keepParents = new Set(st.folders.filter((f) => !isDemoFolder(f.id)).map((f) => f.parentId))
          const folders = st.folders.filter((f) => !isDemoFolder(f.id) || usedFolders.has(f.id) || keepParents.has(f.id))
          const people = st.people.filter((p) => !isDemoPerson(p.id) || usedPeople.has(p.id))
          return {
            tasks,
            folders,
            people,
            selectedId: st.selectedId && tasks.some((t) => t.id === st.selectedId) ? st.selectedId : null,
            scope: st.scope.type === 'folder' && !folders.some((f) => f.id === (st.scope as { id: string }).id) ? { type: 'all' } : st.scope.type === 'person' && !people.some((p) => p.id === (st.scope as { id: string }).id) ? { type: 'all' } : st.scope,
          }
        })
        get().showToast('Demo data removed')
      },
      clearEverything: () => {
        set((st) => ({ tasks: [], folders: [], people: st.people.filter((p) => p.isMe), scope: { type: 'all' }, selectedId: null }))
        get().showToast('A fresh start')
      },
})
