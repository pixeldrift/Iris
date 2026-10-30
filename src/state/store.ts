import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { persistOptions } from './persist'
import { createDataSlice } from './slices/data'
import { createFoldersSlice } from './slices/folders'
import { createPeopleSlice } from './slices/people'
import { createTasksSlice } from './slices/tasks'
import { createUiSlice } from './slices/ui'
import type { State } from './types'

// the store, in slices: ui (view, scope, settings, toast), tasks, folders, people, and bulk data actions
export { applyAudio } from './defaults'
export type { ContactPrompt, Settings } from './types'
export { SECTION_IDS } from './types'

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...createUiSlice(set, get),
      ...createTasksSlice(set, get),
      ...createFoldersSlice(set, get),
      ...createPeopleSlice(set, get),
      ...createDataSlice(set, get),
    }),
    persistOptions as never,
  ),
)
