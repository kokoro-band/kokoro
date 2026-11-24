# WebXR Support and Debugging

## Supported devices

| Status | Device / Browser | Notes |
|---|---|---|
| Verified | Meta Quest 3 / Meta Quest Browser | Tested against local dev server over `adb reverse` |
| Expected (unverified) | Meta Quest 2, 3S, Pro / PC VR (Windows Chrome, Edge + OpenXR) / Galaxy XR Chrome | Not yet tested on hardware |
| Unsupported | Apple Vision Pro Safari (no controllers), PICO Browser, Safari (iOS/macOS), Firefox | Use 2D/3D view |

## Requirements, controls, and limits

- Requires HTTPS or `localhost`, and immersive sessions must start inside a user click (the VR entry button). Meta Quest requires a configured Guardian boundary and both controllers (hand tracking is unsupported).
- **Locomotion:** Left stick moves along head direction; right stick left/right snap-turns 30 degrees; trigger teleports on floor or toggles doors.
- **Furniture manipulation:** Grip or trigger grabs furniture (follows ray at 0.6x floor distance, one item at a time; the holding hand cannot move or turn); holding-hand stick left/right rotates in 15-degree steps and stops on wall collision. Releasing commits one undoable save; exiting VR or disconnecting while holding restores the original pose.
- **Limits:** VR supports inspection, movement, and rotation only (no catalog, add/delete, or AI UI). Entering VR while focused on a single room starts in that room while allowing walking into and editing adjacent rooms (exiting restores the focused room in 3D). Doors narrower than 60cm cannot be walked through, and door open/closed state is not persisted. Stick axis mapping targets Meta Quest controllers.

## Local Quest debugging

Vite's default dev server can bind IPv6 only, which prevents `adb reverse` from connecting. Bind IPv4 explicitly:

```bash
cd frontend && vp dev --host 127.0.0.1
adb reverse tcp:5173 tcp:5173
```

1. Open `http://localhost:5173` in Meta Quest Browser (`localhost` is exempt from HTTPS).
2. Inspect Console and Network from desktop Chrome at `chrome://inspect/#devices`.
3. Without a headset, use the Immersive Web Emulator Chrome extension or PC VR (Quest Link / SteamVR) for quick checks.
