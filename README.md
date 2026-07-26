# Break Through

A desktop-first browser interaction in which on-device hand tracking detects boxing punches that progressively crack and shatter a virtual glass barrier over a mirrored webcam feed.

## Clean-room notice

This repository is an original implementation. It contains no source code, assets, README text, or Git history from the Fog Mirror repository. That project may be acknowledged as visual inspiration, but it is not a code dependency and must not be imported into this project.

Read `BOXING_GLASS_HANDOFF.md` before beginning implementation.

## Privacy baseline

- Camera permission only
- No microphone access
- Webcam processing stays in the browser
- No image upload or persistent capture
- No analytics or remote logging in the MVP

## Local setup

```bash
npm install
npm run dev
```

Other scripts: `npm run build` (production build with CSP), `npm run preview`
(serve the build), `npm test`, `npm run lint`, `npm run format`.

## Controls

Punch with a fist (forward or lateral). Keyboard/mouse for development:
click/Space = simulated impact, B = force break, R = reset, D = debug HUD
with live tuning sliders, G = virtual gloves, C = recalibrate.

## Deployment

The app is static and must be served over HTTPS (camera requirement;
`localhost` works for development). Production hosting is **Netlify**,
connected to this repo: every push to `main` builds with `npm run build`
and publishes `dist/`. Any static host works the same way. Leave
`BASE_PATH` unset for root-domain hosting; set it only when serving from
a subpath.

The production build ships a Content-Security-Policy that allows exactly
these hosts: the app origin, `cdn.jsdelivr.net` (MediaPipe WASM),
`storage.googleapis.com` (hand-landmark model), and the two Google Fonts
hosts. There is no analytics, upload, or capture endpoint. See
`QA_CHECKLIST.md` for the release checklist.

## Git setup

Create a new repository under your own GitHub account and configure it as the only remote named `origin`. Do not add the Fog Mirror repository as a remote.
