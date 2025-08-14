// lib/influence.js
// correlation helper
function corr(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.reduce((a,b)=>a+b,0)/n;
  const my = ys.reduce((a,b)=>a+b,0)/n;
  let num=0, dx=0, dy=0;
  for (let i=0;i<n;i++){
    const vx = xs[i]-mx, vy = ys[i]-my;
    num += vx*vy; dx += vx*vx; dy += vy*vy;
  }
  const den = Math.sqrt(dx*dy)||1;
  return num/den; // -1..1
}

// normalize absolute correlation to 0..5 for display
function toFive(absCorr) {
  const clamped = Math.max(0, Math.min(1, absCorr));
  return Math.round(clamped * 5 * 10) / 10; // 0.0..5.0
}

// cohortSamples: [{ skills:[5], kpi:number }]
export function influenceScores(skillLabels, cohortSamples) {
  const kpiArr = cohortSamples.map(c => c.kpi);
  const out = [];
  for (let i=0;i<skillLabels.length;i++){
    const skillArr = cohortSamples.map(c => c.skills[i]);
    const r = corr(skillArr, kpiArr);
    out.push({ index:i, label:skillLabels[i], rawCorr:r, score0to5: toFive(Math.abs(r)) });
  }
  return out;
}
