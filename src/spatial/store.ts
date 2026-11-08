// What the spatial workspace remembers on this device: where things are (kept by task and group id, apart from the tasks themselves),
// and the person's choices. Nothing here is a sensor reading, and none of it is synced.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { RADIUS } from './layout'
import type { EnvironmentKind, RenderMode, SpatialLayoutData, TrackingPreference } from './types'

interface SpatialState {
  layout: SpatialLayoutData
  environment: EnvironmentKind
  tracking: TrackingPreference
  render: RenderMode
  /** The first-use explanation has been read. */
  seen: boolean
  /** The one-line tip about holding to move things has been shown. */
  tipSeen: boolean
  /** Draw the faint curves joining a group to its subgroups. */
  links: boolean
  /** The radius of the cylinder the groups hang on (a testing control). */
  radius: number
  /** Groups folded down to just their names. */
  collapsed: Record<string, true>
  toggleCollapsed: (id: string) => void
  setLayout: (l: SpatialLayoutData) => void
  set: (p: Partial<Pick<SpatialState, 'environment' | 'tracking' | 'render' | 'seen' | 'tipSeen' | 'links' | 'radius'>>) => void
  /** Forget where things were put (they are laid out afresh). */
  resetLayout: () => void
}

export const useSpatial = create<SpatialState>()(
  persist(
    (set) => ({
      layout: { clusters: {}, tasks: {} },
      environment: 'virtual',
      tracking: 'auto',
      render: 'auto',
      seen: false,
      tipSeen: false,
      links: true,
      radius: RADIUS.start,
      collapsed: {},
      toggleCollapsed: (id) =>
        set((s) => {
          const c = { ...s.collapsed }
          if (c[id]) delete c[id]
          else c[id] = true
          return { collapsed: c }
        }),
      setLayout: (layout) => set({ layout }),
      set: (p) => set(p),
      resetLayout: () => set({ layout: { clusters: {}, tasks: {} } }),
    }),
    {
      name: 'lilac-spatial-v4',
      // the camera is never started by itself: it comes back as the virtual room until the person asks for it again
      partialize: (s) => ({ layout: s.layout, environment: s.environment === 'camera' ? 'virtual' : s.environment, tracking: s.tracking, render: s.render, seen: s.seen, tipSeen: s.tipSeen, links: s.links, radius: s.radius, collapsed: s.collapsed }),
    },
  ),
)
