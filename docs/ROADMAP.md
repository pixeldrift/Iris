# Lilac roadmap

## Near term
- **Connections. (First version built.)** People who use Lilac can link their address-book entries so details fill in and
  stay current without re-typing. Adding someone with an email offers "Send an invitation to connect?"; the other person
  gets a notification (the bell in the user menu, with a badge), chooses what to share, and when they accept each side's
  entry is filled from the other's shared details. Design rules (see `api/_lib/connect.ts`):
  - *Nobody can learn who is on Lilac.* An invitation always looks the same to the sender whether or not the address
    matches; only an accepted request ever shows anything. Declined and blocked requests look pending to the sender.
  - Only a *verified* email can be matched (by a keyed hash, `IDENTITY_SECRET`), and "Let people who have my email find me"
    can be switched off. Invitations are rate-limited (25 a day).
  - What the other side receives is filtered on the server by the fields each person chose to share (name, phone, email,
    address, birthday); a change in sharing or in someone's own details flows through on the next check.
  - A linked entry fills the *same* address-book entry that started the invitation (or an existing one with that email),
    so no duplicates appear. Unlinking (they disconnect, or you do) removes only what they had shared; if their account is
    deleted the entry stays as an ordinary contact of yours with what you had.
  - Still to do: email invitations to people who are not on Lilac yet (needs an email provider), phone matching (needs
    SMS verification), photos, sharing a group or a task with a connection (the workspace groundwork in `ACCOUNTS.md`), and
    push for new requests (they arrive on the app's regular check for now).
- **Overview. (First version shipped.)** An Overview view: items finished per day, week or month as a bar chart, summary
  tiles, streaks for every repeating item or habit (current run, best run, the last two weeks as dots), and where the
  effort went by group; it follows the sidebar's group or person filter. Built on `src/core/overview.ts` (pure, tested).
  Still to do: goals ("2 L every day for 7 days") with their own progress, weekly summaries, comparing periods,
  and sharing a streak.
- **Sync + accounts. (Built; needs your Neon database to go live.)** Neon Auth (managed Better Auth) email + password, a Neon `entities`
  table, last-write-wins sync of tasks, folders and people (`docs/ACCOUNTS.md`). Still to do: email verification
  and password reset (needs an email provider), passkeys / social sign-in, syncing settings, shared rate limiting,
  and server-assigned versions before collaboration.
- **Reminders & push.** In-app reminders and system notifications (while the app is open) have shipped.
  Still to do: delivery when the app is closed: Web Push (VAPID) for the PWA, APNs for native.
  iOS only delivers web push to PWAs added to the Home Screen (16.4+).
- **Calendar sync (Google, Apple, others).** Connect external calendars so Lilac and they share
  information, two ways: events created or changed in Lilac show up in the calendar app, and the other
  way round.
  - Standards first: **CalDAV** (iCloud, Fastmail, Nextcloud, most others) plus the **Google Calendar API**
    and Microsoft Graph where CalDAV isn't offered. Native iPhone can also read/write EventKit directly.
  - Bi-directional: sync tokens / ETags to pull only changes, a per-event link (remote UID + ETag) on the
    task, and a clear conflict rule (last write wins per field, surfaced when both sides changed).
  - Mapping: Lilac `event` items (date, start/end time, place) <-> VEVENT; tasks with a due date <-> VTODO
    where the server supports it. Choose which calendars sync, and which Lilac folders they land in.
  - Needs the server side first (accounts and sync above): credentials and tokens live in Neon, and the
    sync worker runs in Vercel functions or cron, never in the browser.
- **Recurring tasks. (Shipped.)** Any task, event or habit can repeat: daily, weekly (chosen weekdays), monthly
  (day of month, clamped to short months) or yearly, every n units (`src/core/recurrence.ts`). One bubble in the
  pond, every occurrence on the calendar, each ticked off in turn with a streak. Still to do: end dates / counts,
  skipping a single occurrence, "after completion" repeats, and RRULE import/export for calendar sync.
- **Natural-language quick add. (Shipped.)** "Dentist friday 2:30pm #Health", "Yoga every mon/wed/fri 7am",
  "remind me to call mom at 5pm", "idea: ..." (`src/core/quickadd.ts`, with a live preview and "Keep as typed").
  Still to do: more phrasings, other languages, and the same parser for the title field in the detail panel.
- **Native iPhone app (SwiftUI).** Port `src/core` first (types, fuzzy match, folder tree, flocking sim,
  grouping), then the views. `ContactsUI`'s contact picker replaces the web .vcf import.

## Images and files
- **Attach images to an item**, and later other file types (PDFs, documents). They show on the item's details panel
  and as a small thumbnail on its bubble and list row. Storage is the open question: object storage (Vercel Blob or
  Neon-adjacent S3) with the item holding only a reference, thumbnails generated on upload, and a size limit per
  account; offline, images are queued on the device and uploaded when sync next runs.
- **Drop things onto the pond.** Drag an image, a text snippet, a link or a file from the desktop (or share one in
  from the phone) onto the water and a new item is created from it: the text becomes the title or notes, an image
  becomes an attachment (with its file name as the title), a link keeps its address and page title. Dropping onto a
  group in the sidebar files it there at the same time.
- **Pictures for people.** A profile picture for your own avatar (the account menu, My Profile) and a photo for
  each person in the address book, shown in the sidebar, address book and on bubbles tagged with them. Cropped to a
  circle on upload; falls back to the colored initial.

## Sound
- **Better effects and a real soundtrack.** Make every sound distinct, so a chime never sounds like a drop or a pop,
  and grow the ambient bed into layered, mixable sounds: a babbling brook, wind, wind chimes, crickets, frogs,
  and so on, each with its own level.

## Accounts
- **Email confirmation** when an account is created, and **password reset**. (**Delete my account** has shipped:
  `POST /api/account` removes the person's workspace, devices and sign-in after they re-enter their email and
  password; "Clear everything" and the demo data switches are in My settings.)

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
- **Flower shapes, not just colors. (Shipped: 12 shapes x 12 colors, monochrome in pickers.)** Folders get a flower *shape* as well as a hue (rose, iris, lily,
  daisy, tulip, lavender…) so they stay distinguishable for color-blind users and read faster at a glance.
  Each new folder cycles through the available shapes and colors by default (preselected), and the folder
  options popover lets you pick any shape and color you like.
- **Blended bubbles.** A bubble that lives in more than one folder could show a color gradient made of
  its folders' colors (or a small ring of their flowers) instead of only its first folder's hue.

- **Petal fill / highlighting.** Fill or highlight a number of a flower's petals to show something at a
  glance (for example how much of a folder is done, or a priority level), as an alternative to changing the
  petal count. Optional; the SVG petal rings already make individual petals addressable.

## Polish ideas
- Folder-specific bubble colors and icons.
- Manual ordering inside list and board columns.
- Custom date picker with times; natural-language dates ("call Sarah next Thursday").
- Haptics on the native app for pops and blooms.
