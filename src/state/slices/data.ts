import { diffDays, addDays, today } from '../../core/dates'
import { isDemoFolder, isDemoPerson, isDemoTask, seedData, shiftDemo } from '../../core/seed'
import type { SetState, GetState, DataSlice } from '../types'

export const createDataSlice = (set: SetState, get: GetState): DataSlice => ({
      importDemo: () => {
        const seed = seedData()
        const s = get()
        const tasks = seed.tasks.filter((t) => !s.tasks.some((x) => x.id === t.id))
        const folders = seed.folders.filter((f) => !s.folders.some((x) => x.id === f.id))
        const people = seed.people.filter((p) => !s.people.some((x) => x.id === p.id))
        // (what is added is relative to today, so are the demo items already here: they are brought up to it first)
        get().rebaseDemo()
        set((st) => ({ tasks: [...st.tasks, ...tasks], folders: [...st.folders, ...folders], people: [...st.people, ...people], settings: { ...st.settings, demoDate: today() } }))
        get().showToast(tasks.length + folders.length + people.length ? 'Demo data added' : 'The demo data is already here')
      },
      rebaseDemo: () => {
        // whole weeks only, so a weekly event stays on its weekday
        const weeks = Math.floor(diffDays(get().settings.demoDate, today()) / 7)
        if (weeks <= 0) return
        const days = weeks * 7
        set((st) => {
          const moved = shiftDemo(st.tasks, st.people, days)
          return { tasks: moved.tasks, people: moved.people, settings: { ...st.settings, demoDate: addDays(st.settings.demoDate, days) } }
        })
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
