import { addDays, today } from './dates'
import type { Stage } from './progress'
import type { FlowerShape, Folder, Person, Task } from './types'

const mk = (id: string, order: number, partial: Partial<Task> & { title: string }): Task => ({
  id,
  notes: '',
  kind: 'task',
  items: [],
  listStyle: 'check',
  time: null,
  endTime: null,
  place: '',
  log: [],
  repeat: null,
  alerts: [],
  alertsDone: [],
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
  createdAt: 1_700_000_000_000 + order,
  completedAt: null,
  ...partial,
})

const items = (prefix: string, texts: string[], done: number[] = []) => texts.map((text, i) => ({ id: `${prefix}-${i}`, text, done: done.includes(i) }))

const WRITING_STAGES: Stage[] = [
  { id: 'demo-research', name: 'Research' },
  { id: 'demo-first', name: 'First draft' },
  { id: 'demo-second', name: 'Second draft' },
  { id: 'demo-editing', name: 'Editing' },
  { id: 'demo-submitted', name: 'Submitted' },
]

/** The ids of the demo groups and people (tasks are recognised by their `demo-` / old `seed-` ids). */
const DEMO_FOLDERS = new Set(['school', 'eng101', 'bio', 'home', 'garden', 'life', 'demo-writing'])
const DEMO_PEOPLE = new Set(['p-grandma', 'p-patel', 'p-sam', 'p-mina'])
export const isDemoTask = (id: string) => /^(seed-\d+|demo-.+)$/.test(id)
export const isDemoFolder = (id: string) => DEMO_FOLDERS.has(id)
export const isDemoPerson = (id: string) => DEMO_PEOPLE.has(id)

/**
 * The demo content: a small, believable life that shows off what the app does (every item type, repeats and streaks,
 * lists, events with alerts, a reminder set "a day before", groups with custom Progress stages, people with extra
 * details and birthdays, items in the pond, grid, timeline and calendar at once). Dates are relative to today, and every
 * id is fixed, so it can be added again or removed cleanly at any time. Also the app's starting data.
 */
