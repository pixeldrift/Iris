import { parseVCards, type ParsedContact } from '../core/people'

interface PickerContact {
  name?: string[]
  email?: string[]
  tel?: string[]
  address?: { addressLine?: string[]; city?: string; region?: string; postalCode?: string; country?: string }[]
}
type Picker = { select: (props: string[], opts?: { multiple?: boolean }) => Promise<PickerContact[]> }

const picker = () => (navigator as unknown as { contacts?: Picker }).contacts

/** Contact Picker API (Android Chrome): the OS shows its own chooser and returns only what was picked. */
export const canPickContacts = () => typeof navigator !== 'undefined' && !!picker() && 'ContactsManager' in window

export async function pickContact(): Promise<ParsedContact | null> {
  const api = picker()
  if (!api) return null
  try {
    const [c] = await api.select(['name', 'email', 'tel', 'address'], { multiple: false })
    if (!c) return null
    const a = c.address?.[0]
    return {
      name: c.name?.[0] ?? '',
      phone: c.tel?.[0] ?? '',
      email: c.email?.[0] ?? '',
      address: a ? [...(a.addressLine ?? []), a.city, a.region, a.postalCode, a.country].filter(Boolean).join(', ') : '',
    }
  } catch {
    return null // user dismissed the chooser
  }
}

/** Reads a .vcf "contact card" (what iOS/macOS/Android produce when you share a contact). */
export async function readVCard(file: File): Promise<ParsedContact | null> {
  return parseVCards(await file.text())[0] ?? null
}
