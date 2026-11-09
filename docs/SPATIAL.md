# Spatial workspace (the "Space" view)

The task map as a place you look around: groups hang around you like notes on a wall, in a soft virtual room (or in front of the
camera), and a phone becomes a window onto them. It is one more *view* (sidebar: **Space**), so it can be hidden or reordered in
Settings like the others, and **Back** returns to the view you came from. The task data is only read: places live in their own
store, keyed by task and group id.

## Architecture (all under `src/spatial/`)

| Concern | File | Notes |
| --- | --- | --- |
| Task data (source of truth) | `src/core/*`, the main store | untouched |
| Layout (where things are) | `layout.ts`, `content.ts`, `store.ts` | `SpatialLayout`: pure, tested. Groups sit on one large, distant cylinder (radius 22.5, everything scaled 2.5x) facing the middle, seen through a narrow lens (40 degrees across at the start, 14 to 80 when zooming), so the wall looks flat and gently curved rather than in your face; the whole 90-degree wall is about two and a half screen widths across on a phone. They start within a wide, shallow stretch straight ahead (70 degrees each side, never behind the viewer), left to right, and on further rows when a row is full; each group leans toward the eye (so none is seen at a steep angle) and the view starts fitted to the whole wall (*Fit all* returns to it); each row is centred and as tall as its tallest group, and groups never overlap (tested). Subgroups are on the same cylinder and joined to their group by a line; tasks sit in a grid (up to 3 wide) in their group's plane. Places are stored per id (`useSpatial`, `localStorage` key `lilac-spatial-v5`, not synced), so adding, completing or removing a task never moves another. A task dragged elsewhere keeps its own `u, v`. A cluster has an optional `anchor` field for future AR pinning; no sensor reading is ever stored. |
| Renderer | `SpatialScene.ts`, `cards.ts` | Three.js (WebGL), transparent so it composites over a camera; cards and group names are canvas textures in the pond's visual language (soft gradient, thin outline in the group colour, round check). Draws only when something changed in touch mode. |
| Look | `cards.ts`, `environment.ts` | Cards are opaque (only ticked-off ones go see-through), with the pond's gradient blended into the app's cream. Each group's pane is drawn at its own proportions with large round corners. Whatever is behind (the camera, a chosen photo) is muted: desaturated, a little less contrast, softly blurred and washed with the cream, so the bubbles stand out. |
| Environment | `environment.ts` | `EnvironmentProvider`: `VirtualEnvironment` (procedural sky, floor glow, drifting dust: the default), `PanoramaEnvironment` (an equirectangular photo the person picks, kept only while open), `CameraEnvironment` (rear camera in a `<video>` behind the canvas; asked for only on request; every track stopped on switch or exit). Changing it never touches the layout; changes are queued so a quick second choice cannot leave a camera running. |
| Tracking | `tracking.ts` | `TrackingProvider` gives the renderer a camera pose and a quality, never the source. `SpatialTracking` = `SensorTracking` (DeviceOrientation, with iOS permission asked from a tap) + `TouchTracking` (drag/pinch/keys). `NativeTracking` marks the place a Capacitor/ARKit provider plugs in. |
| Interaction | inside `SpatialScene.ts` | tap a card: open (the existing details panel); tap its circle: tick it off; tap a group name: turn to it; hold a card or a group name, then drag: move it (a quick drag just looks around, so scrolling never moves anything); drag/pinch/wheel/arrow keys/`+`/`-`/`R`. |
| Controller | `SpatialView.tsx` | picks the best mode, explains on first use, falls back step by step, tears down on exit. |
| Level 5 fallback | `StaticCanvas.tsx` | no WebGL (or switched to *Simple*): the same groups and tasks on a plain canvas you pan and zoom; select, open and complete all work. |
| Wall distance (testing) | `SpatialView.tsx`, `withRadius` in `layout.ts` | A slider down the right side sets the radius of the cylinder the groups' centres are pinned to (4 to 90 units, double-tap resets; saved on the device). Each group keeps its direction and height and leans to face the eye. Near is in your face with strong perspective, far is a distant wall; card sizes stay fixed, so farther looks smaller (use *Fit all* or zoom to compensate). |
| Finding your way | in `SpatialScene.ts` | the Pond's soft edge dots, for the room: a small glowing dot on the frame (in the group's colour) for each group wholly out of view, on the line from the middle of the screen to it, including groups behind you; tap one to turn to it. The maths is `src/core/edges.ts`. |
| Screen readers / keyboard | in `SpatialView.tsx` | a visually hidden list of the same tasks with open and tick buttons. |

