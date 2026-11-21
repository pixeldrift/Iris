// What the spatial workspace remembers on this device: where things are (kept by task and group id, apart from the tasks themselves),
// and the person's choices. Nothing here is a sensor reading, and none of it is synced.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { curveFromRadius, RADIUS } from './layout'
import type { EnvironmentKind, SpatialLayoutData, SpatialLook, TrackingPreference } from './types'

interface SpatialState {
  layout: SpatialLayoutData
  environment: EnvironmentKind
  tracking: TrackingPreference
  /** Flat (2D, the default) or 3D. */
  view: SpatialLook
  /** The first-use explanation of 3D has been read, and the person does not want it again. */
  seen: boolean
  /** The one-line tip about holding to move things has been shown. */
  tipSeen: boolean
  /** Draw the faint curves joining a group to its subgroups. */
  links: boolean
  /** Little dots along the edge of the screen pointing to groups and loose cards that are out of view: one choice for the flat view and one for 3D. */
  edgeDots2d: boolean
  edgeDots3d: boolean
  /** Subgroups move along with the group they belong to (the default); off, every group is moved on its own. */
  attached: boolean
  /** "Keep tidy": things let go in Space snap to a grid, so it stays organised. */
  tidy: boolean
  /** How curved the wall is (0 flat … 100 wraps round you); null is Automatic: flat while the camera holds a surface, gently curved otherwise. */
  curve: number | null
  /** Wall mode: how much the view is smoothed (0: follows every twitch, 1: very steady). */
  wallSteady: number
  /** Groups folded down to just their names. */
  collapsed: Record<string, true>
  toggleCollapsed: (id: string) => void
  setLayout: (l: SpatialLayoutData) => void
  set: (p: Partial<Pick<SpatialState, 'environment' | 'tracking' | 'view' | 'seen' | 'tipSeen' | 'links' | 'edgeDots2d' | 'edgeDots3d' | 'tidy' | 'attached' | 'curve' | 'wallSteady'>>) => void
  /** Forget where things were put (they are laid out afresh). */
  resetLayout: () => void
}

export const useSpatial = create<SpatialState>()(
  persist(
    (set) => ({
      layout: { clusters: {}, tasks: {} },
      environment: 'virtual',
      tracking: 'auto',
      view: '2d',
      seen: false,
      tipSeen: false,
      links: true,
      edgeDots2d: true,
      edgeDots3d: true,
      tidy: true,
      attached: true,
      curve: null,
      wallSteady: 0.15,
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
      name: 'lilac-spatial-v5',
      version: 3,
      // the usual radius is now 200: a person who never moved it off the old usual (150) follows
      migrate: (state, version) => {
        const s = state as { radius?: number; curve?: number | null; render?: string; view?: string; tracking?: string }
        if (version < 1 && s.radius === 150) s.radius = RADIUS.start
        if (version < 3) {
          // a radius someone had chosen by hand becomes the same bend; the usual one is now Automatic
          s.curve = typeof s.radius === 'number' && s.radius !== RADIUS.start ? curveFromRadius(s.radius) : null
          delete s.radius
        }
        if (version < 2) {
          // 2D is where everyone starts now; the old "Wall" drawing is the camera way of tracking in 3D
          if (s.render === 'wall') s.tracking = 'camera'
          s.view = '2d'
          delete s.render
        }
        return s as never
      },
      // the camera is never started by itself: it comes back as the virtual room until the person asks for it again
      partialize: (s) => ({ layout: s.layout, environment: s.environment === 'camera' ? 'virtual' : s.environment, tracking: s.tracking, view: s.view, seen: s.seen, tipSeen: s.tipSeen, links: s.links, edgeDots2d: s.edgeDots2d, edgeDots3d: s.edgeDots3d, tidy: s.tidy, attached: s.attached, curve: s.curve, wallSteady: s.wallSteady, collapsed: s.collapsed }),
    },
  ),
)
