# Code audit

What was checked, what was fixed in this pass, and what is left (with a recommendation for each). Everything below was measured on
the code as it stands, in headless Chromium and unit tests; nothing here was tried on a real phone or with a screen reader.

## Done in this pass

| Area | Change |
| --- | --- |
| Colour tokens | The warning family was hand-typed four ways in 16 files (`#c4577e`, `#c95b88`, `#b04a6e`, `#9a4566`). It is now `--color-danger`, `--color-danger-ink` and `--color-danger-deep` in `src/index.css`, used as `bg-danger`, `text-danger-ink`, `hover:text-danger-deep`. The error dot (`#c95b88`) became plain `danger`. |
| Palette drift | The palette lived twice: `src/index.css` and the colour slider's table. The table moved to `src/ui/palette.ts` and `src/ui/palette.test.ts` fails if the two disagree. |
| Slider default dot | `DefaultDot` takes `var(--color-ink-faint)` by default (three components typed a near-miss hex `#a39cb0`). |
| "Is it done?" | Six views answered differently (status only, or status plus the repeat log). A repeating task ticked today showed a filled check but an un-struck title in the list, board, bubble and Space. One function, `isDoneNow` (`src/core/recurrence.ts`), now answers for DoneButton, bubbles, list, board, priority and Space, with tests. |
| Dialogs | `Modal` had no keyboard focus handling. It now moves focus into the dialog, keeps Tab and Shift+Tab inside, and returns focus to where it was on close (`e2e/dialogfocus.spec.ts`). Closing handlers no longer restart the effect on every render. |
| Touch targets | Check circles (16 to 22 px) keep their look but get an 8 px larger tappable area on coarse pointers. |
| Filtering cost | `matchesScope` rebuilt a group's descendant set for every task (tasks x groups x depth). `scopeMatcher` does it once per scope; `useVisibleTasks` and `filterTasks` use it. The address book counted open tasks per person with a filter inside each row; it is now one pass. |
| Rendering | The Space view subscribed to its whole store, so every drag frame (which writes the layout) re-rendered it. It now selects only the preferences it shows. The 3D scene looked groups up with `find` for every task on every frame; it keeps a map. |
| Dead code | Removed `getLocalePrefs`, `stageAfterTicks`, `toLocalInput`, `fromLocalInput`, `readVCard` and seven icons that nothing references. |

## Findings not yet fixed

### Phase 1: consistency

1. **Native tooltips versus the app's own.** 102 `title=` attributes against 17 `<Tip>` wrappers. `title` gives a delayed, unstyled bubble on desktop and nothing on touch. Recommend: icon-only buttons use `<Tip>` (it also supplies the accessible name); keep `title` only where the text is long help.
2. **Stacking order is ad hoc.** `z-` values in use: 0, 1, 2, 5, 10, 20, 30, 40, 50, 60, 70, 80, 100, 110, 120, 130, 135, 140, 150, 200, 400. The Calendar draws its own modal at 110, below the shared `Modal` at 120. Recommend a small named scale in `index.css` (base, raised, popover, panel, modal, toast, tooltip) and replace the numbers.
3. **Two modal implementations.** Calendar's event editor (`views/Calendar.tsx`) and the New Task sheet (`NewTask.tsx`) each build their own overlay. They do not share `Modal`'s Escape, focus and backdrop behaviour. Recommend moving both onto `Modal` (with a `placement` option for the top-anchored New Task).
4. **Space cards and flat rows repeat task presentation.** The line-view row (tint, check, title, due chip) exists in React (`shared.tsx`, `ListView`), again in `StaticCanvas.tsx` with a fixed urgency of 0.5, and again as canvas drawing in `spatial/cards.ts`. The flat row ignores urgency tinting and the late-date styling. Recommend feeding `urgency` and `late` through `SceneTask` and giving `StaticCanvas` the shared `DueChip`.
5. **Icon-only controls named only by `title`.** None found without a name in the desktop sweep; the landscape quick-add input and textarea are unnamed while closed (they are labelled when shown).
6. **Confirmation behaviour.** All confirmations go through `askConfirm`/`askChoices` (no native `confirm`), which is good. Destructive actions elsewhere (delete a task, delete a group) rely on Undo rather than asking; that is a deliberate pattern, but it is not written down. Recommend one sentence in `ARCHITECTURE.md`.

