// app/state.js
const _listeners = new Set();

const _state = {
  mode: "Sales",            // Sales | CS | Production
  cohortType: "All",        // All | Region | Person
  cohortKey: "",            // "" | region name | person_id
  seed: 42
};

export function getState() { return { ..._state }; }
export function setState(patch) {
  Object.assign(_state, patch || {});
  _listeners.forEach(fn => { try { fn(getState()); } catch {} });
}
export function subscribe(fn) { _listeners.add(fn); return () => _listeners.delete(fn); }

// selectors
export const selectMode = () => _state.mode;
export const selectCohortType = () => _state.cohortType;
export const selectCohortKey = () => _state.cohortKey;
export const selectSeed = () => _state.seed;
