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
