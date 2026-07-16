import { defineConfig } from 'vite';

/**
 * Production Content-Security-Policy (Phase 9). Everything is self-hosted
 * except the MediaPipe runtime: the WASM bundle comes from jsDelivr and the
 * hand-landmark model from Google Cloud Storage (recorded in
 * THIRD_PARTY_NOTICES.md). connect-src is the complete list of hosts the
 * app may contact — no analytics, no capture endpoints, nothing else.
 *
 * - 'wasm-unsafe-eval' is required for WebAssembly compilation under CSP.
 * - blob: worker-src covers MediaPipe's internal worker usage.
 * - Injected only into the built index.html; the dev server needs
 *   websockets and inline HMR helpers, so dev stays CSP-free.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com",
  "worker-src 'self' blob:",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join('; ');

function injectCspPlugin() {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  // GitHub Pages serves from /<repo-name>/; local preview and other hosts
  // use the root. Set BASE_PATH in the deploy workflow.
  base: process.env.BASE_PATH ?? '/',
  plugins: [injectCspPlugin()],
});