With very many tasks the card pictures are drawn smaller (over 120 tasks, then over 240) to save memory; a 300-task test opens cleanly. A one-line tip about holding to move things is shown once.

`three` is the only new dependency; it is loaded only when the view is opened (a separate chunk), so the rest of the app is unaffected.

## Capability levels

1. **World tracking (native ARKit):** not implemented. `NativeTracking` is the seam: a provider with the same shape, whose pose has a
   position and whose quality comes from ARKit's tracking state. The layout's `anchor` fields are where persistent anchors attach.
2. **Visual tracking (camera feature tracking):** *investigated, not built*; see below.
3. **Motion tracking (implemented):** orientation only. We never integrate the accelerometer (it drifts within seconds and gives no
   usable room-scale position). We use the OS's fused orientation, relative to where you were facing on entry or last *Recenter*,
   smoothed (more at small movements, less at large), with the screen-rotation correction. (An earlier version also nudged the heading
   toward the iOS compass; that was wrong and made the view spin steadily, so it was removed. Tests now hold a still phone, with a
   compass heading present, to under a thousandth of a radian over 1200 readings.) If events stop it drops to touch by itself and says so.
4. **Panorama (implemented):** the virtual room (or a chosen 360-degree photo) with touch look-around, pinch zoom, wheel and keys.
   Works on desktop and with no sensors and no camera.
5. **Static canvas (implemented):** no WebGL.

Automatic mode picks motion when the device has it and it is allowed, else touch. The settings button on the view lets the person
choose *Motion* / *Touch only*, the background (*Room* / *Camera* / *Photo*), and *3D* / *Simple* drawing.

## Known limits

- Orientation only: you can turn and tilt, not walk. Heading can drift a little on some devices (use *Recenter*).
- "Lock to space" is not offered yet. Without world tracking the honest options are heading-based (approximate) or re-placing the
  pane each session; ARKit (native) is the real answer.
- Not yet tested on a real iPhone: see the testing notes below.
- The camera is a plain background: nothing is recognised in it.

## Phase 4: visual tracking, what was found (desk research only; nothing was prototyped or measured on a phone)

- iPhone Safari has no WebXR AR and the web has no LiDAR, so any camera-based tracking in the PWA must be computer vision on frames
  from `getUserMedia`.
- Candidates: **OpenCV.js** (feature detection, optical flow, essential-matrix pose; heavy WASM, a few MB, Apache-2.0, and visual
  odometry from scratch would be a real project), **MindAR** (image-target and face tracking on TensorFlow.js; image targets would suit
  "pin the pane to this poster" but it tracks a *known image*, not the room), **AR.js** (marker/NFT tracking; the AR.js code is MIT
  but its jsartoolkit5 core is LGPLv3 with an extra permission: check the current licence files), and **8th Wall** (the one that did
  real web SLAM, now winding down: hosting ends February 2027 and only part was open sourced, SLAM only as a binary).
- Recommendation: do not build SLAM. If visual stabilisation is wanted, the lowest-risk first step is *image-target pinning* (the
  person prints or picks a poster; the pane anchors to it, which also gives a way to re-find a "space" each session) behind the
  existing tracking interface, measured on real iPhones for frame rate, heat and battery before deciding. The native ARKit provider
  remains the plan for true 6DoF.

## Testing

Unit: layout stability and placement (`layout.test.ts`), the orientation maths (`tracking.test.ts`). End to end (Chromium, with a
fake camera and fake motion events): `e2e/spatial.spec.ts`, `e2e/spatialcamera.spec.ts` cover entry and the explanation, touch
navigation, motion granted and denied (and the window turning), camera allowed and denied (and that every track stops on switch and
on exit), no-WebGL and chosen-simple fallbacks, completing from the workspace, and layout retained across exit and re-entry.
**Not tested on a real iPhone** (no device was available): motion permission on iOS Safari and as a home-screen app, real sensor
feel and drift, camera in a home-screen app, GPU/battery/heat. Those need a pass before relying on it.

