// src/hooks/useUndoRedo.ts
// Undo / redo history for an editable draft (book chapter, lesson, ...).
// Rapid edits (typing) are coalesced into one step so Undo moves back by a
// "burst" of typing rather than one character at a time.
import { useCallback, useRef, useState } from "react";

const COALESCE_MS = 700;
const MAX_HISTORY = 100;

export interface UndoRedo<T> {
  value: T;
  /** Set a new value (pass a function to derive it from the current one). */
  set: (next: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** True when the current value differs from the last saved/baseline value. */
  isDirty: boolean;
  /** Mark the current value as saved (clears the dirty flag, keeps history). */
  markSaved: () => void;
  /** Replace the value and wipe history (e.g. when opening a different item). */
  reset: (next: T) => void;
}

export function useUndoRedo<T>(initial: T): UndoRedo<T> {
  const [state, setState] = useState(() => ({
    past: [] as T[],
    present: initial,
    future: [] as T[],
    saved: initial,
  }));
  const lastChange = useRef(0);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setState((s) => {
      const value = typeof next === "function" ? (next as (p: T) => T)(s.present) : next;
      if (Object.is(value, s.present)) return s;
      const now = Date.now();
      const coalesce = now - lastChange.current < COALESCE_MS && s.past.length > 0 && s.future.length === 0;
      lastChange.current = now;
      const past = coalesce ? s.past : [...s.past, s.present].slice(-MAX_HISTORY);
      return { ...s, past, present: value, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    lastChange.current = 0;
    setState((s) => {
      if (s.past.length === 0) return s;
      const previous = s.past[s.past.length - 1];
      return { ...s, past: s.past.slice(0, -1), present: previous, future: [s.present, ...s.future] };
    });
  }, []);

  const redo = useCallback(() => {
    lastChange.current = 0;
    setState((s) => {
      if (s.future.length === 0) return s;
      const [next, ...rest] = s.future;
      return { ...s, past: [...s.past, s.present], present: next, future: rest };
    });
  }, []);

  const markSaved = useCallback(() => setState((s) => ({ ...s, saved: s.present })), []);

  const reset = useCallback((next: T) => {
    lastChange.current = 0;
    setState({ past: [], present: next, future: [], saved: next });
  }, []);

  return {
    value: state.present,
    set,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    isDirty: JSON.stringify(state.present) !== JSON.stringify(state.saved),
    markSaved,
    reset,
  };
}
