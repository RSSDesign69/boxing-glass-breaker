/**
 * Tests for the explicit application state machine.
 */
import { describe, it, expect } from 'vitest';
import { AppState, createAppStateMachine } from '../src/appState.js';

describe('createAppStateMachine', () => {
  it('walks the full interaction loop through valid edges', () => {
    const machine = createAppStateMachine();
    expect(machine.state).toBe(AppState.PERMISSION_GATE);
    for (const next of [
      AppState.CALIBRATING,
      AppState.READY,
      AppState.DAMAGING,
      AppState.BREAKING,
      AppState.CLEAR_VIEW,
      AppState.REBUILDING,
      AppState.READY,
    ]) {
      machine.transition(next);
      expect(machine.state).toBe(next);
    }
  });

  it('supports user-triggered recalibration from READY', () => {
    const machine = createAppStateMachine(AppState.READY);
    machine.transition(AppState.CALIBRATING);
    machine.transition(AppState.READY);
    expect(machine.state).toBe(AppState.READY);
  });

  it('rejects invalid transitions', () => {
    const machine = createAppStateMachine();
    expect(() => machine.transition(AppState.BREAKING)).toThrow(
      /Invalid app-state transition/,
    );
    expect(machine.state).toBe(AppState.PERMISSION_GATE);
  });

  it('notifies listeners with next and previous states', () => {
    const machine = createAppStateMachine();
    const seen = [];
    const unsubscribe = machine.onChange((next, prev) => {
      seen.push([next, prev]);
    });
    machine.transition(AppState.CALIBRATING);
    unsubscribe();
    machine.transition(AppState.READY);
    expect(seen).toEqual([[AppState.CALIBRATING, AppState.PERMISSION_GATE]]);
  });

  it('reports membership via is()', () => {
    const machine = createAppStateMachine(AppState.READY);
    expect(machine.is(AppState.READY, AppState.DAMAGING)).toBe(true);
    expect(machine.is(AppState.BREAKING)).toBe(false);
  });
});
