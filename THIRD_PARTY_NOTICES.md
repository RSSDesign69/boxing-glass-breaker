# Third-Party Notices

Record every external dependency and asset used by this project before deployment.

## Software dependencies

| Package                 | Version | License    | Role                                       |
| ----------------------- | ------- | ---------- | ------------------------------------------ |
| @mediapipe/tasks-vision | 0.10.35 | Apache-2.0 | On-device hand landmark detection          |
| vite                    | 7.3.6   | MIT        | Build tool and dev server (dev dependency) |
| vitest                  | 3.2.7   | MIT        | Unit test runner (dev dependency)          |

MediaPipe Tasks Vision loads its WASM runtime and hand landmark model files
from Google-hosted CDNs at runtime unless they are self-hosted. Record the
final asset URLs (or self-hosted paths) here when hand tracking is
implemented.

## Assets

Use only self-created or properly licensed audio, fonts, textures, icons, and
images. Record the creator, source, license, and any required attribution
here. No third-party assets are bundled yet.
