# Manual QA Checklist — Break Through

Run this checklist before any release. The authoritative scenario list is
`BOXING_GLASS_HANDOFF.md` section 17; this file adds environment coverage
and a place to record results. All camera scenarios require a real webcam
and cannot be automated.

## Environment matrix

| Environment      | Version tested | Full loop passes | Notes          |
| ---------------- | -------------- | ---------------- | -------------- |
| Chrome (macOS)   |                | ☐                | primary target |
| Chrome (Windows) |                | ☐                |                |
| Edge (Windows)   |                | ☐                |                |
| Safari (macOS)   |                | ☐                |                |

"Full loop" = grant camera → calibrate → punch to break → shards →
clear view → message → rebuild → repeat twice.

## Punch detection (webcam required)

- [ ] Stationary closed fist does not repeatedly trigger.
- [ ] Slow fist movement toward camera does not trigger.
- [ ] Fast jab triggers once.
- [ ] Fast cross toward the camera triggers once.
- [ ] Lateral hook/cross-frame punch triggers once.
- [ ] Ordinary lateral guard adjustment does not trigger.
- [ ] Retract-and-jab sequence registers separate punches.
- [ ] Open-hand wave does not trigger.
- [ ] Adjusting hair/face does not trigger.
- [ ] Two fists in frame do not produce duplicate hits from one punch.
- [ ] Hand briefly leaving frame does not corrupt state.
- [ ] ~8/10 deliberate punches register; ≤1 false positive in 30 s of
      guard movement (Phase 3 acceptance).

## Calibration

- [ ] Calibration overlay appears after camera start; fist hold completes it.
- [ ] Losing the fist mid-hold restarts with a status message.
- [ ] Skip exits to READY; play works uncalibrated.
- [ ] Recalibrate button / C re-enter calibration.
- [ ] Hooks still register after calibration (travel scaling not too strict).

## Visual behavior

- [ ] Impact location matches fist location after mirroring.
- [ ] Cracks readable over bright and dark camera backgrounds.
- [ ] Cracks do not regenerate differently each frame.
- [ ] Damage persists until shatter; persists across window resize.
- [ ] Crack progression understandable without a meter or counter.
- [ ] Glass stays transparent enough to see the webcam.
- [ ] Virtual gloves toggle without changing detection behavior; gloves
      track fists without heavy jitter or punch lag.
- [ ] Shards fall below viewport and are removed.
- [ ] Webcam fully unobstructed during clear view.
- [ ] Reset message appears near the end of the clear-view interval.
- [ ] Glass returns after 5–7 seconds; loop repeats indefinitely.
- [ ] Fullscreen and window-resize keep rendering correct.
- [ ] `prefers-reduced-motion`: reduced shake/particles/shards, no sheen.

## Permissions / privacy

- [ ] Only camera permission is requested (never microphone).
- [ ] Denied permission shows the recovery screen; Try again works.
- [ ] DevTools network tab shows requests ONLY to the app origin,
      `cdn.jsdelivr.net` (MediaPipe WASM), and `storage.googleapis.com`
      (hand model). Nothing else, ever.
- [ ] No images or derived captures are transmitted or stored.
- [ ] sessionStorage holds only the gloves flag and three calibration
      numbers.
- [ ] Camera indicator light turns off when the tab closes.

## Audio

- [ ] Impact sounds vary between hits; volume scales with punch strength.
- [ ] Shatter sound plays on break.
- [ ] Mute toggles and persists for the session view.
- [ ] No sound before the start gesture (autoplay compliance).
