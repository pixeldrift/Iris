import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { FeedbackError, HOURLY_LIMIT, MAX_MESSAGE, notifyOwner, parseFeedback, saveFeedback } from './feedback'

const SCHEMA = readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8')
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
})
const ok = { kind: 'bug', message: 'The list jumps when I tick things', build: 'abc123', context: { browser: 'Safari' } }

describe('feedback', () => {
  it('accepts a bug or an idea with words, and refuses the rest', () => {
    expect(parseFeedback(ok)).toMatchObject({ kind: 'bug', message: 'The list jumps when I tick things', build: 'abc123', context: { browser: 'Safari' } })
    expect(() => parseFeedback({ ...ok, kind: 'rant' })).toThrow(FeedbackError)
    expect(() => parseFeedback({ ...ok, message: '  ' })).toThrow(FeedbackError)
    expect(() => parseFeedback({ ...ok, message: 'x'.repeat(MAX_MESSAGE + 1) })).toThrow(FeedbackError)
    expect(() => parseFeedback(null)).toThrow(FeedbackError)
  })
  it('keeps only short text details, and not many', () => {
    const c = parseFeedback({ ...ok, context: { a: 'x'.repeat(999), b: 5, ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, 'v'])) } }).context!
    expect(c.a).toHaveLength(300)
    expect('b' in c).toBe(false)
    expect(Object.keys(c).length).toBeLessThanOrEqual(12)
  })
  it('stores a report, and stops one person sending too many in an hour', async () => {
    for (let i = 0; i < HOURLY_LIMIT; i++) expect(await saveFeedback(db, 'u1', parseFeedback(ok))).toBeGreaterThan(0)
    await expect(saveFeedback(db, 'u1', parseFeedback(ok))).rejects.toMatchObject({ status: 429 })
    expect(await saveFeedback(db, 'u2', parseFeedback(ok))).toBeGreaterThan(0) // (someone else is not held up)
    const { rows } = await db.query<{ n: string }>("select count(*) as n from feedback where user_id = 'u1'")
    expect(Number(rows[0].n)).toBe(HOURLY_LIMIT)
  })
})

describe('telling the owner', () => {
  const input = parseFeedback({ ...ok, context: { browser: 'Safari' } })
  it('opens a GitHub issue with the words and chosen details, and names nobody', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ html_url: 'https://github.com/o/r/issues/7' }), { status: 201 }))
    const url = await notifyOwner(12, input, { GITHUB_FEEDBACK_TOKEN: 't', GITHUB_FEEDBACK_REPO: 'o/r' }, fetcher)
    expect(url).toBe('https://github.com/o/r/issues/7')
    const [endpoint, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(endpoint).toBe('https://api.github.com/repos/o/r/issues')
    const sent = JSON.parse(init.body as string)
    expect(sent.title).toBe('Bug: The list jumps when I tick things')
    expect(sent.labels).toContain('bug')
    expect(sent.body).toContain('Report #12')
    expect(sent.body).toContain('browser: Safari')
    expect(sent.body).not.toMatch(/@|user/i)
  })
  it('posts to the chat webhook too, and a failure of either is not an error', async () => {
    const calls: string[] = []
    const fetcher = vi.fn(async (u: string) => {
      calls.push(u)
      if (u.includes('github')) throw new Error('down')
      return new Response('', { status: 204 })
    })
    const url = await notifyOwner(3, input, { GITHUB_FEEDBACK_TOKEN: 't', GITHUB_FEEDBACK_REPO: 'o/r', FEEDBACK_WEBHOOK_URL: 'https://hooks.example/x' }, fetcher)
    expect(url).toBeNull()
    expect(calls).toEqual(['https://api.github.com/repos/o/r/issues', 'https://hooks.example/x'])
  })
  it('does nothing when nothing is configured, and ignores a malformed repo name', async () => {
    const fetcher = vi.fn()
    expect(await notifyOwner(1, input, {}, fetcher)).toBeNull()
    expect(await notifyOwner(1, input, { GITHUB_FEEDBACK_TOKEN: 't', GITHUB_FEEDBACK_REPO: '../evil' }, fetcher)).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
