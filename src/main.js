import './styles.css';

// Phase 0 scope: permission-gate shell only. Camera, tracking, and rendering
// modules are implemented in later phases per BOXING_GLASS_HANDOFF.md.
const app = document.querySelector('#app');

function renderPermissionGate() {
  app.innerHTML = `
    <section class="gate" aria-labelledby="gate-title">
      <p class="eyebrow">Break Through</p>
      <h1 id="gate-title">Step up to the glass</h1>
      <p>
        Make a fist and punch toward the camera. Each hit will spread the
        cracks until the wall gives way.
      </p>
      <p class="privacy-note">
        Your camera stays on this device. Nothing is uploaded, saved, or
        analyzed remotely. No microphone access is requested.
      </p>
      <button type="button" id="enter-button">Enter the ring</button>
    </section>
  `;

  document.querySelector('#enter-button').addEventListener('click', renderPhasePlaceholder);
}

function renderPhasePlaceholder() {
  app.innerHTML = `
    <section class="gate" aria-labelledby="placeholder-title">
      <p class="eyebrow">Coming next</p>
      <h1 id="placeholder-title">Camera session</h1>
      <p>
        The mirrored webcam, hand tracking, and glass wall are implemented in
        Phase 1 and beyond. This build verifies the clean-room scaffold and
        permission gate only.
      </p>
      <button type="button" id="back-button">Back</button>
    </section>
  `;

  document.querySelector('#back-button').addEventListener('click', renderPermissionGate);
}

renderPermissionGate();
