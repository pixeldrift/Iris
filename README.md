# Lilac

A calm, floating to-do list with many ways of seeing the same tasks. Soft glass,
creamy and pastel vibes, a pond you can click to plant a thought. PWA prototype of a
future native iPhone app.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # core logic tests (fast)
npm run test:e2e   # browser tests (slow: run the ones for what you touched, e.g. `npx playwright test e2e/board.spec.ts`)
npm run build      # type-check + production build to dist/
```

Deploy: import the repo in Vercel (framework preset Vite). Add to Home Screen on
iPhone to install it as an app. Data lives on the device, and syncs to your account when you are signed in
(see [docs/ACCOUNTS.md](docs/ACCOUNTS.md)). CI runs the types and unit tests on what lands on `main`; the slow browser
tests run weekly or by hand from the Actions tab (see [docs/TESTING.md](docs/TESTING.md)).

## What's in the prototype

**Views** (the purple card in the left sidebar):
- **Pond**: the free canvas, bubbles floating on water. Click the water to add a thought.
- **List**: sortable rows, swipe a row to delete it, drag to tag or schedule. Each shows its group, its day and where it is.
  *My order* lets you drag a row to any spot, with a purple line showing where it lands.
- **Progress**: stages side by side (Pending, In Progress, Completed, or your own per group, with the pencil at the top).
  Drag a card to another stage and drop it anywhere in the list, with a purple line showing where it lands (no spot given
  puts it at the top); the purple + in a stage's header opens a box to add one at the top.
- **Priority**: the Eisenhower plot; drag a task around to set how much it matters and how urgent it is.
- **Calendar**: month (an endless grid: drag it to scroll, the arrows slide a whole month), week, and day (a list, or a
  schedule by the clock with events as tall as they last, drag to move or stretch). Items with no day wait under the days.
- **Timeline**: a Gantt of dated items; drag bars to shift them, drag the ends to stretch, pinch to zoom in to hours.
- **Overview**: what got finished, streaks, where the effort went, and your pop stats.

Every view respects the selected filter (a group, person, day, or several). Fold the card with its arrow and the views become
a row of icons.

## Notifications (reminders that reach you when the app is closed)

Reminders show as cards inside Lilac while it is open, and as phone/computer notifications even when it is closed. Events can have
several alerts before they start; other items have one reminder for the day and one for the deadline. Tapping a notification
opens that task. The *Push Notifications* switch is in Settings (and a small copy sits at the bottom of the bell's notifications
list); it needs you to be signed in, and the browser's permission.

### How it works (technical note)

- **Two delivery paths.** While the app is open, `ReminderHost` (`src/ui/Reminders.tsx`) checks the clock every 10 seconds and
  shows the card, sound and a system notification through the service worker. While it is closed, the server pushes the same
  reminders using standard Web Push (VAPID), so there is no third-party push service to sign up for.
- **Subscribing.** Turning the switch on asks the browser for permission, subscribes with the service worker's `PushManager`
  using the public key from `POST /api/push` (`action: 'config'`), and saves the subscription (its address and keys, plus the
  device's time zone) in the `push_subscriptions` table. Turning it off, or opening the app, unsubscribes or refreshes it
  (`src/sync/push.ts`). A dead address (the browser answers 404/410) is deleted on the next send.
- **Sending.** `GET /api/remind` (`api/remind.ts`, guarded by `Authorization: Bearer $CRON_SECRET`) runs one sweep
  (`api/_lib/push.ts`): for each subscribed person it reads their tasks (from every workspace they belong to), works out which
  reminders and event alerts have come due, and sends one push per device with the `web-push` library. It only reads tasks, never
  changes them. The app's own `reminded` / `alertsDone` flags (synced like any other field) stop a reminder being pushed after
  the open app already showed it, and a 30-second grace gives it a moment to do so.
- **Never twice.** Each reminder has a key (`do|due:<task>:<time>` or `a:<task>:<start>:<minutes>`); the sweep claims it with
  an insert into `push_sent` before sending, so overlapping sweeps cannot both send it. Anything more than 2 hours overdue is
  skipped (not worth a buzz), and `push_sent` rows are pruned after 3 days.
- **Time zones.** Event times are wall-clock times ("9:00"), so the server converts them in each device's own zone (`rezone`).
- **Shared logic.** The reminder rules live in `src/core/reminders.ts` and are used by both the app and the server. The server
  runs a bundled copy, `api/_lib/core.gen.js` (made by `npm run bundle:core`, committed), because Vercel's Node runtime does not
  load the app's extensionless TypeScript imports; a unit test fails if the copy is out of date.
- **Service worker.** `public/sw.js` has the `push` handler (shows the notification, tagged per task so duplicates collapse) and
  the `notificationclick` handler (focuses the app and opens the task).
- **Caveats.** The sweep runs once a minute at best, so a push can arrive up to about a minute late. iPhone only delivers push to
  a Lilac that was added to the Home Screen (iOS 16.4+). Delivery has been tested here only with the server logic and a local
  database, not on real phones.

### Setting it up (once)

1. Run `node scripts/vapid.mjs` (after `npm install`) and copy its four lines into Vercel > Settings > Environment Variables:
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (use your own `mailto:`), `CRON_SECRET`. Redeploy.
2. Run `db/schema.sql` in the Neon SQL editor (adds `push_subscriptions` and `push_sent`; run each statement whole).
3. Something has to call `GET /api/remind` about once a minute with the header `Authorization: Bearer <CRON_SECRET>`.
   Vercel's free plan only runs cron jobs daily, so use a free pinger such as cron-job.org (every minute, with that header).
   A 401 means the header is wrong, 503 the keys are missing, 500 usually the tables are missing.
4. On each device: sign in, open Settings and switch *Push Notifications* on. On iPhone, first Share > Add to Home Screen and
   open Lilac from there.
5. Only if you change `src/core/reminders.ts`: run `npm run bundle:core` and commit the result.

## The mental model (keep this in mind)

**Views and filters are two separate things.** The purple *View* card in the
sidebar chooses *how* you view your tasks (Pond, List, Progress, Priority, Calendar, Timeline,
Overview). Everything below it, under *Filter*, chooses *what* you look at. Each
works on its own: any filters work on any view, and the breadcrumbs under the view's
name always shows what filters are active. "Filter: Everything › School › English".
Selecting *Everything*, clears all filters. The setting *Switching views
resets filters* starts each view from Everything instead of keeping the filter.

**Groups are tags, not folders.** A group does not contain anything. It is a
filter. Choosing a group shows the tasks carrying that tag, in whichever view you are
on. The tree only organizes the tags themselves (School › English), so a group
shows its own tasks and those of the groups under it. The relationship works in
either direction. Add a tag to an item, or drag an item onto a tag. Both do the
same thing.

Make your own tree (hover a group for + / rename /
delete, double-click to rename, drag a group onto another to nest it). Drag any
task onto a group to tag it, or onto a day under *This week* to schedule it.
In a task's panel, type in the tag box: it fuzzy-matches existing groups
("engilsh" finds English 101), and offers **+ Create** for anything new
(`School/Essays` creates a nested path).

**Pond.** Click the water to create a task, and it ripples across all your tasks.
Task bubbles float gently, and grow with importance. Toggles in your user settings control
sizing, drifting, and sound options.

**Group flowers.** Every group has a flower icon and a color. New groups cycle through 12 flower shapes and
8 colors automatically. Tap a group's flower to change its icon, color, name, or delete it.
The artwork is editable SVG in `src/assets/flowers/`; `/#flowers` shows the whole set.

