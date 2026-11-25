import type { Db } from './db.js'

export type FeedbackKind = 'bug' | 'idea'
export class FeedbackError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export const MAX_MESSAGE = 4000
/** How many reports one person may send in an hour. */
export const HOURLY_LIMIT = 5

export interface FeedbackInput {
  kind: FeedbackKind
  message: string
  build: string | null
  /** What the person agreed to include (browser, screen size, which view): short text values only. */
  context: Record<string, string> | null
}

/** Check what the app sent; anything unexpected is refused. */
export function parseFeedback(body: unknown): FeedbackInput {
  const b = body as Record<string, unknown> | null
  if (!b || typeof b !== 'object') throw new FeedbackError('Expected a JSON object', 400)
  if (b.kind !== 'bug' && b.kind !== 'idea') throw new FeedbackError('Say whether it is a bug or an idea', 400)
  const message = typeof b.message === 'string' ? b.message.trim() : ''
  if (message.length < 3) throw new FeedbackError('Write a few words first', 400)
  if (message.length > MAX_MESSAGE) throw new FeedbackError(`Keep it under ${MAX_MESSAGE} characters`, 400)
  let context: Record<string, string> | null = null
  if (b.context && typeof b.context === 'object' && !Array.isArray(b.context)) {
    context = {}
    for (const [k, v] of Object.entries(b.context as Record<string, unknown>).slice(0, 12)) {
      if (typeof v === 'string') context[k.slice(0, 40)] = v.slice(0, 300)
    }
  }
  const build = typeof b.build === 'string' ? b.build.slice(0, 40) : null
  return { kind: b.kind, message, build, context }
}

/** Keep a report, unless this person has sent too many lately. Returns its id. */
export async function saveFeedback(db: Db, userId: string, input: FeedbackInput): Promise<number> {
  const { rows: recent } = await db.query<{ n: string }>("select count(*) as n from feedback where user_id = $1 and created_at > now() - interval '1 hour'", [userId])
  if (Number(recent[0]?.n ?? 0) >= HOURLY_LIMIT) throw new FeedbackError('That is a lot of reports in a short time. Try again in a little while.', 429)
  const { rows } = await db.query<{ id: string }>('insert into feedback (user_id, kind, message, app_build, context) values ($1,$2,$3,$4,$5) returning id', [userId, input.kind, input.message, input.build, input.context ? JSON.stringify(input.context) : null])
  return Number(rows[0].id)
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>
interface Env {
  GITHUB_FEEDBACK_TOKEN?: string
  GITHUB_FEEDBACK_REPO?: string
  FEEDBACK_WEBHOOK_URL?: string
}

const title = (m: string) => {
  const line = m.split('\n')[0].trim()
  return line.length > 70 ? `${line.slice(0, 67)}…` : line
}

/**
 * Tell the owner. Opens a GitHub issue (GITHUB_FEEDBACK_TOKEN + GITHUB_FEEDBACK_REPO as "owner/name") and/or posts to a chat webhook
 * (FEEDBACK_WEBHOOK_URL, Discord or Slack). Neither the person's name nor email goes out: only their words, the app build, and any details they chose.
 * A failure here is not the person's problem: the report is already kept. Returns the issue's address when there is one.
 */
export async function notifyOwner(id: number, input: FeedbackInput, env: Env = process.env, fetcher: Fetch = fetch): Promise<string | null> {
  const details = [`Report #${id}`, input.build ? `Build ${input.build}` : '', ...Object.entries(input.context ?? {}).map(([k, v]) => `${k}: ${v}`)].filter(Boolean)
  const bodyText = `${input.message}\n\n---\n${details.join('\n')}`
  const timeout = () => AbortSignal.timeout(4000)
  let issueUrl: string | null = null
  if (env.GITHUB_FEEDBACK_TOKEN && env.GITHUB_FEEDBACK_REPO && /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/.test(env.GITHUB_FEEDBACK_REPO)) {
    try {
      const res = await fetcher(`https://api.github.com/repos/${env.GITHUB_FEEDBACK_REPO}/issues`, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.GITHUB_FEEDBACK_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'lilac-feedback' },
        body: JSON.stringify({ title: `${input.kind === 'bug' ? 'Bug' : 'Idea'}: ${title(input.message)}`, body: bodyText, labels: [input.kind === 'bug' ? 'bug' : 'enhancement', 'from-app'] }),
        signal: timeout(),
      })
      if (res.ok) issueUrl = ((await res.json()) as { html_url?: string }).html_url ?? null
    } catch (e) {
      console.error('feedback: GitHub issue failed', e)
    }
  }
  if (env.FEEDBACK_WEBHOOK_URL) {
    try {
      const text = `${input.kind === 'bug' ? '🐞 Bug' : '💡 Idea'} #${id}${issueUrl ? ` ${issueUrl}` : ''}\n${input.message.slice(0, 1500)}`
      await fetcher(env.FEEDBACK_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text, text }), signal: timeout() })
    } catch (e) {
      console.error('feedback: webhook failed', e)
    }
  }
  return issueUrl
}

export async function recordIssue(db: Db, id: number, url: string): Promise<void> {
  await db.query('update feedback set issue_url = $2 where id = $1', [id, url])
}
