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

## Notifications when the app is closed (Web Push)

Reminders and event alerts also arrive as phone/computer notifications while Lilac is closed. One-time setup:

1. `npm run bundle:core` is only needed if you change `src/core/reminders.ts` (a test tells you); the result is committed.
2. Run `node scripts/vapid.mjs` and copy its four lines into Vercel > Settings > Environment Variables:
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (use your own `mailto:`), `CRON_SECRET`. Redeploy.
3. Run `db/schema.sql` again in the Neon SQL editor (adds `push_subscriptions` and `push_sent`).
4. Something has to call `GET /api/remind` about once a minute with the header `Authorization: Bearer <CRON_SECRET>`.
   Vercel's free plan only runs cron jobs daily, so use a free pinger such as cron-job.org (every minute, add that header).
5. On each device: sign in, open Settings and switch Notifications on. On iPhone, first Share > Add to Home Screen
   and open Lilac from there (iOS 16.4+ only delivers push to installed apps).

The server never changes your tasks: it only reads them, sends what is due, and remembers what it sent (`push_sent`).

## The mental model (keep this in mind)

**Views and filters are two separate things.** The purple *View* card in the
sidebar chooses *how* you view your tasks (Pond, List, Progress, Priority, Calendar, Timeline,
Overview). Everything below it, under *Filter*, chooses *what* you look at. Each
works on its own: any filters work on any view, and the breadcrumbs under the view's
name always shows what filters are active. "Filter: Everything › School › English".
Selecting *Everything*, clears all filters. The setting *Switching views
clears filters* starts each view from Everything instead of keeping the filter.

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

**Planning days.** *Plan for* (the day you'll do it) is separate from *Deadline* (when it has to be done), and each has a
reminder of its own. Both show on the calendar. Dropping a task on a weekday sets the *Plan for* date. Unfinished tasks carry forward
to the next day automatically (under *More options*, switch it off per task, or set a timeline start).

**Where.** Any item can have a place, a room or a link: it shows as a pin chip on rows and cards, a pin on the bubble, and the
button beside it opens a map (or the link).

**Repeats.** Any task, event or habit can repeat (daily, weekly on chosen days, monthly by date or "third Tuesday", yearly,
every n). A repeat can end on a date or after a number of times, and a single day can be skipped and put back. Each
occurrence is ticked off in turn, and you're encouraged for consistency streaks.

**Reminders.** In-app cards and system notifications while the app is open. Events have as many reminders as you like before
they start. Separate reminders for the day and one for the deadline. (Delivery with the app closed is on the roadmap.)

**Quick add.** Type naturally ("Dentist friday 2:30pm #Health", "Yoga every mon/wed/fri 7am", "remind me to call mom at 5pm");
the preview shows what it understood.

**Moving clusters.** In a *Gather by* view, drag a bubble slowly and its whole cluster follows on a rubber
band, nudging others aside. Flick it fast to snap it free, then drop it on another cluster to re-tag it
(group, due date, type or person).

**Soft priority.** Two sliders ("how much it matters", "how pressing it feels") with no numbers; on the Priority view you drag
a task around the plot to set both. With *Raise urgency near deadlines* on (the default), the urgency actually used is
the higher of your slider and what the deadline calls for; a small dot under the slider shows the value in use, and your own
setting is never changed.

**Popping.** The pop option in the Pond has three modes: *Fun* is a Freeform relaxing fidget for those who enjoy the satisfaction
and sensory experience. *Game* is a Simon-style memory challenge. Watch the color pattern, and pop the bubbles in order. *Delete*
mode is for easily removing multiple tasks in bulk. Poppinga bubble deleted the task, so be careful. Fun and Game are limited to three
minutes at a time, with breaks that grow longer if you play too often. 
(Settings: *Limit play time*). Play stats are kept on the device and shown in Overview.

**Settings** Accesed under your user account menu: Color and view settings, date and clock style, sound comtrols, and more. Add your profile image and contact details.

See [docs/ROADMAP.md](docs/ROADMAP.md) for what's next (push reminders, attachments, themes…),
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the stack, the Swift
porting plan and next steps, and [db/schema.sql](db/schema.sql) for the Neon
schema.
