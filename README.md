# Break Through

A desktop-first browser interaction in which on-device hand tracking detects boxing punches that progressively crack and shatter a virtual glass barrier over a mirrored webcam feed.

## Clean-room notice

This repository is an original implementation. It contains no source code, assets, README text, or Git history from Gauravi Linjara's Fog Mirror repository. That project may be acknowledged as visual inspiration, but it is not a code dependency and must not be imported into this project.

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

Use `npm run build` to verify a production build.

## Git setup

Create a new repository under your own GitHub account and configure it as the only remote named `origin`. Do not add the Fog Mirror repository as a remote.
