import { addDays, relativeLabel, today } from './dates'
import { formatTime, isOverdue, plannedDate } from './tasks'
import type { Task } from './types'

/** How a due chip is coloured: today, late, or a later day (the same three tones in every view). */
export type DueTone = 'today' | 'late' | 'later'

export interface DueInfo {
  /** What the chip says ("Today", "Tomorrow", "Wed", "Mar 4", or the time for today). */
  text: string
  tone: DueTone
  /** A time that rides along for days further out ("· 3:30 PM"). */
  time?: string
  /** The deadline, when it differs from the day it is planned for ("due Fri"). */
  deadline?: string
}

/**
 * What a task's date chip says and how it is coloured: the one set of rules every view follows (list, board, bubbles, flat and 3D
 * Space). The chip's look is the view's business; its words and tone are decided here.
 */
export function dueInfo(task: Task, now: string = today()): DueInfo | null {
  const when = plannedDate(task)
  if (!when) return null
  const late = isOverdue(task, now)
  // today needs no date: the time if there is one, otherwise just "Today"
  if (when === now && !late) return { text: task.time ? formatTime(task.time) : 'Today', tone: 'today' }
  return {
    text: relativeLabel(when, now),
    tone: late ? 'late' : when === now ? 'today' : 'later',
    // tomorrow is just "Tomorrow"; the time only rides along for days further out
    time: task.time && when !== addDays(now, 1) ? formatTime(task.time) : undefined,
    deadline: task.day && task.due && task.due !== task.day ? relativeLabel(task.due, now) : undefined,
  }
}

/** The chip as one line of text (for the canvas cards, which cannot lay out HTML). */
export const dueLine = (d: DueInfo, compact = true): string => [d.text, d.time && `· ${d.time}`, !compact && d.deadline && `· due ${d.deadline}`].filter(Boolean).join(' ')

/** The chip's colours as the stylesheet's classes. */
export const DUE_TONE_CLASS: Record<DueTone, string> = {
  today: 'border border-lilac-300/70 bg-lilac-200/80 text-lilac-700',
  late: 'border border-danger/35 bg-rose-soft/80 text-danger-ink',
  later: 'border border-ink-faint/40 bg-white/60 text-ink-soft',
}
