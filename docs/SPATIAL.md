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

## Wall mode (third drawing: 3D, Flat, Wall)

Wall mode uses the camera to find a flat surface and hangs the groups flat, just in front of it, so moving the phone moves you across them (a replacement for finger navigation, not measured AR). All of it is plain TypeScript in `src/spatial/wall/` (see "The wall module" below); nothing here needs ARKit or WebXR (iPhone Safari has neither).

- **Finding the surface.** A bright or dark rectangle (a sheet of paper, a poster, a frame) that stays put for three looks becomes the surface (`rectangle`). With no rectangle for about 2 s and enough corners in the middle of the picture, the middle of the picture is used (`texture`). "Anchor here" does that on demand. A paper-shaped rectangle is snapped to A4/Letter ratios.
- **Following it.** Harris corners tracked with pyramidal Lucas-Kanade (forward/back checked), a RANSAC homography against the first picture, then decomposed to a camera pose in plane units (surface width = 1). The pose is blended with the gyro: the vision pose nudges an offset quaternion, so between pictures the gyro carries the view.
- **What you see.** Only when the surface is first found (or found again after being lost), a one-off "scanned" effect of about 2.4 s: a soft outline that fades in and out, and a grid of dots wiping across the surface, after which the virtual wall is revealed. Nothing stays on screen after that except the virtual wall's own dot grid. The Space plane floats a little in front of the wall, so drift is hard to notice. Scale is deliberately loose.
- **Depth.** Cards stand `TASK_LIFT` in front of their group's plate in every mode, including 3D.
- **Limits, not yet verified on a real phone.** Camera intrinsics are guessed (the "Camera angle" slider calibrates); blank walls give no corners; heat and battery are untested; the camera must be allowed, otherwise it falls back to 3D with a note. A native app would replace `WallTracking` with ARKit behind the same `TrackingProvider`.
- **Tests.** `vision.test.ts` (synthetic images), `e2e/spatialwall.spec.ts` (a streamed canvas of a textured wall with a sheet on it reaches "holding" and releases the camera).

### Wall mode: the tracker's camera and the background are separate
`TrackingCamera` (`wall/TrackingCamera.ts`) is the camera the tracker reads (asked for at 640x480; 1280x720 only while it is the background). The background uses the same control as 3D: **Virtual** (default: a dot grid on the wall, plus a dot floor and side walls fading into mist), **Camera** (that same camera picture, full size, through `SharedCameraEnvironment`, so it is not opened twice) and **Photo**. Whenever the background is not Camera, the camera stays hidden (no corner picture); the dot grid and the glowing frame show what it is locked onto.

### Wall mode: a map that keeps growing, and pins
The tracker no longer depends on the surface it first found. Each frame, new corners are picked up anywhere the camera sees and stored in the surface's own coordinates through the current fit, so the hold passes on from older points to newer ones as the camera moves (`SurfaceTracker`, tested by panning well past the first region). Every point pinned so far (up to 320, kept even when out of view) is drawn as a large soft pin on the wall plane in the virtual world, so some are always in view; the wall's own dot grid is smaller and lighter. When vision is lost the gyro carries the view and the pins stay where they were. Errors still accumulate slowly, since each new point inherits the fit's error: it is a viewport, not a measurement.

### Wall mode: camera first, size, and the status icon
- **Camera first.** Whatever the background, Wall starts by showing the camera while it looks for the surface. When it locks, the scan effect plays over the camera and the camera fades out as the virtual wall (and its sky or photo) fades in. "Find again" brings the camera back. With **Camera** as the background it simply stays. The tracker's own camera is kept playing even when hidden.
- **Size.** The groups are 2.2 times as wide as the surface (a sheet) by default, so moving the phone closer inspects tasks. Pinch (or the + and - buttons, the wheel) zooms about the middle of the screen; a drag on empty space slides the virtual world under the surface. Neither is saved yet.
- **Status.** A small icon at the bottom: a square with four dots at its corners while the surface is held; a dashed square with a question mark while it is not (tap it to use what the camera sees). Pins are small and faint.
- **Order of the drawing switch:** Wall, Virtual (the 3D room), 2D.

### Wall mode: following the camera more closely
- The view now follows the camera's reading closely instead of leaning on the gyroscope: each reading pulls the view toward it harder the further it is from where the view was (so a quick move does not lag and the virtual wall does not slide against the real one), with only a little smoothing; the gyro just fills the gaps between pictures and covers a moment without the surface.
- The lens is learned while you use it: when the surface is seen at a slant, its two axes must be square to each other, which fixes the focal length (`focalFromHomography`, tested). A running median moves the lens toward it. Setting the Camera angle slider by hand switches this off. A wrong lens was a likely reason pins did not sit on the points being followed.
- With **Camera** as the background in Wall mode the picture gets the same quieter look as the 3D view's camera (less colour and contrast, a soft blur, cream over it). Only the display is filtered; the tracker reads the unfiltered picture. While the surface is being found the picture is shown as it is.

