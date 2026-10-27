import { addDays, today } from './dates'
import type { FlowerShape, Folder, Person, Task } from './types'

let n = 0
const mk = (partial: Partial<Task> & { title: string }): Task => ({
  id: `seed-${++n}`,
  notes: '',
  kind: 'task',
  items: [],
  listStyle: 'check',
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
  createdAt: 1_700_000_000_000 + n,
  completedAt: null,
  ...partial,
})

export function seedData(): { folders: Folder[]; tasks: Task[]; people: Person[] } {
  const t = today()
  const f = (id: string, name: string, parentId: string | null, hue: number, shape: FlowerShape): Folder => ({
    id, name, parentId, hue, shape, sort: n, createdAt: 1_700_000_000_000 + ++n,
  })
  const folders = [
    f('school', 'School', null, 285, 'tulip'),
    f('eng101', 'English 101', 'school', 320, 'daisy'),
    f('bio', 'Biology', 'school', 150, 'bell'),
    f('home', 'Home', null, 20, 'rose'),
    f('garden', 'Garden', 'home', 150, 'sunflower'),
    f('life', 'Life', null, 255, 'iris'),
  ]
  const tasks = [
    mk({ title: 'Read chapters 4–5 of Mrs Dalloway', folderIds: ['eng101'], importance: 0.7, urgency: 0.6, due: addDays(t, 2), start: addDays(t, 0), x: 0.2, y: 0.28 }),
    mk({ title: 'Draft essay outline', folderIds: ['eng101'], importance: 0.85, urgency: 0.45, due: addDays(t, 5), start: addDays(t, 1), x: 0.42, y: 0.18, status: 'doing' }),
    mk({ title: 'Lab report: osmosis', folderIds: ['bio'], importance: 0.6, urgency: 0.85, due: addDays(t, 1), start: addDays(t, -2), x: 0.68, y: 0.3, status: 'doing' }),
    mk({ title: 'Repot the lilac', folderIds: ['garden'], importance: 0.3, urgency: 0.2, x: 0.18, y: 0.64 }),
    mk({
      title: 'Groceries',
      kind: 'list',
      listStyle: 'check',
      items: ['Oat milk', 'Lemons', 'Basil', 'Sourdough'].map((text, i) => ({ id: `gi-${i}`, text, done: i === 3 })),
      folderIds: ['home'],
      importance: 0.5,
      urgency: 0.4,
      x: 0.82,
      y: 0.72,
    }),
    mk({ title: 'Call grandma', folderIds: ['life'], personIds: ['p-grandma'], importance: 0.9, urgency: 0.35, due: addDays(t, 3), x: 0.5, y: 0.55 }),
    mk({ title: 'A little poem about rain?', kind: 'idea', importance: 0.2, urgency: 0.05, x: 0.8, y: 0.62 }),
    mk({ title: 'Book dentist', folderIds: ['life'], importance: 0.45, urgency: 0.55, due: addDays(t, 8), x: 0.33, y: 0.78 }),
    mk({ title: 'Plan weekend picnic', folderIds: ['life', 'garden'], importance: 0.35, urgency: 0.25, due: addDays(t, 4), start: addDays(t, 2), x: 0.7, y: 0.82, kind: 'idea' }),
    mk({ title: 'Return library books', importance: 0.25, urgency: 0.7, due: addDays(t, 0), x: 0.88, y: 0.4 }),
    mk({ title: 'Attend English 101 class', folderIds: ['eng101'], importance: 0.6, urgency: 0.5, day: t, due: addDays(t, 12), days: [1, 3, 5], x: 0.58, y: 0.12 }),
    mk({ title: 'Water the ferns', folderIds: ['garden'], status: 'done', completedAt: Date.now(), importance: 0.2, urgency: 0.2, x: 0.1, y: 0.42 }),
  ]
  const people: Person[] = [
    { id: 'p-grandma', name: 'Grandma Rose', phone: '+1 555 010 2030', email: 'rose@example.com', address: '', notes: '', hue: 345, createdAt: 1_700_000_000_000 },
  ]
  return { folders, tasks, people }
}
