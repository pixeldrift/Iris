import { describe, expect, it } from 'vitest'
import { blockOf, checkedLast, moveBlock, numbering, tidyDepths } from './listitems'
import type { ListItem } from './types'

const L = (spec: string): ListItem[] => spec.split(' ').map((s) => { const [id, d = '0', x] = s.split(':'); return { id, text: id, done: x === 'x', ...(+d ? { depth: +d } : {}) } })
const show = (items: ListItem[]) => items.map((i) => `${i.id}${i.depth ? ':' + i.depth : ''}`).join(' ')

describe('checklist outline', () => {
  it('an entry\'s block is itself and what is deeper right after it', () => {
    expect(blockOf(L('a b:1 c:2 d e:1'), 'a')).toEqual(['a', 'b', 'c'])
    expect(blockOf(L('a b:1 c:2 d e:1'), 'b')).toEqual(['b', 'c'])
  })
  it('moving carries the inside along and keeps the outline sound', () => {
    expect(show(moveBlock(L('a b:1 c d'), 'a', 'd', 0))).toBe('c a b:1 d')
    expect(show(moveBlock(L('a b c'), 'c', null, 1))).toBe('a b c:1')
    expect(show(moveBlock(L('a b:1 c'), 'a', null, 0))).toBe('c a b:1')
  })
  it('nothing sits more than one step below the one before it', () => {
    expect(show(tidyDepths(L('a:2 b:3 c')))).toBe('a b:1 c')
  })
  it('checked last, at every level, keeping each entry\'s inside with it', () => {
    expect(show(checkedLast(L('a:0:x b c:1:x d:1')))).toBe('b d:1 c:1 a')
  })
  it('numbers count among the entries at the same level', () => {
    expect(numbering(L('a b:1 c:1 d e:1'))).toEqual([1, 1, 2, 2, 1])
  })
})