export function seedData(): { folders: Folder[]; tasks: Task[]; people: Person[] } {
  const t = today()
  const nowMs = Date.now()
  const at = (day: string, hh: number) => {
    const [y, m, d] = day.split('-').map(Number)
    return new Date(y, m - 1, d, hh, 0).getTime()
  }
  let o = 0
  const f = (id: string, name: string, parentId: string | null, hue: number, shape: FlowerShape, extra: Partial<Folder> = {}): Folder => ({
    id, name, parentId, hue, shape, sort: o, createdAt: 1_700_000_000_000 + ++o, ...extra,
  })
  const folders = [
    f('school', 'School', null, 285, 'tulip'),
    f('eng101', 'English 101', 'school', 320, 'daisy'),
    f('bio', 'Biology', 'school', 150, 'bell'),
    f('home', 'Home', null, 20, 'rose'),
    f('garden', 'Garden', 'home', 150, 'sunflower'),
    f('life', 'Life', null, 255, 'iris'),
    // a group with stages of its own: open it in Progress
    f('demo-writing', 'Writing', null, 200, 'lily', { stages: WRITING_STAGES }),
  ]
  let n = 0
  const k = (id: string, p: Partial<Task> & { title: string }) => mk(`demo-${id}`, ++n, p)
  const tasks: Task[] = [
    // school: spans, deadlines, progress, urgency
    k('read', { title: 'Read chapters 4–5 of Mrs Dalloway', folderIds: ['eng101'], importance: 0.7, urgency: 0.6, due: addDays(t, 2), start: addDays(t, 0), x: 0.2, y: 0.28, notes: 'Look for how the street scenes echo each other.' }),
    k('essay', { title: 'Draft essay outline', folderIds: ['eng101'], importance: 0.85, urgency: 0.45, due: addDays(t, 5), start: addDays(t, 1), x: 0.42, y: 0.18, status: 'doing' }),
    k('lab', { title: 'Lab report: osmosis', folderIds: ['bio'], importance: 0.6, urgency: 0.85, due: addDays(t, 1), start: addDays(t, -2), x: 0.68, y: 0.3, status: 'doing' }),
    k('class', { title: 'Attend English 101 class', folderIds: ['eng101'], importance: 0.6, urgency: 0.5, day: t, due: addDays(t, 12), repeat: { freq: 'weekly', interval: 1, byDay: [1, 3, 5], from: t }, x: 0.58, y: 0.12 }),
    k('study', { title: 'Study group', kind: 'event', time: '15:30', endTime: '17:00', place: 'Library, room 2', day: addDays(t, 1), alerts: [60, 1440], folderIds: ['life'], importance: 0.55, urgency: 0.5, x: 0.3, y: 0.78 }),
    // lists of every kind
    k('groceries', { title: 'Groceries', kind: 'list', listStyle: 'check', items: items('gi', ['Oat milk', 'Lemons', 'Basil', 'Sourdough'], [3]), folderIds: ['home'], importance: 0.5, urgency: 0.4, x: 0.82, y: 0.72 }),
    k('packing', { title: 'Packing for the weekend', kind: 'list', listStyle: 'bullet', items: items('pk', ['Charger', 'Rain jacket', 'Book', 'Sunscreen']), importance: 0.4, urgency: 0.55, due: addDays(t, 3), x: 0.74, y: 0.5 }),
    k('steps', { title: 'Sourdough, step by step', kind: 'list', listStyle: 'number', items: items('st', ['Feed the starter', 'Mix and rest', 'Fold three times', 'Shape', 'Bake at 450°']), folderIds: ['home'], importance: 0.3, urgency: 0.1, x: 0.9, y: 0.86 }),
    // habits and repeats (one bubble each; every occurrence ticked off on its own)
    k('stretch', { title: 'Morning stretch', kind: 'habit', repeat: { freq: 'daily', interval: 1, from: addDays(t, -30) }, log: [1, 2, 3, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 19, 20].map((d) => addDays(t, -d)), folderIds: ['life'], importance: 0.5, urgency: 0.3, x: 0.12, y: 0.62 }),
    k('water', { title: 'Drink 2 L of water', kind: 'habit', repeat: { freq: 'daily', interval: 1, from: addDays(t, -9) }, log: [-1, -2, -3, -4, -5, -6, -7].map((d) => addDays(t, d)), importance: 0.55, urgency: 0.45, x: 0.22, y: 0.5 }),
    k('rent', { title: 'Pay rent', kind: 'task', repeat: { freq: 'monthly', interval: 1, from: addDays(t, 5), monthDay: Number(addDays(t, 5).slice(8)) }, importance: 0.9, urgency: 0.7, remindBefore: 1, x: 0.86, y: 0.2 }),
    k('club', { title: 'Book club', kind: 'event', time: '19:00', endTime: '21:00', place: 'Maya’s place', day: addDays(t, 3), repeat: { freq: 'monthly', interval: 1, from: addDays(t, 3), nth: 3, byDay: [2], custom: true }, alerts: [120], folderIds: ['life'], importance: 0.4, urgency: 0.35, x: 0.45, y: 0.66 }),
    // people, calls, reminders
    k('grandma', { title: 'Call grandma', folderIds: ['life'], personIds: ['p-grandma'], importance: 0.9, urgency: 0.35, due: addDays(t, 3), x: 0.5, y: 0.55 }),
    k('dentist', { title: 'Book dentist', folderIds: ['life'], personIds: ['p-patel'], importance: 0.45, urgency: 0.55, due: addDays(t, 8), remindBefore: 1, x: 0.33, y: 0.78 }),
    k('plumber', { title: 'Call the plumber about the kitchen tap', importance: 0.5, urgency: 0.6, remindAt: at(addDays(t, 1), 9), x: 0.62, y: 0.42 }),
    k('books', { title: 'Return library books', importance: 0.25, urgency: 0.7, due: t, x: 0.88, y: 0.4 }),
    // ideas and loose thoughts
    k('poem', { title: 'A little poem about rain?', kind: 'idea', importance: 0.2, urgency: 0.05, x: 0.8, y: 0.62 }),
    k('picnic', { title: 'Plan weekend picnic', folderIds: ['life', 'garden'], importance: 0.35, urgency: 0.25, due: addDays(t, 4), start: addDays(t, 2), x: 0.7, y: 0.82, kind: 'idea' }),
    k('lilac', { title: 'Repot the lilac', folderIds: ['garden'], importance: 0.3, urgency: 0.2, x: 0.18, y: 0.64 }),
    k('ferns', { title: 'Water the ferns', folderIds: ['garden'], status: 'done', completedAt: nowMs, importance: 0.2, urgency: 0.2, x: 0.1, y: 0.42 }),
    // a month of finished things (hidden unless you show completed items), so Reports has a history to draw
    ...[
      ['Email the landlord', 'home', 1], ['Buy a birthday card', 'life', 1], ['Renew the library card', 'life', 2], ['Submit the lab form', 'bio', 3],
      ['Fix the bike tire', 'home', 3], ['Reply to Sam', 'life', 3], ['Plan the study schedule', 'school', 5], ['Order contact lenses', 'life', 6],
      ['Return the drill', 'home', 8], ['Annotate chapter 2', 'eng101', 9], ['Book the train tickets', 'life', 9], ['Weed the front beds', 'garden', 12],
      ['Back up the laptop', 'life', 15], ['Water-test report', 'bio', 16], ['Call the bank', 'life', 20], ['Prune the roses', 'garden', 23], ['Clean out the fridge', 'home', 27], ['Mail the package', 'life', 30],
    ].map(([title, folder, ago], i) => k(`past${i}`, { title: title as string, folderIds: [folder as string], status: 'done', completedAt: nowMs - (ago as number) * 86_400_000 - (i % 5) * 3_600_000, importance: 0.4, urgency: 0.3, x: 0.5, y: 0.5 })),
    // a group with its own Progress stages (open Writing, then Progress)
    k('w1', { title: 'Research the lighthouse setting', folderIds: ['demo-writing'], stage: 'demo-research', importance: 0.6, urgency: 0.3, x: 0.34, y: 0.34 }),
    k('w2', { title: 'Write chapter one', folderIds: ['demo-writing'], stage: 'demo-first', status: 'doing', importance: 0.8, urgency: 0.5, due: addDays(t, 9), x: 0.52, y: 0.26 }),
    k('w3', { title: 'Rewrite the ending', folderIds: ['demo-writing'], stage: 'demo-second', status: 'doing', importance: 0.75, urgency: 0.4, x: 0.4, y: 0.46 }),
    k('w4', { title: 'Proofread the short story', folderIds: ['demo-writing'], stage: 'demo-editing', status: 'doing', importance: 0.7, urgency: 0.65, due: addDays(t, 6), x: 0.6, y: 0.36 }),
    k('w5', { title: 'Send it to the magazine', folderIds: ['demo-writing'], stage: 'demo-submitted', status: 'done', completedAt: nowMs, importance: 0.8, urgency: 0.2, x: 0.7, y: 0.28 }),
  ]
  const person = (id: string, p: Partial<Person> & { name: string }, order: number): Person => ({
    id, phone: '', email: '', address: '', notes: '', hue: 285, favorite: false, createdAt: 1_700_000_000_000 + order, ...p,
  })
  const people: Person[] = [
    person('p-grandma', { name: 'Grandma Rose', phone: '(555) 010-2030', email: 'rose@example.com', hue: 345, favorite: true, birthday: addDays(t, 40).replace(/^\d{4}/, '1948'), extras: [{ id: 'x1', kind: 'phone', label: 'Home', value: '(555) 010-2031' }] }, 0),
    person('p-patel', { name: 'Dr. Patel', phone: '(555) 010-4477', address: '12 Elm Street', notes: 'Dentist', hue: 200, extras: [{ id: 'x2', kind: 'email', label: 'Work', value: 'office@elmdental.example.com' }, { id: 'x3', kind: 'phone', label: 'Work', value: '(555) 010-4400' }] }, 1),
    person('p-sam', { name: 'Sam Okafor', phone: '(555) 010-8812', email: 'sam@example.com', notes: 'Study group', hue: 150, birthday: addDays(t, 12).replace(/^\d{4}/, '2001') }, 2),
    person('p-mina', { name: 'Mina Park', email: 'mina@example.com', hue: 255 }, 3),
  ]
  return { folders, tasks, people }
}

const num = (id: string) => Number(id.replace(/\D/g, '')) || 0

/**
 * Removes stray copies of the sample items. Earlier versions re-created the samples with new `seed-` ids on every
 * sign-out, and sign-in then uploaded each copy. For each sample title with more than one `seed-` item, one is kept
 * (the real sample id if present, else the oldest) and the rest go. A lone sample is never touched.
 */
export function dropSampleCopies<T extends Pick<Task, 'id' | 'title'>>(tasks: T[]): T[] {
  const groups = new Map<string, T[]>()
  for (const t of tasks) if (isDemoTask(t.id)) groups.set(t.title, [...(groups.get(t.title) ?? []), t])
  const canon = new Set(seedData().tasks.map((x) => x.id))
  const drop = new Set<string>()
  for (const g of groups.values()) {
    if (g.length < 2) continue
    const keep = g.find((t) => canon.has(t.id)) ?? [...g].sort((a, b) => num(a.id) - num(b.id))[0] // the current sample if there is one, else the oldest old-style copy
    for (const t of g) if (t !== keep) drop.add(t.id)
  }
  return drop.size ? tasks.filter((t) => !drop.has(t.id)) : tasks
}
