import { describe, expect, it } from 'vitest'
import { favoritesOf, sortName } from './people'

describe('favorites and name sorting', () => {
  it('orders favorites by hand, the rest as added, and leaves out me and non-favorites', () => {
    const p = (id: string, favorite: boolean, favOrder?: number, isMe?: boolean) => ({ id, favorite, favOrder, isMe })
    const out = favoritesOf([p('a', true), p('b', true, 1), p('c', false), p('d', true, 0), p('me', true, 0, true)])
    expect(out.map((x) => x.id)).toEqual(['d', 'b', 'a'])
  })
  it('sorts under the first or the last name', () => {
    const ann = { name: 'Ann Zed', first: 'Ann', last: 'Zed' }
    expect(sortName(ann, 'first')).toBe('Ann Zed')
    expect(sortName(ann, 'last')).toBe('Zed Ann')
    expect(sortName({ name: 'Madonna' }, 'last')).toBe('Madonna')
  })
})
