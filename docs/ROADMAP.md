# Lilac roadmap

## Near term
- **Sync + accounts.** Vercel functions + Neon: push changed rows, pull `updated_at > cursor`
  (schema already carries `updated_at` / `deleted_at`). Passkey or magic-link sign-in.
- **Reminders & push.** `remind_at` on tasks; Web Push (VAPID) for the PWA, APNs for native.
  iOS only delivers web push to PWAs added to the Home Screen (16.4+).
- **Recurring tasks** (RRULE string on the task, expanded in `src/core`).
- **Native iPhone app (SwiftUI).** Port `src/core` first (types, fuzzy match, folder tree, flocking sim,
  grouping), then the views. `ContactsUI`'s contact picker replaces the web .vcf import.

## Collaboration (future)
- Share a folder or a single bubble with other people; shared folders show up in everyone's sidebar.
- People you tag can become collaborators: assign a task, see who changed what, gentle presence
  (their cursor as a drifting petal on a shared pond).
- Comments on a task, and @mentions that notify.
- Conflict handling: last-write-wins per field today; move to CRDT/field-level merge when real-time
  collaboration lands.
- Permissions: viewer / editor per folder, link sharing with expiry.

## Themes (future)
The pond is a canvas, so the whole mood can change. Each theme swaps the background, the bubble
material, the ambient sound bed and the particles, and nothing else.

- **Koi pond.** Real lily pads floating, soft blurry fish gliding underneath, trickling water,
  cherry-blossom petals blowing through.
- **Sunny sky.** Blue sky, grass along the bottom, the occasional dandelion seed puff drifting by.
- **Space.** Bubbles as planets and moons, slow nebula, soft pulsing stars.
- **Deep ocean.** Waving seaweed, drifting plankton, light shafts from the surface, whale song as ambience.
- **Autumn, snow globe, desert night, rain on glass** … so many possibilities.
- Implementation sketch: a `Theme` object (CSS variables + a canvas/WebGL particle layer + audio
  recipe). Keep the particle layer cheap (pause when hidden, honour reduced motion).

## Folder identity
- **Flower shapes, not just colours.** Folders get a flower *shape* as well as a hue (rose, iris, lily,
  daisy, tulip, lavender…) so they stay distinguishable for colour-blind users and read faster at a glance.
  Each new folder cycles through the available shapes and colours by default (preselected), and the folder
  options popover lets you pick any shape and colour you like.
- **Blended bubbles.** A bubble that lives in more than one folder could show a colour gradient made of
  its folders' colours (or a small ring of their flowers) instead of only its first folder's hue.

- **Petal fill / highlighting.** Fill or highlight a number of a flower's petals to show something at a
  glance (for example how much of a folder is done, or a priority level), as an alternative to changing the
  petal count. Optional; the SVG petal rings already make individual petals addressable.

## Polish ideas
- Folder-specific bubble colours and icons.
- Manual ordering inside list and board columns.
- Custom date picker with times; natural-language dates ("call Sarah next Thursday").
- Haptics on the native app for pops and blooms.
