// Fills in the other half of a US ZIP / city pair using the free zippopotam.us lookup. It sees only the ZIP, or the
// city and state, that was typed, and everything here fails quietly (offline, unknown place): the fields just stay as typed.

const cache = new Map<string, unknown>()

async function get<T>(path: string): Promise<T | null> {
  if (cache.has(path)) return cache.get(path) as T | null
  const ctl = new AbortController()
  const timer = window.setTimeout(() => ctl.abort(), 4000)
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${path}`, { signal: ctl.signal })
    const data = res.ok ? ((await res.json()) as T) : null
    cache.set(path, data)
    return data
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

interface Places {
  places?: { 'place name': string; 'state abbreviation': string; 'post code': string }[]
}

/** 62704 -> { city: "Springfield", state: "IL" } */
export async function lookupZip(zip: string): Promise<{ city: string; state: string } | null> {
  if (!/^\d{5}$/.test(zip)) return null
  const p = (await get<Places>(zip))?.places?.[0]
  return p ? { city: p['place name'], state: p['state abbreviation'] } : null
}

/** "Springfield", "IL" -> the ZIP codes in that city (a handful at most). */
export async function lookupCity(city: string, state: string): Promise<string[]> {
  if (!city.trim() || !/^[A-Za-z]{2}$/.test(state)) return []
  const data = await get<Places>(`${state.toLowerCase()}/${encodeURIComponent(city.trim().toLowerCase())}`)
  return [...new Set((data?.places ?? []).map((p) => p['post code']))].slice(0, 8)
}
