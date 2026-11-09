// Run just the browser tests for the part of the app you are working on, instead of everything.
//
//   npm run test:area -- space            one area
//   npm run test:area -- pond list        several
//   npm run test:area -- --changed        the areas your uncommitted and unmerged changes touch (vs main)
//   add --slow to include the slow ones (the pop game, the play limit, 300 tasks...)
//
// Areas, and what touches them, are the two tables below.
import { execSync, spawnSync } from 'node:child_process'

const AREAS = {
  pond: ['pond', 'pondgroups', 'popmodes', 'bubbles', 'strays', 'edgemarkers', 'playlimit'],
  list: ['views', 'listquickadd', 'rowkeys', 'quickadd', 'quickmodes', 'tagsandkinds'],
  board: ['board', 'progress'],
  calendar: ['monthgrid', 'dayschedule', 'pastevents', 'whenwhere'],
  space: ['spatial', 'spatialmove', 'spatialcamera', 'flatmove'],
  panel: ['taskpanel', 'pickers', 'repeats', 'reminders', 'whenwhere', 'pictures', 'autourgency'],
  settings: ['settings', 'viewsvisible', 'viewsfilters', 'sound'],
  people: ['contacts', 'labels', 'sidebar'],
  ui: ['dialogfocus', 'noselect', 'mobile'],
}
// path fragment -> areas it can affect
const TOUCHES = [
  [/src\/spatial\//, ['space']],
  [/pond|Lily|BubbleChrome|flock|groups\.ts|Strays/i, ['pond']],
  [/ListView|rowKeys|EmptyState|quickCreate|quickadd|NewTask/i, ['list']],
  [/Board|progress/i, ['board']],
  [/Calendar|DaySchedule|Timeline/i, ['calendar']],
  [/TaskDetail|KindFields|DatePicker|TimePicker|Reminder|recurrence/i, ['panel']],
  [/Settings|prefs|viewList|SegmentedToggle/i, ['settings']],
  [/People|AddressBook|Sidebar|FolderNode|Account/i, ['people']],
  [/dialogs\.tsx|Popover|Tip|useVisible/i, ['ui', 'list']],
  // shared look and tokens touch everything a little: one sample of each area is enough
  [/index\.css|shared\.tsx|taskColor|look\.ts|rowModel/i, ['pond', 'list', 'board', 'space']],
]

const args = process.argv.slice(2)
const slow = args.includes('--slow')
let areas = args.filter((a) => !a.startsWith('--'))
if (args.includes('--changed')) {
  const files = new Set()
  for (const cmd of ['git diff --name-only main...HEAD', 'git diff --name-only', 'git diff --name-only --cached']) {
    try {
      execSync(cmd, { encoding: 'utf8' }).split('\n').filter(Boolean).forEach((f) => files.add(f))
    } catch {
      /* no main to compare with: only what is uncommitted */
    }
  }
  const hit = new Set()
  // (only the app's own source decides: a changed test file does not mean the area it tests was touched)
  for (const f of [...files].filter((x) => x.startsWith('src/'))) for (const [re, as] of TOUCHES) if (re.test(f)) as.forEach((a) => hit.add(a))
  areas = [...hit]
  console.log(`changed: ${[...files].length} files -> ${areas.join(', ') || 'no browser area (unit tests are enough)'}`)
  if (!areas.length) process.exit(0)
}
if (!areas.length) {
  console.log('Areas: ' + Object.keys(AREAS).join(', ') + '\nUsage: npm run test:area -- <area...> | --changed [--slow]')
  process.exit(1)
}
const specs = [...new Set(areas.flatMap((a) => (AREAS[a] ?? (console.error(`unknown area "${a}"`), process.exit(1))).map((s) => `e2e/${s}.spec.ts`)))]
const pw = ['playwright', 'test', '--project=app', '--retries=0', ...(slow ? [] : ['--grep-invert', '@slow']), ...specs]
console.log('npx ' + pw.join(' '))
process.exit(spawnSync('npx', pw, { stdio: 'inherit' }).status ?? 1)
