# Lilac roadmap

## Recently shipped
Progress (percent complete): a slider, a count (12 of 20) with a tally and keypad, or a list's ticks; break points for the Progress
columns that move items both ways (see *Progress* in the README);
Web Push reminders that reach you when the app is closed (tested on two real phones, both installed to the Home Screen, with the app closed);
sharing a group (first cut: see *Collaboration*);
list ordering ("My order") and "at <place>" in quick add; Progress view with stages you can edit and drop-anywhere ordering; the
calendar's endless month grid (dotted outline/solid bubbles for scheduled/deadline, month dividers, an unscheduled tray) and day
schedule; separate Scheduled for / Deadline dates with their own reminders; a place on every item; repeats that end or skip a day;
multi-select filters and the views/filters split in the sidebar; auto urgency; the timeline restyle; the pop game with Fun / Game /
Delete modes, stats and a play limit; a tidier Settings. (The README describes each.)

## Next, in order
1. **Sharing and assigning, per group. (The headline feature: see *Collaboration* below.)** Share a group with someone, as you
   would share a note in iOS: you both see and edit its tasks, and you can **assign a task to a person**, who is told and can
   filter to what is theirs. People asked for this first.
2. **A structured canvas view ("Map"): the whole of your tasks in one navigable place, compact and readable.** The Pond is for
   feeling and play, but a bubble's text is sized by its circle, so it takes a lot of room and is hard to read. This view is the
   serious counterpart: still one large canvas you pan and zoom (same gestures as the Pond), but laid out like an org chart or
   family tree, with the group hierarchy drawn as structure and tasks as dense one-line cards. *(Planned; the design is below.)*
   - **Shape.** Groups are containers (nested, with the hierarchy from the sidebar: School › English 101), laid out left to right
     like a tree with connectors, or as nested columns that wrap like masonry (a toggle; start with columns, they are the
     densest). Each group's header shows its colour, name, a count and a progress ring; the tasks inside are compact cards:
     check box, title (up to two lines, real text size, never scaled by importance), then small chips for due date, place pin,
     people avatars, a thin progress bar (and 12/20 counts). Same colour language as the rest of the app.
   - **Semantic zoom.** Far out: group tiles only (name, count, progress ring, the next due item), so a whole life fits on one
     screen. Mid: compact rows. Close: full cards with notes, list entries and the picture. Double-click or pinch into a group to
     zoom to it; a mini-map and *Fit all* keep you oriented; the breadcrumb and sidebar filter apply, so you can map just one group.
   - **Finding your way.** Like the Pond's edge pointers (a soft glowing dot riding the frame, on the line from the middle to
     each bubble that is wholly off screen), the Map keeps the mini-map and the same edge markers, so nothing is ever lost off the edge.
   - **Collapse and focus.** Every group folds (its state remembered, like the task panel's boxes); a single-click on a header
     focuses it and dims the rest. Search highlights matches and dims everything else (as in the Pond).
   - **Direct manipulation.** Drag a card to another group to retag it (the same drop targets as the sidebar), drag within a
     group to reorder (the same "My order" ranks as the List), tap to open the details panel. Shared groups and assigned tasks
     show their person marks and avatars.
   - **Lenses** (what the structure is drawn from): *by group* (the default), *by person* (a family-tree style of who is
     doing what, using assignments and tags), *by stage* (swimlanes of the Progress columns, with percent-complete), and *by
     time* (this week, next week, later). Same cards, different grouping.
   - **Density.** Compact, comfortable and roomy settings; completed items and past events follow *Show completed tasks*.
   - **How it is built.** A pure, tested layout in `src/core` (`layoutMap`: groups, tasks and options in; boxes and connectors
     out, so it ports to the Swift app) plus a DOM renderer on a transformed canvas (fine to roughly a thousand cards; far
     zoom draws tiles only, never the cards), reusing the Pond's pan and zoom, the folder tree, the drag and drop targets and
     the List's row components.
   - **Order of work.** (1) Nested columns, compact cards, pan/zoom, fit all, collapse; (2) drag to retag and reorder, semantic
     zoom, mini-map; (3) tree connectors and the by-person lens; (4) stage swimlanes and the by-time lens. Open questions:
     the name (Map, Atlas, Board), and whether the by-person lens should start from the address book or from shared members.
3. **Blended bubbles** (a gradient of a bubble's groups): a small visual win to slot in alongside.
4. **Attachments and dropping things onto the pond** (images first; the storage choice is worth a design chat), then
   **Overview goals**.
5. **Accounts you can rely on:** email verification and password reset (needs an email provider). Needed before inviting
   people into shared groups at any scale, and for email invitations.
6. **Calendar sync** (CalDAV, Google), now that accounts and sync are live.
7. **Themes**, then the **native Swift port** of `src/core`.

Also worth a pass on real devices: the recent calendar touch behaviour (drag-scrolling, the unscheduled tray, sideways phone), and sharing between two real accounts.

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
  Web Push (VAPID) delivery for the PWA is built and tested on two real phones (see README, "Notifications"). Still to do: APNs for native, and Web Push for sharing news and assignments (they appear in the bell for now; see *Collaboration*).
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
  pond, every occurrence on the calendar, each ticked off in turn with a streak. End dates and counts, and skipping a single
  occurrence, have shipped. Still to do: "after completion" repeats, and RRULE import/export for calendar sync.
- **Location. (Shipped.)** A place, room or link on any item: a pin chip on rows and cards, a pin on the bubble, and a button
  that opens a map (or the link). Quick add understands "at <place>". Still to do: remembering places you use, and travel time.
- **Natural-language quick add. (Shipped.)** "Dentist friday 2:30pm #Health", "Yoga every mon/wed/fri 7am",
  "remind me to call mom at 5pm", "idea: ..." (`src/core/quickadd.ts`, with a live preview and "Keep as typed").
  Still to do: more phrasings, other languages, and the same parser for the title field in the detail panel.
- **Native iPhone app (SwiftUI).** Port `src/core` first (types, fuzzy match, folder tree, flocking sim,
  grouping), then the views. `ContactsUI`'s contact picker replaces the web .vcf import.
  Things the web version works around that the native app can simply do properly:
  - **The form-field strip above the iPhone keyboard** (the up and down arrows and ✓ iOS adds above the keyboard) cannot
    be hidden from a web page, and it costs a lot of height on a phone turned sideways. In a native text field it is one
    line (`inputAccessoryView = nil`). The web app's sideways "typing bar" (`src/ui/LandscapeInput.tsx`) exists only to
    get around this and the keyboard covering the box; the native app should not need it.
  - Haptics for pops and checking off, background reminders (APNs), and the system share sheet.

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

## Collaboration (first cut built; see below for what is left)
**Built:** share a group from its menu (Share / Sharing): invite a connection by name or by a one-use link (14 days), choose
*can edit* or *can view* per person, remove someone, stop sharing, or leave. Invitations and news (joined, left, stopped
sharing, a task given to you) are in the bell. A shared group shows a small person mark in the sidebar, and a task in one has an
*Assigned to* field (the person is notified). Each shared group is its own workspace; moving a group in or out of sharing moves
its tasks too, through ordinary sync. Tested with two browsers against the local backend; not yet with two real accounts.

**When sharing ends, the owner and the other person each decide.** The owner (removing someone, or stopping sharing)
chooses *they may keep a copy* or *no copy*. With no copy, access ends at once and the group disappears for them. With a copy,
they are told, keep read-only access, and choose *Keep a copy* (the group is copied into their own space, nothing shared) or
*Let it go*. When everyone has decided, a group the owner stopped sharing comes back to them on its own. Someone who simply
leaves chooses for themselves whether to keep a copy.

**Still to do:** an *Assigned to me* filter and an avatar on assigned tasks; Web Push for invitations and assignments;
*added by* / *completed by* and a recent-activity line; conflict handling for two people editing one task (server-assigned versions,
then field-level merge); comments and @mentions; presence; an expiring link that can be used by several people.

**The goal, in full:** shared lists, like a shared note in iOS.
**The goal: shared lists, like a shared note in iOS.** Two or more people open the same group and see and edit the same tasks,
see what the other added, and can **assign tasks to each other**.

**The unit is the group.** Sharing is per group (a group and the groups under it), not the whole pond; everything else stays
private. A shared group appears in everyone's sidebar with its members' initials, and its tasks show in every view and filter
like any other.

What people will be able to do:
- **Share a group.** From the group's menu: invite by link, or pick someone you are already *connected* with (Connections
  exists). Roles per person: *editor* (add, change, tick off) or *viewer* (read only); you stay the owner.
- **Assign a task.** An *Assigned to* field on a task (and `@name` in quick add: "Pick up milk @Sam"). Assignees come from the
  group's members. Anyone can assign within a shared group; unassigned stays open for whoever gets to it.
- **Know what is yours.** A new *Assigned to me* filter in the sidebar; a small avatar on assigned tasks; a notification
  (the bell, and Web Push, which is already built) when something is assigned to you or someone completes your task.
- **See who did what.** "Added by", "completed by" and a recent-activity line per shared group.
- **Stay in sync.** Edits from others arrive within seconds (the fast sync pace already switches on when two people have it open).

How it is built (the groundwork exists: see `COLLABORATION.md`):
- Each shared group becomes its own *workspace*, with its members and roles; the tasks in it are rewritten into that workspace.
  Sync, role checks on writes and "who last wrote this" are already in place on the server.
- A task lives in one workspace. Tagging a private task into a shared group moves it there (with a confirmation saying who will
  see it); tagging a shared task into a private group keeps it in the shared one.
- Assignment needs the link between an address-book *person* and a Lilac *user* (`person.userId`, which Connections already
  establishes), so "Sam" in your book is the Sam who can be assigned.
- Conflicts: two people editing one task at once needs more than last-write-wins: server-assigned versions first, then
  field-level merge for title, notes, status, dates and tags.
- Invitations, expiring links, leaving a group, and removing a member (what they keep, what they lose).

Later: comments on a task and @mentions that notify; gentle presence (a drifting petal for each person on a shared pond);
sharing a single task with someone outside a group; link sharing with expiry; moving to real-time (server-sent events) when many
people share a group.

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
- **Blended bubbles (next, see the list at the top).** A bubble that lives in more than one folder could show a color gradient made of
  its folders' colors (or a small ring of their flowers) instead of only its first folder's hue.

- **Petal fill / highlighting.** Fill or highlight a number of a flower's petals to show something at a
  glance (for example how much of a folder is done, or a priority level), as an alternative to changing the
  petal count. Optional; the SVG petal rings already make individual petals addressable.

## Polish ideas
- Folder-specific bubble colors and icons.
- Custom date picker with times; natural-language dates ("call Sarah next Thursday").
- Haptics on the native app for pops and blooms.
