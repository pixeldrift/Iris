# Lilac

A calm, floating to-do list with many ways of seeing the same tasks. Soft glass,
cream and lilac, a pond you can click to plant a thought. PWA prototype of a
future native iPhone app.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # core logic tests
npm run build      # type-check + production build to dist/
```

Deploy: import the repo in Vercel (framework preset Vite). Add to Home Screen on
iPhone to install it as an app. Data lives in `localStorage` for now.

## What's in the prototype

**Views** (left sidebar): Pond (free canvas), List (sortable), Board (kanban),
Priority (Eisenhower), Calendar (month/week) and Timeline (gantt). Every view
respects the selected folder or day.

**Folders are tags.** Make your own tree (hover a folder for + / rename /
delete, double-click to rename, drag a folder onto another to nest it). Drag any
task onto a folder to tag it, or onto a day under *This week* to schedule it.
In a task's panel, type in the tag box: it fuzzy-matches existing folders
("engilsh" finds English 101), and offers **+ Create** for anything new
(`School/Essays` creates a nested path).

**Pond.** Click the water: ripple, a water-drop sound and a bubble to type in.
Lilies float gently, and grow with importance. Toggles in the top bar control
sizing, drifting, sound and the ambient wind-chime bed.

**People.** Add people in the sidebar (type details, or pick *one* contact from your address book where
the browser supports it, or import a shared `.vcf` card). Tag them on tasks with `@name`. Write "Call
Sarah" or "Email Dr Patel" in a task and Lilac links an existing contact or offers to add one (or "No
thanks"); the bubble then gets a one-tap Call / Text / Email link.

**Pond navigation.** Drag the water to wander, pinch (or Ctrl/⌘ + wheel) to zoom, *Frame all* to bring
every bubble back. *Gather by* chips (folders, when, weight, kind, people, stage) make related bubbles
float together; in *Free* mode related bubbles lean toward each other and are joined by dotted threads.

**Sound.** Tap the speaker to mute/unmute; hold it (or right-click) for individual sounds and volume.

**Soft priority.** Two sliders ("how much it matters", "how pressing it feels")
with no numbers; on the Priority view you drag a task around the plot to set both.

See [docs/ROADMAP.md](docs/ROADMAP.md) for what's next (collaboration, themes…),
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the stack, the Swift
porting plan and next steps, and [db/schema.sql](db/schema.sql) for the Neon
schema.
