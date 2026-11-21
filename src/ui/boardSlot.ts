import { create } from 'zustand'

/**
 * Where in a Progress column the item being carried would land: the column it is over, the position in it, and the
 * column's other items in order. Set by the column while a drag is over it, read when the item is dropped.
 */
export const useBoardSlot = create<{ target: string | null; index: number; ids: string[]; /** Where the carried item already was among them, when it came from this list. */ own?: number }>(() => ({ target: null, index: 0, ids: [] }))
