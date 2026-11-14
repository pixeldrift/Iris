import type { Db } from './db.js'

/** The biggest picture the server keeps (the app sends about 150–400 KB). */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

export class ImageError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

const validId = (id: string | null): id is string => !!id && /^[A-Za-z0-9_-]{8,64}$/.test(id)

async function role(db: Db, userId: string, workspaceId: string): Promise<string | null> {
  const { rows } = await db.query<{ role: string }>("select role from workspace_members where workspace_id = $1 and user_id = $2 and status = 'active'", [workspaceId, userId])
  return rows[0]?.role ?? null
}

/** Keep a picture in a workspace (the same id sent twice is kept once). Viewers cannot add. */
export async function putImage(db: Db, userId: string, workspaceId: string | null, id: string | null, mime: string, bytes: Uint8Array): Promise<void> {
  if (!validId(id) || !workspaceId) throw new ImageError('Bad picture request', 400)
  if (!MIME.has(mime)) throw new ImageError('Only JPEG, PNG or WebP pictures', 415)
  if (!bytes.length) throw new ImageError('Empty picture', 400)
  if (bytes.length > MAX_IMAGE_BYTES) throw new ImageError('That picture is too large', 413)
  const r = await role(db, userId, workspaceId)
  if (!r || r === 'viewer') throw new ImageError('You cannot add pictures here', 403)
  await db.query('insert into images (workspace_id, id, mime, bytes, uploaded_by) values ($1,$2,$3,$4,$5) on conflict do nothing', [workspaceId, id, mime, Buffer.from(bytes), userId])
}

/** A picture, for anyone in its workspace. */
export async function getImage(db: Db, userId: string, workspaceId: string | null, id: string | null): Promise<{ mime: string; bytes: Uint8Array }> {
  if (!validId(id) || !workspaceId) throw new ImageError('Bad picture request', 400)
  if (!(await role(db, userId, workspaceId))) throw new ImageError('Not found', 404) // (the same answer whether or not it exists)
  const { rows } = await db.query<{ mime: string; bytes: Uint8Array }>('select mime, bytes from images where workspace_id = $1 and id = $2', [workspaceId, id])
  if (!rows[0]) throw new ImageError('Not found', 404)
  return { mime: rows[0].mime, bytes: new Uint8Array(rows[0].bytes) }
}
