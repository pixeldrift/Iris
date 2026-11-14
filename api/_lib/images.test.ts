import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { getImage, ImageError, MAX_IMAGE_BYTES, putImage } from './images'

const SCHEMA = readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8')
let db: PGlite
const bytes = new Uint8Array([1, 2, 3, 255, 0, 7])
const code = async (p: Promise<unknown>) => ((await p.then(() => null, (e) => e)) as ImageError | null)?.status

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
  await db.query("insert into workspaces (id, name, personal) values ('ann', '', true), ('trip', 'Trip', false)")
  await db.query("insert into workspace_members (workspace_id, user_id, role) values ('ann','ann','owner'), ('trip','ann','owner'), ('trip','bob','editor'), ('trip','vi','viewer')")
})

describe('pictures', () => {
  it('are kept exactly, once, and only for people in the workspace', async () => {
    await putImage(db, 'ann', 'ann', 'pic-12345678', 'image/jpeg', bytes)
    await putImage(db, 'ann', 'ann', 'pic-12345678', 'image/jpeg', new Uint8Array([9])) // same id again: kept as first sent
    expect(await getImage(db, 'ann', 'ann', 'pic-12345678')).toEqual({ mime: 'image/jpeg', bytes })
    expect(await code(getImage(db, 'bob', 'ann', 'pic-12345678'))).toBe(404) // not his workspace: looks like nothing is there
    expect(await code(getImage(db, 'ann', 'ann', 'nope-123456'))).toBe(404)
  })
  it('can be added by editors but not viewers, and are shared across a group', async () => {
    await putImage(db, 'bob', 'trip', 'trip-pic-1234', 'image/webp', bytes)
    expect((await getImage(db, 'vi', 'trip', 'trip-pic-1234')).mime).toBe('image/webp')
    expect(await code(putImage(db, 'vi', 'trip', 'trip-pic-5678', 'image/jpeg', bytes))).toBe(403)
    expect(await code(putImage(db, 'stranger', 'trip', 'trip-pic-9999', 'image/jpeg', bytes))).toBe(403)
  })
  it('refuse the wrong kind, an empty one, a huge one and a bad id', async () => {
    expect(await code(putImage(db, 'ann', 'ann', 'pic-aaaaaaaa', 'text/html', bytes))).toBe(415)
    expect(await code(putImage(db, 'ann', 'ann', 'pic-aaaaaaaa', 'image/jpeg', new Uint8Array()))).toBe(400)
    expect(await code(putImage(db, 'ann', 'ann', 'pic-aaaaaaaa', 'image/jpeg', new Uint8Array(MAX_IMAGE_BYTES + 1)))).toBe(413)
    expect(await code(putImage(db, 'ann', 'ann', '../x', 'image/jpeg', bytes))).toBe(400)
  })
})
