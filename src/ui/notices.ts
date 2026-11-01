import { create } from 'zustand'

/** Reminders that have gone off and are waiting: which task, and what to say about it ("Starts in 1 hour"). */
export const useAlerts = create<{ items: { id: string; note: string }[] }>(() => ({ items: [] }))
export const dismissAlert = (id: string) => useAlerts.setState((s) => ({ items: s.items.filter((x) => x.id !== id) }))
export const dismissAllAlerts = () => useAlerts.setState({ items: [] })

/** The notifications list (waiting reminders, then connection news): open from the badge on a reminder card or the account menu. */
export const useNoticesOpen = create<{ open: boolean }>(() => ({ open: false }))
export const openNotices = () => useNoticesOpen.setState({ open: true })
export const closeNotices = () => useNoticesOpen.setState({ open: false })
