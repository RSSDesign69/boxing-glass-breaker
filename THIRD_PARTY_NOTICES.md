# Third-Party Notices

Record every external dependency and asset used by this project before deployment.

## Software dependencies

| Package                 | Version | License    | Role                                       |
| ----------------------- | ------- | ---------- | ------------------------------------------ |
| @mediapipe/tasks-vision | 0.10.35 | Apache-2.0 | On-device hand landmark detection          |
| vite                    | 7.3.6   | MIT        | Build tool and dev server (dev dependency) |
| vitest                  | 3.2.7   | MIT        | Unit test runner (dev dependency)          |

MediaPipe Tasks Vision loads two runtime assets from external CDNs (the
only non-self hosts the app ever contacts; both are allowlisted in the
production Content-Security-Policy and configured in `src/config.js`):

- WASM runtime: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm`
  (Apache-2.0, part of the package above)
- Hand landmark model: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`
  (Apache-2.0, Google MediaPipe models)

Consider self-hosting both for production reliability and stricter privacy
messaging; if you do, update `src/config.js`, the CSP in `vite.config.js`,
and this file.

## Assets

Use only self-created or properly licensed audio, fonts, textures, icons, and
images. Record the creator, source, license, and any required attribution
here. No third-party assets are bundled yet.
