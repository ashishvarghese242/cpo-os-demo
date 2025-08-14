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
  return { labels, targets };
}
