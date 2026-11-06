import { useConnect } from '../sync/connect'
import { useShare } from '../sync/share'
import { useAlerts } from './notices'

/** How many things are waiting in the bell: reminders gone off, connection requests, news, invitations to share, tasks given to you. */
export function useUnread(): number {
  const waiting = useAlerts((s) => s.items.length)
  const connect = useConnect((s) => s.connections.filter((c) => c.status === 'pending-in').length + s.notices.filter((n) => !n.read && n.kind === 'accepted').length)
  const share = useShare((s) => s.invites.length + s.news.filter((n) => !n.read).length)
  return waiting + connect + share
}
