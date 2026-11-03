/** Where an item is: a place, a room, or a link. */

/** Does the text look like a link (a meeting address, say) rather than a place? */
export const isLink = (place: string): boolean => /^(https?:\/\/|www\.)\S+$/i.test(place.trim())

/** The address to open for a place: the link itself, or a map search for it. */
export function mapsUrl(place: string): string {
  const p = place.trim()
  if (isLink(p)) return /^https?:\/\//i.test(p) ? p : `https://${p}`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p)}`
}