### Phase 2: UX

7. **Small targets** (measured on 390x844 and 844x390): Priority view check circles 13 to 19 px (they scale with importance, so the smallest bubbles are hardest to tick); Pond filter chips and Calendar mode buttons 22 to 24 px high; sidebar disclosure arrows 20 to 24 px. WCAG 2.2 AA asks for 24 px; platform guidance is 44 px. Recommend a minimum bubble size for the check in Priority, and `min-h-9` on chips under `(pointer: coarse)`.
8. **The edge-swipe handle is 19 px wide and the full height.** It is intentional (swipe from the edge to open the menu) but it is also reported as a button named "Open menu"; a visible Menu button exists, so this is fine. Worth testing against the iOS back-swipe gesture on a real phone.
9. **Timeline offscreen content.** 150 to 220 elements extend past the viewport edge. That is the scrolling timeline, not a layout bug, but it has no keyboard scroll affordance or "jump to today" at phone size.
10. **Empty and error states** are written per view. Recommend one `EmptyState` component (icon, one sentence, one action) so every view says the same kind of thing the same way; errors already go through `showToast`.
11. **Keyboard.** `Modal` is now correct. Popover menus handle Escape; the sidebar tree, Pond bubbles and the Space canvas are pointer-first. Space has a screen-reader list of tasks, but arrow-key navigation between bubbles and groups does not exist. Recommend roving focus for list and board rows first (they are real lists).
12. **Discoverability.** Drag to retag in Space, spring-loaded folders, drop onto the sidebar, and the colour slider's reset dot are all unlabelled until tried. Space has a one-time tip; the others have none. Recommend a short "Tips" row in Settings that lists the gestures.

### Phase 3: architecture and performance

13. **Large files.** `Pond.tsx` (1071 lines), `SpatialScene.ts` (1019), `Calendar.tsx` (786), `TaskDetail.tsx` (553), `PeopleDialogs.tsx` (550). `Pond.tsx` mixes physics, gestures, labels and the pop game; `SpatialScene.ts` mixes rendering, picking, carrying and links. Recommend splitting along those seams (`pond/useLabels`, `spatial/carry.ts`, `spatial/links.ts`) with behaviour unchanged.
14. **Undo bookkeeping runs on every data change.** `state/history.ts` snapshots and deep-compares tasks, folders and people on each change. Fine at hundreds of tasks; at several thousand it is the next cost after filtering. Recommend comparing only the changed ids (the change handlers already know them).
15. **Duplicated "walk the group tree".** Descendants, ancestors and "every group inside this one" are written separately in `core/folders.ts`, `SpatialScene.ts`, `StaticCanvas.tsx` and `SpatialView.tsx`. Recommend one `descendantsOf(parentOf, id)` helper in core, used by all.
16. **Persistence boundaries.** The app store (`lilac-v1`, versioned, migrated) is what syncs. The Space store (`lilac-spatial-v5`) is local by design: layout, folded groups, radius. Four small device keys (`lilac-dayplan`, `lilac-device`, `lilac-sidebar-w`, `lilac-weekends`) are read and written directly. Space layout does not follow a person to another device, and nothing says so. Recommend deciding whether folded groups and placements should sync (they are per-person view state, so probably per device, but then say it in the settings text).
17. **Timers.** Eleven `setInterval`s run while the app is open (reminders 10 s, share 20 s, connect 45 s, update 60 s, and more). None are paused when the page is hidden. Recommend one shared ticker that skips hidden time, which also helps battery.
18. **Unneeded exports.** About 60 exports are used only inside their own file (types, constants, helpers). Harmless, but they widen the public surface. Recommend `noUnusedLocals`-style linting with an export check in CI.

## How to re-run the checks

- Types and unit tests: `npx tsc --noEmit && npx vitest run`
- Palette sync: `src/ui/palette.test.ts`
- Dialog focus: `npx playwright test --project=app e2e/dialogfocus.spec.ts`
- Unused exports: the one-off script in this pass walked every `export` and looked for other files that mention the name; it is easy to turn into a CI step.
