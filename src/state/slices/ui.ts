import { applyAudio, DEFAULT_SETTINGS } from '../defaults'
import { SECTION_IDS } from '../types'
import type { SetState, GetState, UiSlice } from '../types'

export const createUiSlice = (set: SetState, get: GetState): UiSlice => ({
      scope: { type: 'all' },
      view: 'pond',
      settings: DEFAULT_SETTINGS,
      selectedId: null,
      sidebarOpen: false,
      navHidden: false,
      removing: {},
      lingering: {},
      sidebar: { order: [...SECTION_IDS], collapsed: [] },
      contactPrompt: null,
      toast: null,

      setScope: (scope) => set({ scope, sidebarOpen: false }),
      // (with the option on, a new view starts from Everything; the address book is a page of its own, not a filter)
      setView: (view) =>
        set((st) => ({ view, sidebarOpen: false, ...(st.settings.viewsClearFilters && st.scope.type !== 'contacts' && view !== st.view ? { scope: { type: 'all' as const } } : {}) })),
      select: (selectedId) => set({ selectedId }),
      setSidebar: (sidebarOpen) => set({ sidebarOpen }),
      setNavHidden: (navHidden) => set({ navHidden }),
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
      showToast: (text, action) => {
        const id = Date.now()
        set({ toast: { id, text, action } })
        window.setTimeout(() => set((s) => (s.toast?.id === id ? { toast: null } : s)), action ? 6000 : 3600)
      },
})