**People.** Add people in the sidebar (type details, or pick *one* contact from your address book where
the browser supports it, or import a shared `.vcf` card). Tag them on tasks with `@name`. Write "Call
Sarah" or "Email Dr Patel" in a task and Lilac links an existing contact or offers to add one (or "No
thanks"). The bubble then gets a one-tap Call / Text / Email link.

**Pond navigation.** Drag the water to wander, scroll the mouse wheel (or pinch) to zoom about the cursor (Shift + wheel slides the view), *Frame all* to bring
every bubble back. *Gather by* chips (groups, when, weight, kind, people, stage) make related bubbles
float together. In *Free* mode, related bubbles lean toward each other. On mobile, a sliver of the sidebar
stays beside the pond. Tap it, or drag a bubble onto it, to open the drawer and drop the bubble into a group.

**Planning days.** *Scheduled for* (the day you'll do it, an outlined circle ○) is separate from *Deadline* (when it has to be done,
a filled circle ●), and each has a reminder of its own. Both show on the calendar with those same circles (a finished task is
faded with a tiny tick, and leaves the calendar with its other date unless *Show completed tasks* is on). Dropping a task on a weekday sets the *Scheduled for* date. Unfinished tasks carry forward
to the next day automatically (under *More options*, switch it off per task, or set a timeline start).

