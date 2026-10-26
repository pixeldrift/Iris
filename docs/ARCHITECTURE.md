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

## Pond internals

* `core/flock.ts` is a tiny soft-body sim (home spring, related-pair attraction, collision push with
  "bump" events). The pond runs it in `requestAnimationFrame`, writes transforms straight to the DOM
  (no React re-renders per frame) and sleeps when the energy is low.
* `core/groups.ts` buckets tasks for *Gather by*, lays clusters out so none touch, and builds the
  sparse "mind-map" links between tasks that share a folder or person.
* Pan / pinch / wheel live in `ui/views/Pond.tsx` as pointer-event gestures on a single transformed
  "world" element; bubble positions are stored as fractions of the canvas so they survive resizing.
* A deploy writes `dist/version.json`; the running app polls it and shows the "newer Lilac is ready"
  bubble when the id changes.

## Roadmap

See [ROADMAP.md](ROADMAP.md).
