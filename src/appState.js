/**
 * Single explicit application state machine. All phase logic keys off this;
 * avoid scattered booleans. CALIBRATING is currently a pass-through and gains
 * a real measurement flow in Phase 8.
 */
export const AppState = Object.freeze({
  PERMISSION_GATE: 'PERMISSION_GATE',
  CALIBRATING: 'CALIBRATING',
  READY: 'READY',
  DAMAGING: 'DAMAGING',
  BREAKING: 'BREAKING',
  CLEAR_VIEW: 'CLEAR_VIEW',
  REBUILDING: 'REBUILDING',
  CAMERA_ERROR: 'CAMERA_ERROR',
});

const TRANSITIONS = {
  [AppState.PERMISSION_GATE]: [AppState.CALIBRATING, AppState.CAMERA_ERROR],
  [AppState.CALIBRATING]: [AppState.READY, AppState.CAMERA_ERROR],
  [AppState.READY]: [
    AppState.DAMAGING,
    AppState.BREAKING,
    AppState.CALIBRATING, // user-triggered recalibration
    AppState.CAMERA_ERROR,
  ],
  [AppState.DAMAGING]: [
    AppState.BREAKING,
    AppState.READY,
    AppState.CAMERA_ERROR,
  ],
  [AppState.BREAKING]: [AppState.CLEAR_VIEW],
  [AppState.CLEAR_VIEW]: [AppState.REBUILDING],
  [AppState.REBUILDING]: [AppState.READY],
  [AppState.CAMERA_ERROR]: [AppState.PERMISSION_GATE],
};

export function createAppStateMachine(initialState = AppState.PERMISSION_GATE) {
  let current = initialState;
  const listeners = new Set();

  return {
    get state() {
      return current;
    },
    is(...states) {
      return states.includes(current);
    },
    transition(next) {
      if (!TRANSITIONS[current]?.includes(next)) {
        throw new Error(`Invalid app-state transition: ${current} -> ${next}`);
      }
      const previous = current;
      current = next;
      for (const listener of listeners) listener(next, previous);
      return current;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
