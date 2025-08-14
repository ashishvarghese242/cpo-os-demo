// lib/compute.js
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededScores(count, seed = 42) {
  const r = mulberry32(seed);
  return Array.from({ length: count }, () => Math.floor(r() * 5) + 1); // 1..5
}

export function idealPersona(mode, skillsConfig) {
  const arr =
    mode === "Sales" ? skillsConfig.sales :
    mode === "CS" ? skillsConfig.cs :
    skillsConfig.prod;
  const labels = arr.map(s => s.label);
  const targets = arr.map(s => s.target);
  const ids = arr.map(s => s.id);
  return { labels, targets, ids };
}

// simple min-max normalize to 0..1
function minMax(arr) {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const span = max - min || 1;
  return arr.map(v => (v - min) / span);
}

// synthetic cohort generator (deterministic)
// returns [{ skills:[5], kpi:number }]
export function sampleCohort(mode, skillsConfig, seed = 7, n = 60) {
  const { ids } = idealPersona(mode, skillsConfig);
  const r = mulberry32(seed);
  const cohort = [];
  // hidden weights per mode (deterministic but different)
  const w = ids.map((_, i) => 0.6 + i * 0.1); // 0.6,0.7,0.8,0.9,1.0

  for (let i = 0; i < n; i++) {
    const skills = ids.map(() => Math.floor(r() * 5) + 1); // 1..5
    // KPI ~ weighted sum + small noise
    const kpiRaw = skills.reduce((acc, s, j) => acc + s * w[j], 0) + (r() - 0.5) * 2;
    cohort.push({ skills, kpi: kpiRaw });
  }
  // scale KPI to a friendly range per mode
  const kpis = cohort.map(c => c.kpi);
  const scaled = minMax(kpis).map(x => {
    if (mode === "Sales") return 10 + x * 40;      // WinRate % ~ 10..50
    if (mode === "CS") return 80 + x * 20;         // NRR/Retention % ~ 80..100
    return 0.5 + x * 1.5;                          // e.g., Deploy/day ~ 0.5..2.0
  });
  cohort.forEach((c, i) => c.kpi = scaled[i]);
  return cohort;
}

// current person's skills (synthetic for now)
export function skillScores(mode, skillsConfig, seed = 42) {
  const { labels } = idealPersona(mode, skillsConfig);
  return seededScores(labels.length, seed); // 1..5
}

export function performanceGaps(actual, targets, ids, labels) {
  return actual.map((a, i) => ({
    id: ids[i],
    label: labels[i],
    actual: a,
    target: targets[i],
    gap: Number((targets[i] - a).toFixed(2))
  })).sort((a, b) => b.gap - a.gap);
}
