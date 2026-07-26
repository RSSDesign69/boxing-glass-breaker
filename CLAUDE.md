# Break Through — agent guide

Camera-controlled boxing game: punches detected from webcam hand tracking
progressively crack and shatter a dirty gym-glass barrier. Clean-room
implementation — never import code or assets from the Fog Mirror project.

Read `BOXING_GLASS_HANDOFF.md` before making changes (canonical spec, task
list, session log — keep its log updated). `QA_CHECKLIST.md` is the manual
release checklist. All tuning constants live in `src/config.js`; never
scatter magic numbers.

Hard rules: camera permission only (never microphone), all frames processed
on-device, no uploads/analytics/persistence of imagery, no damage meters or
punch counters in production UI. The production CSP in `vite.config.js`
allowlists exactly: self, the two MediaPipe hosts, and Google Fonts —
update it and `THIRD_PARTY_NOTICES.md` together if a host ever changes.

Commands: `npm run dev`, `npm test`, `npm run lint`, `npm run format`,
`npm run build` (injects the CSP), `npm run preview`.

## Design system components

The visual identity is **Kinetic Brutalism** ("experimental combat
laboratory"). The authoritative reference is the Break Through Design
System v1.0 (Manrope edition); this section is the working summary. The
token layer lives at the top of `src/styles.css` — build every new
component from those custom properties, never raw hex values or arbitrary
pixel sizes.

### Core rules

1. **Tokens only.** Colors via `--color-*`, spacing via `--space-*`, type
   via the scale tokens, borders/shadows via `--border-*`/`--shadow-*`.
2. **Two typefaces with strict roles.** `--font-display` (Anybody, weight
   850–900, uppercase, tight tracking, line-height ≤ 0.95) is for short
   display objects only: headings, countdowns, status names, button
   labels, big metrics. `--font-body` (Manrope) is for instructions,
   explanations, settings, and anything longer than a phrase.
   `--font-mono` is for system metadata/log-style text. Never set body
   copy in Anybody.
3. **Safety orange (`--color-signal`, #ff3c00) means action, danger, or
   change** — primary actions, active/selected states, warnings, live
   impact values, focus rings, breach progress. If a screen is drowning
   in orange, it's wrong.
4. **Brutal geometry.** Square corners (`border-radius: 0`), hard black
   borders (2/4/8 px), offset shadows (`--shadow-md`, `--shadow-signal-md`
   etc.) with no blur. Panels = white background + `--border-strong` +
   offset shadow. Don't stack heavy shadows on every nested element.
5. **Pressables collapse.** Buttons/cards translate (≈6px, 6px) and drop
   their shadow on `:active`. Hover inverts colors (black↔orange/white).
   Never remove `:focus-visible` (4 px solid signal) without replacement.
6. **State is never color alone.** Pair color with a label, geometry,
   border, or value (see `.status-badge` pattern in the design system).
7. **Camera and glass are the hero.** During gameplay, UI lives at the
   perimeter as compact translucent chips (see `.hud-*`); keep the
   central strike zone clear. Setup/completion screens may be loud;
   gameplay chrome must be quiet.
8. **Lab voice for chrome, plain language for safety.** Buttons/status may
   use laboratory language (ENGAGE LAB, BREACH COMPLETE); camera
   permission, privacy, and safety copy stays plain Manrope prose.
9. **Motion is mechanical and physical** — short (80–400 ms), eased with
   `--ease-mechanical`, proportional to impact. No ambient animation that
   competes with punch feedback; everything respects
   `prefers-reduced-motion` (global guard exists in `styles.css`).
10. **Responsive, not fixed.** `clamp()` display type, fluid grids, no
    hard-coded 1280×960 layouts. Reduce shadow offsets before shrinking
    touch targets.

### Existing component recipes (reuse before inventing)

- **Lab canvas** (`.gate`): concrete background, exposed 2.5 rem grid via
  `::before`, heavy black frame via `::after`. Use for setup/terminal
  screens; the gameplay stage stays dark (`--color-ink`).
- **Eyebrow badge** (`.eyebrow`): black box, orange text + thin orange
  border + `--shadow-signal-sm`, `--tracking-system` uppercase micro text.
- **Display heading** (`h1`, `.reset-message`): Anybody 900, uppercase,
  tight leading, hard orange (and/or black) text-shadow offsets.
- **Warning note** (`.privacy-note`, `.device-notice`): translucent white
  panel, thin black border, heavy left border in signal (privacy/danger)
  or `--color-warning` (caution).
- **Primary button** (`button`): black bg, white Anybody label,
  `--border-strong`, `--shadow-signal-md`; hover → orange bg/black text;
  active → translate + shadow gone. **Secondary** (`button.secondary`):
  white bg, black text, black shadow, hover inverts to black.
- **HUD chip** (`.hud-note`, `.hud-instruction`, `.hud-button`):
  translucent black bg, 1–2 px `--color-border-inverse` border, mono or
  label-tracked uppercase micro text. Buttons get the orange hover invert.
- **Brutal panel / dialog** (`.calibration`): white bg, `--border-strong`,
  `--shadow-lg`, centered content; progress bars are black tracks with
  flat orange fill.
- **Maintenance surface** (`#debug-tuning`): ink background, graphite
  border, mono type, orange accents — the style for dev/diagnostic UI.

### For future additions

Style new features by composing the recipes above (e.g. a settings screen
= lab canvas + brutal panels + toggles/ranges from design-system §5.7–5.8;
a results screen = lab canvas + metric panels with huge Anybody values).
Hazard strips (45° orange/black repeating gradient) are reserved for
boundaries and dangerous actions, not decoration. Use semantic HTML first
(real buttons/inputs/progress elements), include hover/active/
focus-visible/disabled states, and never let overlays cover the player's
hands or the strike zone during play.
