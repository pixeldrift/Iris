// The shapes shared by the spatial workspace's parts. The task data stays the single source of truth (src/core/types.ts); a spatial
// layout is a separate record of where things sit, keyed by their stable ids, and the renderer only ever sees a camera pose and a
// tracking quality, never which sensor (or, one day, ARKit) produced them.

/** What a unit of the world means: one unit is about one metre. The viewer's eyes are at the origin, looking down -Z. */
/**
 * Everything is drawn big and far (the wall is a distant, gently curved cylinder), and the camera looks at it through a narrow lens, so
 * perspective stays gentle: cards at the sides of the wall are hardly more slanted than those in the middle. `K` scales the whole room
 * (apparent sizes do not change with it; it just keeps the cards far from the eye). The wall is 80 units away.
 */
export const K = 80 / 9
export const WORLD = { eye: 0, ring: 9 * K, cardW: 1.9 * K, cardH: 0.66 * K, gap: 0.2 * K } as const

/** Optional reference for future AR: where in a real room this was pinned (never filled by sensor readings). */
export interface SpatialAnchor {
  kind: 'heading' | 'native'
  id: string
}

export interface ClusterPlacement {
  /** Centre of the cluster's hub, in world units. */
  x: number
  y: number
  z: number
  /** Turn about the vertical axis (so the cluster faces the middle of the room). */
  ry: number
  /** Tilt toward the eye (a group above or below eye level leans to face the viewer, so nothing is seen at a steep angle). */
  rx?: number
  /** Half the height of its grid (so the tilt aims at its middle, not its name). */
  half?: number
  /** Where on the ring it sits (radians, 0 = straight ahead, growing to the right) and how far out. */
  a: number
  r: number
  /** How many cards wide its grid is. */
  cols: number
  /** Which row of groups it is on (0 = the first, then below it). */
  tier?: number
  /** How deep it is in the group tree (0 = a top-level group), and how many rows of cards it has. */
  depth?: number
  rows?: number
  parent: string | null
  scale?: number
  anchor?: SpatialAnchor
}

export interface TaskPlacement {
  /** Which cluster it sits in. */
  c: string
  /** Where, in the cluster's own plane: across, down from the hub, and a little out toward the viewer. */
  u: number
  v: number
  dz: number
  /** The grid slot it was given (a task dragged elsewhere keeps its slot free for no one: it is simply at its own u, v). */
  slot: number
  rot?: number
  /** Pulled out of its group: floating on the cylinder at this angle and height until it is dropped into one. */
  free?: { a: number; y: number }
  anchor?: SpatialAnchor
}

export interface SpatialLayoutData {
  clusters: Record<string, ClusterPlacement>
  tasks: Record<string, TaskPlacement>
}

/** How good the camera pose is. `none` means the provider has stopped reporting. */
export type TrackingQuality = 'good' | 'limited' | 'none'
export type TrackingSource = 'touch' | 'motion' | 'visual' | 'native'
export type EnvironmentKind = 'virtual' | 'camera' | 'panorama'
export type TrackingPreference = 'auto' | 'motion' | 'touch'
export type RenderMode = 'auto' | 'simple'

/** What the renderer is given each frame. */
export interface CameraPose {
  /** Rotation of the camera (x, y, z, w). */
  q: [number, number, number, number]
  /** Position, when the provider knows it (the sensor and touch providers do not: they give orientation only). */
  position: [number, number, number] | null
  quality: TrackingQuality
  source: TrackingSource
}

export interface TrackingStatus {
  source: TrackingSource
  quality: TrackingQuality
  /** A plain-language note when something changed (a permission was declined, the sensor went quiet). */
  note?: string
}

export interface TrackingProvider {
  readonly id: string
  /** Begin (asking for permission if it needs it, from a user gesture). Resolves with whether it is now running. */
  start(): Promise<boolean>
  stop(): void
  /** Make "straight ahead" be where the viewer is looking now. */
  recenter(): void
  getPose(): CameraPose
  onStatus(cb: (s: TrackingStatus) => void): () => void
}
