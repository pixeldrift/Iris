import { Pool } from 'pg'

/** The one thing the API needs from a database. `pg`'s Pool and PGlite (used in tests) both fit. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>
}

let pool: Pool | null = null

/** A shared connection pool to Neon (use the *pooled* connection string for serverless). */
export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    pool = new Pool({ connectionString: url, max: 3 })
  }
  return pool
}
