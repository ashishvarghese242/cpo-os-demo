// app/state.js
const _listeners = new Set();

const _state = {
  mode: "Sales",
  cohort: "Team",
  selectedKpi: "WinRate",
  seed: 42
};

export function getState() {
  return { ..._state };
}

export function setState(patch) {
  Object.assign(_state, patch || {});
  _listeners.forEach(fn => {
    try { fn(getState()); } catch {}
  });
}

export function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// handy selectors
export const selectMode = () => _state.mode;
export const selectCohort = () => _state.cohort;
export const selectKpi = () => _state.selectedKpi;
export const selectSeed = () => _state.seed;