**Where.** Any item can have a place, a room or a link: it shows as a pin chip on rows and cards, a pin on the bubble, and the
button beside it opens a map (or the link).

**Repeats.** Any task, event or habit can repeat (daily, weekly on chosen days, monthly by date or "third Tuesday", yearly,
every n). A repeat can end on a date or after a number of times, and a single day can be skipped and put back. Each
occurrence is ticked off in turn, and you're encouraged for consistency streaks.

**Reminders.** Cards and sound inside the app, and push notifications when it is closed (see *Notifications* above).
Events have as many reminders as you like before they start. Other items get separate reminders for the day and for the deadline.

**Quick add.** Type naturally ("Dentist friday 2:30pm #Health", "Yoga every mon/wed/fri 7am", "remind me to call mom at 5pm");
"Lunch with Sam at Panera" adds a place; the preview shows what it understood.

**Moving clusters.** In a *Gather by* view, drag a bubble slowly and its whole cluster follows on a rubber
band, nudging others aside. Flick it fast to snap it free, then drop it on another cluster to re-tag it
(group, due date, type or person).

**Soft priority.** Two sliders ("how much it matters", "how pressing it feels") with no numbers; on the Priority view you drag
a task around the plot to set both. With *Automatic urgency* on (the default), the urgency actually used is
the higher of your slider and what the deadline calls for; a small dot under the slider shows the value in use, and your own
setting is never changed.

**Popping.** The pop option in the Pond has three modes: *Fun* is a freeform, relaxing fidget for those who enjoy the satisfaction
and sensory experience. *Game* is a Simon-style memory challenge. Watch the color pattern, and pop the bubbles in order. *Delete*
mode is for easily removing multiple tasks in bulk. Popping a bubble deletes its task, so be careful. Fun and Game are limited to three
minutes at a time, with breaks that grow longer if you play too often.
(Settings: *Limit play time*). Play stats are kept on the device and shown in Overview.

**Sharing a group.** Open a group's menu (tap its flower) and choose *Share*. Invite someone you're connected with by name, or copy a
one-use invite link; each person *can edit* or *can view*. Everyone sees and changes the group's tasks (and the groups under it) and
can give a task to another member with *Assigned to* (they're told in the bell). When sharing ends, the owner chooses whether the
others may keep a copy, and they choose whether to: the group is copied into their own space, or let go. Technically each shared
group is a workspace (`api/_lib/share.ts`, `/api/share`; tasks sync through the usual `/api/sync`). **Run `db/schema.sql` again** to
add the sharing tables and columns.

**Settings** Accessed under your user account menu (the title stays put while the options scroll): *Soundscape* (audio, volume,
drops, task sounds, pops, ambient chimes); *Look & Feel* (colour, menu spacing, and the Pond's bubble scaling, drifting and
bloomed tasks); *App options* (*Switching views resets filters*, *Automatic urgency*, *Limit play time*, tooltips,
*Push Notifications*); *Region* (date format, time format, time zone); demo data; and your data, account and connections.
Add your profile image and contact details.

See [docs/ROADMAP.md](docs/ROADMAP.md) for what's next (blended bubbles, attachments, calendar sync, themes…),
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the stack, the Swift
porting plan and next steps, and [db/schema.sql](db/schema.sql) for the Neon
schema.
