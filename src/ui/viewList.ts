import type { ViewId } from '../core/types'
import { IconBoard, IconCalendar, IconChart, IconList, IconPond, IconPriority, IconTimeline } from './icons'

export const VIEWS: { id: ViewId; label: string; hint: string; icon: typeof IconPond }[] = [
  { id: 'pond', label: 'Pond', hint: 'Freeform', icon: IconPond },
  { id: 'list', label: 'List', hint: 'Sortable', icon: IconList },
  { id: 'board', label: 'Progress', hint: 'Stages', icon: IconBoard },
  { id: 'priority', label: 'Priority', hint: 'Eisenhower', icon: IconPriority },
  { id: 'calendar', label: 'Calendar', hint: 'Schedule', icon: IconCalendar },
  { id: 'timeline', label: 'Timeline', hint: 'Gantt', icon: IconTimeline },
  { id: 'overview', label: 'Overview', hint: 'Stats', icon: IconChart },
]

/** The views in the order chosen in Settings (any not yet placed follow in their usual order). */
export function orderedViews(order: readonly string[] | undefined): typeof VIEWS {
  const rank = new Map((order ?? []).map((id, i) => [id, i]))
  return VIEWS.map((v, i) => ({ v, i })).sort((a, b) => (rank.get(a.v.id) ?? 1e6) - (rank.get(b.v.id) ?? 1e6) || a.i - b.i).map((x) => x.v)
}
