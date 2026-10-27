import type { Folder, Person, Task } from './types'

// Rows from the server may come from an older (or newer) build of the app. Fill in anything missing
// with the same defaults a fresh item gets, so the rest of the app can rely on every field being there.

export function normalizeTask(raw: Record<string, unknown>): Task {
  return {
    id: '',
    title: '',
    notes: '',
    kind: 'task',
    items: [],
    listStyle: 'check',
    time: null,
    endTime: null,
    place: '',
    log: [],
    repeat: null,
    remindAt: null,
    reminded: false,
    status: 'todo',
    importance: 0.5,
    urgency: 0.3,
    x: 0.5,
    y: 0.5,
    start: null,
    due: null,
    day: null,
    rollover: true,
    days: null,
    folderIds: [],
    personIds: [],
    createdAt: 0,
    completedAt: null,
    ...raw,
  } as Task
}

export function normalizeFolder(raw: Record<string, unknown>): Folder {
  return { id: '', name: '', parentId: null, hue: 285, shape: 'blossom', sort: 0, createdAt: 0, ...raw } as Folder
}

export function normalizePerson(raw: Record<string, unknown>): Person {
  return { id: '', name: '', phone: '', email: '', address: '', notes: '', hue: 285, favorite: false, createdAt: 0, ...raw } as Person
}
