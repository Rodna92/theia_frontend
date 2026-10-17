import { useSyncExternalStore } from 'react';

// In-memory, unsaved edits to vision_params.yaml, keyed by file path then `<node>/<param>`.
// Lives at module level so edits survive navigating away from the screen and back; it is
// cleared on a full page reload. Persisting to disk is a later step (see getPendingEdits).

export type ParamEdits = Record<string, unknown>;

let state: Record<string, ParamEdits> = {};
const listeners = new Set<() => void>();
const EMPTY: ParamEdits = {};

const emit = () => listeners.forEach((l) => l());

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const editKey = (node: string, param: string) => `${node}/${param}`;

// Records `value` for a parameter; setting it back to the file's value drops the edit.
export function setParamEdit(file: string, key: string, value: unknown, original: unknown) {
  const { [key]: _drop, ...rest } = state[file] ?? {};
  state = { ...state, [file]: value === original ? rest : { ...rest, [key]: value } };
  emit();
}

export function discardParamEdits(file: string) {
  const { [file]: _drop, ...rest } = state;
  state = rest;
  emit();
}

export const getPendingEdits = (file: string): ParamEdits => state[file] ?? EMPTY;

export function useParamEdits(file: string | undefined): ParamEdits {
  return useSyncExternalStore(
    subscribe,
    () => (file ? getPendingEdits(file) : EMPTY),
    () => EMPTY,
  );
}
