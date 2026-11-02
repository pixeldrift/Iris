import type { SimNode } from '../../core/flock'

export const MIN_SCALE = 0.2
export const MAX_SCALE = 3

export type PopMode = 'off' | 'fun' | 'delete' | 'game'

export interface View {
  scale: number
  tx: number
  ty: number
}

/** Everything a bubble needs from the pond, kept in one stable object. */
export interface PondApi {
  container: React.RefObject<HTMLDivElement | null>
  view: React.MutableRefObject<View>
  dims: React.MutableRefObject<{ w: number; h: number }>
  register: (id: string, outer: HTMLElement | null, jig: HTMLElement | null) => void
  getFrac: (id: string) => { x: number; y: number }
  drag: (id: string, fx: number, fy: number) => void
  grab: (id: string) => void
  release: (id: string, committed: boolean) => void
  /** Only in Free mode do drags change a bubble's saved position. */
  isFree: () => boolean
  /** Pop mode: in `delete` pressing a bubble deletes it on the spot; in `fun` and `game` it only pops (and comes back). */
  popMode: () => PopMode
  /** A bubble popped for fun or in the game: nothing is deleted. */
  funPop: (id: string) => void
}

export interface Rec {
  sim: SimNode
  bumped: number
}
