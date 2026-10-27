/** System notifications for reminders. They work while Lilac is open (or running in the background as an installed app). */
export type NotifyState = NotificationPermission | 'unsupported'

export const notifyState = (): NotifyState => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

/** Ask once, from a tap (browsers refuse otherwise). */
export async function askNotify(): Promise<NotifyState> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

export async function showSystem(id: string, title: string, body: string) {
  if (notifyState() !== 'granted') return
  const opts: NotificationOptions = { body, tag: `lilac-${id}`, icon: '/icon.svg', data: { id } }
  try {
    const reg = await navigator.serviceWorker?.ready
    if (reg) return await reg.showNotification(title, opts)
  } catch {
    /* fall through to the page-level API */
  }
  try {
    new Notification(title, opts)
  } catch {
    /* some mobile browsers only allow the service worker route */
  }
}
