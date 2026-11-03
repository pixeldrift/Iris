import type { DueAlert } from '../../src/core/reminders'
import type { Task } from '../../src/core/types'
export function remindersDue(t: Task, now: number): ('do' | 'due')[]
export function dueAlerts(tasks: Task[], now: number, startsFor: (t: Task) => number[]): DueAlert[]
export function eventStartsFor(t: Task, now: number): number[]
export function alertLabel(minutes: number): string
