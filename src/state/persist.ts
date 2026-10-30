import { shapeFor } from '../core/folders'
import { dropSampleCopies } from '../core/seed'
import { eventStart } from '../core/reminders'
import { applyAudio, DEFAULT_SETTINGS } from './defaults'
import { SECTION_IDS } from './types'
import type { Settings, State } from './types'
import type { PersistOptions } from 'zustand/middleware'

/** How the store is saved to the device, and how an older save is brought up to date when the app loads. */
export const persistOptions: PersistOptions<State, Partial<State>> = {
  name: 'lilac-v1',
  version: 11,
  partialize: (s) => ({
    tasks: s.tasks,
    folders: s.folders,
    people: s.people,
    scope: s.scope,
    view: s.view,
    settings: s.settings,
    sidebar: s.sidebar,
  }),
  migrate: (persisted, from) => {
    const p = persisted as Partial<State> & { settings?: Partial<Settings> }
    if (from < 2) {
      p.people = p.people ?? []
      p.tasks = (p.tasks ?? []).map((t) => ({ ...t, personIds: t.personIds ?? [] }))
      p.folders = (p.folders ?? []).map((f, i) => ({ ...f, sort: f.sort ?? i }))
    }
    if (from < 3) {
      p.tasks = (p.tasks ?? []).map((t) => ({ ...t, day: t.day ?? null, rollover: t.rollover ?? true, days: t.days ?? null }))
    }
    if (from < 5) {
      // folders saved before flowers existed get a spread of shapes, in their existing order
      p.folders = (p.folders ?? []).map((f, i) => ({ ...f, shape: f.shape ?? shapeFor(i) }))
    }
    if (from < 6) {
      // reminders became plain tasks: a reminder is any task with an alarm, not a type of its own
      p.tasks = (p.tasks ?? []).map((t) => ({ ...t, kind: (t.kind as string) === 'reminder' ? 'task' : t.kind, items: t.items ?? [], listStyle: t.listStyle ?? 'check' }))
    }
    if (from < 7) {
      p.tasks = (p.tasks ?? []).map((t) => ({ ...t, time: t.time ?? null, endTime: t.endTime ?? null, place: t.place ?? '', log: t.log ?? [] }))
    }
    if (from < 8) {
      // everyone already in the sidebar stays there: hearts are for the people added from now on
      p.people = (p.people ?? []).map((x) => ({ ...x, favorite: x.favorite ?? true }))
    }
    if (from < 9) {
      p.tasks = (p.tasks ?? []).map((t) => ({ ...t, remindAt: t.remindAt ?? null, reminded: t.reminded ?? false }))
    }
    if (from < 10) {
      // one model for repeating things: a habit's weekdays become its recurrence
      p.tasks = (p.tasks ?? []).map((t) => {
        const start = new Date(t.createdAt ?? Date.now())
        const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
        if (t.kind === 'habit' && !t.repeat) {
          return { ...t, repeat: t.days?.length ? { freq: 'weekly' as const, interval: 1, byDay: t.days, from } : { freq: 'daily' as const, interval: 1, from }, days: null }
        }
        return { ...t, repeat: t.repeat ?? null }
      })
    }
    if (from < 11) {
      // events keep their reminders as "minutes before the start"; an old one-off reminder becomes one of those
      p.tasks = (p.tasks ?? []).map((t) => {
        const alerts = t.alerts ?? []
        const start = t.kind === 'event' ? eventStart(t) : null
        if (start && t.remindAt !== null && t.remindAt <= start && !alerts.length) {
          return { ...t, alerts: [Math.round((start - t.remindAt) / 60000)], alertsDone: t.reminded ? [`${start}:${Math.round((start - t.remindAt) / 60000)}`] : [], remindAt: null, reminded: false }
        }
        return { ...t, alerts, alertsDone: t.alertsDone ?? [] }
      })
    }
    p.settings = { ...DEFAULT_SETTINGS, ...(p.settings as Settings) }
    return p as State
  },
  merge: (persisted, current) => {
    const p = (persisted ?? {}) as Partial<State>
    const settings = { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) }
    // the lavender flower was retired: folders that had it become bluebells
    if (p.folders) p.folders = p.folders.map((f) => ((f.shape as string) === 'lavender' ? { ...f, shape: 'bell' as const } : f))
    if (!['free', 'folder', 'due', 'kind', 'person'].includes(settings.pondGroup)) settings.pondGroup = 'free'
    // sections added in later versions slot in at the end; unknown ones are dropped
    const saved = (p as Partial<State>).sidebar
    const order = [...(saved?.order ?? []).filter((x) => (SECTION_IDS as readonly string[]).includes(x)), ...SECTION_IDS.filter((x) => !(saved?.order ?? []).includes(x))]
    // a task left half-made when the page closed is not a task
    if (p.tasks) p.tasks = dropSampleCopies(p.tasks.filter((t) => !t.draft))
    return { ...current, ...p, settings, sidebar: { order, collapsed: saved?.collapsed ?? [] } }
  },
  onRehydrateStorage: () => (s) => {
    if (s) applyAudio(s.settings)
  },
}
