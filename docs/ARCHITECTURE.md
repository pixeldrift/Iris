# Lilac architecture

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| UI | React 19 + TypeScript + Tailwind v4 | Fast to iterate, and the component tree maps cleanly to SwiftUI views |
| State | Zustand (+ `localStorage` persist) | One store, plain actions: the shape of a SwiftUI `@Observable` model |
| Build / PWA | Vite, hand-written `manifest.webmanifest` + `sw.js` | No plugin magic; installable on iOS via Add to Home Screen |
| Audio | Web Audio synthesis (no samples) | Water drop, chimes and wind are generated: nothing to license or ship |
| Hosting | Vercel (static) | `vercel.json` handles SPA fallback |
| DB | Neon Postgres (`db/schema.sql`) | Not wired up yet: the prototype is local-first |

## Layering (built for porting)

```
src/core/    pure TypeScript: types, dates, fuzzy match, folder tree, filters/sorting
src/state/   the store: every mutation lives here, including `dropTask`
src/audio/   sound engine (platform specific: AVAudioEngine in Swift)
src/ui/      React components (platform specific: SwiftUI)
```

`src/core` imports nothing from React or the DOM and has unit tests
(`npm test`). Porting to Swift is mostly transliteration:

| TypeScript | Swift |
| --- | --- |
| `Task`, `Folder`, `Scope` | `struct` + `enum Scope` (Codable) |
| `filterTasks`, `sortTasks`, `weightOf` | free functions / `extension [Task]` |
| `fuzzyScore` | same algorithm (Levenshtein + prefix + subsequence) |
| `useStore` | `@Observable final class Store` |
| `dropTask(id, "day:2026-10-29")` | `func drop(_ id: UUID, on: DropTarget)` |
| ISO `YYYY-MM-DD` date strings | `DateComponents` / `Calendar.current` |

## Ideas that shape the model

* **Tags are folders.** `task.folderIds` is many-to-many. A task shows under a
  folder and all of its ancestors. Dragging a task onto a folder *adds* a tag.
* **Days are virtual folders.** "Thursday" is not stored: it is a `day:<date>`
  scope. Dropping onto it sets `due`, and the calendar, timeline and list all
  read the same field.
* **Priority is two soft numbers.** `importance` and `urgency` are 0..1 and are
  never displayed. They drive bubble size (pond), position (priority plot) and
  the default "flow" sort. Setting a near due date only ever nudges urgency up.
* **One drag system.** `ui/dnd.tsx` uses pointer events (mouse, pen and touch).
  Anything with `data-drop="kind:value"` is a target. In SwiftUI this becomes
  `.dropDestination` / `Transferable`.

## Next steps

1. **Sync API** (`/api/sync`, Vercel functions + `@neondatabase/serverless`):
   push changed rows, pull `updated_at > cursor`. Tables already carry
   `updated_at` / `deleted_at`.
2. **Auth** (magic link or passkey) so rows are scoped to `user_id`.
3. **Reminders / push**: `remind_at` + Web Push (VAPID) for the PWA, APNs for
   native. iOS only delivers web push to installed PWAs (16.4+).
4. **Folder ordering** and manual sort in lists/columns.
5. **Recurring tasks** (RRULE string on the task, expanded in `core`).