### Finding out where Wall tracking goes wrong
Settings (Wall mode) has **Show tracking details**. It shows, top left: how many camera pictures arrive each second and how many are followed, the time each takes (and the worst of the last 90), how many points are held, how far the fit leaves the points from where it says they should be (px), how often the surface was lost, the lens, and how far the gyro and camera readings disagree. It also draws every followed point twice over the camera: a green square where the tracker saw it, an orange square where the scene draws that same point of the surface, joined by a line.
- Green on the real features but orange apart: the following is fine; the fault is in the pose (lens, smoothing, gyro blend, latency).
- Green sliding off the real features: the following itself is failing (too few or poor points, too much motion between pictures, a moving or non-flat scene).
- Few "followed/s" next to "camera/s", or "ms each" near the gap between pictures: the processing cannot keep up.
- Headless Chromium with a moving synthetic wall: about 8-10 ms a picture and a fit within 0.3 px, with green and orange squares together. Phones are several times slower, so real numbers are needed from a phone.
Corner picking is now spread over the picture (up to 5 per 24 px patch, a low relative bar), so one very strong corner (the edge of a bright sheet) no longer leaves only a few points to follow.

### Wall mode: how a new surface is framed, and what sticks to what
- **No more skewed starts.** A newly found region (a sheet, or the middle of a wall) used to be taken as a rectangle seen with whatever perspective the corners showed; when the region was not really a rectangle, or the lens guess was off, the whole wall started out skewed until you tapped Find again. The surface is now *declared* (`surfaceFrame`, `wall/vision/plane.ts`): as wide as the region on screen, centred on it, facing the camera square-on, or standing upright and facing the way the phone points when the motion sensors are on. The followed points still stick to the real features, because they are tied to the picture; only the starting frame changed. (The HUD's "gyro vs camera 0.0" means no sensor was in use: with Motion off the surface faces the camera at the start.)
- **Tasks stick with the dots.** The real surface used to be placed 0.9 units behind the groups, which let them slide against the pins when the phone moved sideways. It is now 0.12, so the groups and the pins move together.
- Smoothing is a little stronger when the view is steady (the camera still wins in a quick move).

### Wall mode: the scene is drawn from the surface's picture, not from a pose
The first version worked out a camera position and turn from the followed surface and drew the world from that, blended with the gyro. Any error in that (the lens guess, the smoothing, the gyro blend, the depth) showed as the groups not sitting on the followed points, and with the gyro off it was far worse. Now the 3D camera is built straight from the surface's picture (`planeColumns`, `SpatialScene.wallMatrix` and `applyWallCamera`): anything on the surface is drawn through the very homography the tracker followed, so it sits exactly on the followed points and grows and shrinks as you move toward and away from the surface. Only the small step off the surface (cards stand a little in front of their group) uses the pose. Between pictures the gyro only supplies the *change* in the phone's turn since the last picture (`turnHomography`), which is applied to the surface's picture at once; with no gyro, the last picture is used as it is. The lens is learned more slowly and within 25% either way, since the turn from the gyro depends on it.

### Wall mode: the bug that made every follow lag (and how it was found)
A moving synthetic wall (a textured picture panned by a known amount, with the whole app running) showed the scene's surface centre staying put while the picture moved: median error 145 px against a 159 px swing. Cause: each camera picture was converted *into the previous picture's buffer*, and the tracker's pyramid used that buffer as its finest level, so after the next picture was written the "previous" picture was identical to the new one at full size; only the coarser levels still held the old picture. The followed points therefore got a coarse, jittery estimate of the motion and nothing to refine it against. Fixed in two places (a new buffer per picture, and the tracker keeps its own copy, with a test that reuses one buffer). The same test now has a median error of about 10 px with the headless browser delivering only 5 pictures a second, and the followed points and the drawn ones agree.
Also changed: the gyro is read raw (the 3D look-around's smoothed reading lagged and advanced every time it was read), and asked for "as it was" about 45 ms ago (`VIDEO_LAG`), the delay between a picture being taken and the code getting it; the camera is followed at up to 30 pictures a second instead of 15.

### Wall mode: steadier, less skew; carried cards stay flat
- **Perspective is believed only when the points insist.** A full homography has two perspective numbers that wobble with the noise in the points and make the surface look skewed. Each picture is now fitted twice, with the full homography and with a plain affine map (no perspective); the plain one is used unless the full one fits the inlier points better by more than 0.22 px (`PERSPECTIVE_MARGIN`).
- **Smoothing slider** (Wall settings, default 0.6): how much the corners of the surface are averaged over time. Still hands are steady, a real move is followed at once.
- **Carried cards** lift 0.4 units toward the viewer and stay flat to the screen, whatever they were lying on (the cylinder in the Virtual view, the wall in Wall mode); they used to turn to follow the cylinder, which tilted them toward the edges.

### Wall mode with the sensors on: the gyro turns, the picture moves you
Where the phone has motion sensors, Wall mode is gyro-led: the camera's turn comes from the gyroscope (anchored to the surface's frame at the moment it was found), and the camera pictures only say where the phone is, given that turn (`translationFromRotation`, `wall/vision/pose.ts`: with the turn known, each followed point gives two linear equations for the camera's position, solved by least squares with the worst quarter dropped a few times). So nearer, farther and sideways come from the picture, and everything else is as steady as the gyro. The picture also nudges the turn a little each time (`off`, 3% a picture, more when the two disagree by several degrees) so gyro drift is corrected slowly. Without sensors (or before the first position) it uses the surface's own picture as before.
Checked with the running app, a moving synthetic wall and synthetic gyro events (needs `DeviceOrientationEvent.requestPermission` stubbed in headless Chromium): median error of the surface's centre 4 px against a 159 px swing, against about 10 px picture-only; with the gyro turned the wrong way it is 7 px (the picture corrects it).
The **Smoothing** slider's range moved: its old top (the setting that worked best) is now its bottom, and there is more steadiness above it (default 0.15).

### Wall mode: Frame all and Level
Two more buttons next to the tracking button (lower left):
- **Frame all** (corner brackets): picks the zoom at which every group fits the screen at the distance the phone is at now, and centres them. Pinch, drag and the zoom buttons still work from there.
- **Level and straight on** (bubble level): the groups live on a *virtual* wall that can be turned from the tracked surface. This turns it so it faces the camera exactly and stands level (its normal is the camera's own back axis; its up is the gravity direction across that, from the gyro; without the gyro it just faces the camera). Only the groups turn: the tracked surface, the pins and the tracking are untouched (the pins are drawn through the inverse of the turn so they stay on the real wall). Looking for the surface again clears it. `levelFrame` in `wall/vision/plane.ts` (tested) and `WallRig.wallMatrix` (the turn is folded into the world -> screen matrix).

### Loose cards: anything in no group is "unsorted, anywhere on the wall"
- A card let go in open space is **left there and taken out of its group** (`onRetag(id, 'none')`, so it shows in Unsorted in every other view). Dropping it onto a group joins that group as before.
- The Space view has **no Unsorted box**: tasks in no group are loose cards (`LOOSE`, `ensureLayout`). Any that have no place yet (new ones, or ones untagged elsewhere) are put in a tray of free spots under the groups, left to right, wrapping, skipping taken spots; a card with a place keeps it. Loose cards are included in Frame all and in the wall's size.
- Fixed: in Wall mode a card let go in open space was stored with an angle worked out for the cylinder (not the flat wall), so it ended up thousands of places away and "disappeared". The drop now uses the layout's own radius, and the card is no longer hidden when its (non-existent) group is.

### The wall module (`src/spatial/wall/`)
Wall mode lives in its own folder, and `SpatialScene` only talks to it through two small seams:
- `WallTracking.ts`: follows a surface in the camera pictures and answers `getSurface()` (the surface's picture right now, gyro-led where there is a gyro), `levelNow()`, `anchorHere()`, `recenter()` and `diagnostics()`. No Three.js and no scene knowledge.
- `TrackingCamera.ts`: the camera it watches (hidden, or shown as the background).
- `WallRig.ts`: the scene's side: builds the 3D camera from the surface's picture, the scan effect, pins, the virtual room, zoom, drag, Frame all and Level. `SpatialScene` hands it a `WallHost` (the Three scene, the view, the camera, and a few questions: the background, the world box of everything on the wall, how much of the room is revealed) and calls `fit()` when the layout changes and `update()` every frame.
- `vision/`: the pure image maths (corners, optical flow, homographies, rectangle finding, the surface tracker, pose from a known turn) and its tests.
The old approach (a camera pose worked out from the surface and blended with the gyro, then drawn from) is gone: the scene is drawn from the surface's own picture.

### Tap to add on the wall
A tap on empty space (Wall, Virtual and 2D) opens the new-item box; what is made is left at that spot in no group (a loose card), via `addLoose` (`actions.ts`) and the new `onMade` callback of `openCompose`, which says the new item's id once it is made (nothing happens if the box is closed without one).

### Names, sorting and Frame all
- The view is called **Spatial** in the app (its menu entry; the notes and code still say "Space" in places).
- **Frame all** (Wall) now lays the groups out again for the shape of the screen, then brings them into view: `arrangeFor` (`layout.ts`) makes the family-tree layout with several widths for its bands and keeps the one whose overall shape is closest to the screen's (tall for portrait, wide for landscape); cards keep their places in their groups, and loose cards a group now sits on go back to the tray.
- **List: sort by Group** follows the sidebar's order of groups (parents before children), no group last, by priority within a group (`groupOrder`, `sortTasks(..., folders)`).
- **List: swipe right** checks an item off, with a line drawn across its name (and drawn off again for a done one); swipe left still deletes.
- **Copy and paste:** user-select used to be switched off on html, body and #root, which on iPhone left text selected in a note without anything reaching the clipboard. It is now off on the views, controls and canvases only (`index.css`); text boxes and notes sit under nothing that switches selection off.