## Latest changes
- Groups sit on a fixed cylinder (radius 80). The old radius slider is gone; Settings has a **View angle** slider (20-100) with a default dot at the usual angle.
- Backgrounds are named Space / Camera / Photo; drawing is 3D / Flat.
- Cards use the line-view row style (not round), with inset check wells; chips no longer clip.
- Groups never overlap (push-apart keeps them clear). Family-tree rows by group depth; thick tapered ribbons link parent to child.
- Drag a group (name or pane) to move it; drag a task to move it; drop on a group to retag it; leave the pane to float it, then drop into another.
- Test hook: `?spacetest` exposes `window.__space`.

## Org-chart layout, radius and flat canvas
- New layouts are drawn like an org chart: each group centred over its subgroups on the row below; top-level groups side by side across ~110 degrees, wrapping into bands. Panes stand upright (no lean).
- **Radius** (Settings, default 200) is the cylinder the wall hangs on. Sizes and arc-length spacing never change: a smaller radius wraps the wall around you, a larger one flattens it. **View angle** and pinch zoom the lens. 3D / Flat, Recenter, Fit all and Clean up are always on the canvas.
- **Flat** has no 3D or sensors: the same org chart on a plain canvas with connector curves; drag to pan, pinch or scroll to zoom, Fit button.
- Stored layout key is now `lilac-spatial-v5` (old arrangements start afresh).

## Group headers
A group's name sits outside and above its box (the box is only the contents): a twirl (tap to fold the group down to just its name; remembered), the group's flower, the name in the pond's style, and the count. The same flower now sits in front of group names in the pond. Connector ribbons are thinner with less width variation.

## Folding and spring-loaded groups
Folding a group (the twirl) hides its subgroups too and leaves only its name, with the count of everything inside; groups with no tasks of their own show no box. A task or group carried over a folded name lights it, and after a short linger (0.7 s) it opens so you can see where you are dropping; it closes again afterwards unless the drop went into it. A task let go on a name joins that group; a group let go on a name moves inside it (over a box it only makes room). Other groups stay put while one is carried and make room when it is let go.

## Flat has the same moves as 3D
Drag a task onto a group's box or name (a folded name opens after a short linger), or out into the open to leave it floating; drag a group by its name or box to move it (others make room when it is let go), or onto another name to put it inside; tap a name to turn to it; the twirl folds. Pan on empty canvas, pinch or scroll to zoom. Tests: `e2e/flatmove.spec.ts`.

## Onto the sidebar
In both 3D and flat, carrying a task or group out over the sidebar lights up its groups and shows the usual drag chip; letting go there drops a task the way the other views do (it gets that group's tag) and puts a group inside the group it is dropped on.

## One look for every item
Cards in both Space modes wear the pond bubble's look: the same shine, glow, outline and shadow, deeper when urgent (`src/core/look.ts` for the canvas, `.pad`/`.tint` in the stylesheet, kept in step by `look.test.ts`). The date chip's words and tone come from `dueInfo`, as in every other view; the flat row uses the real done button and date chip.

## Border, glow and badges
Every item has a real 1px border in its group's colour and a soft white glow around its words. The colour glow sits at the left, under the title (a flat row caps it at 24rem so it hugs the title on a wide screen); the shine is at the right. List and board rows show small badges for what is set (reminder, repeat and streak, progress, checklist count, person, picture), at most three, in the same bordered-chip family as the date, place and group chips. The 3D cards are textures drawn about 4x the size they show at, so their hairline is drawn at 2.5 texture pixels to land near one screen pixel at the usual zoom; it grows and shrinks with the card when zoomed.

## Keep tidy
Space is the organised view (the pond is the free one): with **Keep tidy** on (the default; a checkbox in the Space settings), things let go settle onto a grid, gliding there rather than jumping. A card let go in a group goes to the nearest free slot of that group's grid; a group snaps to a half-card grid across and a card-row grid down, its subgroups keeping their places around it, and the others make room (and are snapped too); a floating card snaps to a coarser grid. Turning it on tidies what is already there; turning it off leaves things where they are let go. Pure maths in `layout.ts` (`snapCluster`, `tidyClusters`, `nearestFreeSlot`, `snapFree`, `tidyEverything`), tested in `layout.test.ts`; the 3D scene eases each card toward its place, and the flat canvas does the same with CSS transitions.
