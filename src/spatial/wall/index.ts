// Wall mode: the groups hang on a flat surface (a wall, a sheet, a frame) that the camera finds and follows, and the phone is a window onto it.
//   WallTracking    follows a surface in the camera pictures, with the gyro (vision/ holds the pure image maths)
//   TrackingCamera  the camera it watches (hidden, or shown as the background)
//   WallRig         the scene's side of it: the world -> screen map, the scan effect, the pins, the virtual room, zoom, drag, level
export { WallTracking, VIDEO_LAG, type WallPhase, type WallOverlay } from './WallTracking'
export { TrackingCamera, type CameraShow } from './TrackingCamera'
export { WallRig, WALL_LIFT, type WallHost } from './WallRig'
