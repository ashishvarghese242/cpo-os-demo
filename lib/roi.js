// lib/roi.js
// Executive-friendly ROI/COI calculator for the demo.
// All numbers are annualized and use conservative defaults you can tune below.

const round = (n)=> Math.round(Number(n)||0);
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));

export function computeROI({
  mode,
  recos,
  // ===== Demo assumptions (editable) =====
  teamSize = 10,                  // people affected by the program
  fullyLoadedHourly = 90,         // $/hour per person
  nonApplicableTrainingPct = 0.35,// fraction of training time wasted today
  trainingHoursPerPerson = 24,    // hours/year per person spent in training
  avgDealSize = 50000,            // Sales only
  dealsPerRepPerYear = 20,        // Sales only
  grossMargin = 0.7,              // Sales & CS
  arrPerAccount = 20000,          // CS only
  accountsPerCSM = 25,            // CS only
  engCostPerDay = 800             // Production only (savings proxy)
} = {}){

  // --- 1) Expected KPI lift from chosen recommendations
  const totalKpiLift = recos.reduce((sum, r) => sum + (Number(r.expectedKpiLift)||0), 0); // ~0..3
  const programCost = recos.reduce((sum, r) => sum + (Number(r.estCost)||0), 0);          // $ direct cost

  // --- 2) Annualized upside (by mode)
  let upsideAnnual = 0;
  if (mode === "Sales"){
    // proxy: lift% × (deals/year × avg deal) × team × margin
    const baselineVol = dealsPerRepPerYear * avgDealSize * teamSize * grossMargin;
    upsideAnnual = totalKpiLift * baselineVol; // totalKpiLift is used as "lift %", demo math
  } else if (mode === "CS"){
    // proxy: lift% × (accounts × ARR/account) × team × margin
    const baselineARR = accountsPerCSM * arrPerAccount * teamSize * grossMargin;
    upsideAnnual = totalKpiLift * baselineARR;
  } else {
    // Production: savings proxy from cycle-time/incident reductions
    const daysSaved = totalKpiLift * 40; // assume 40 team-days saved per 1.0 lift across top skills
    upsideAnnual = daysSaved * engCostPerDay;
  }

  // --- 3) Status-Quo Cost (Annual COI) — what you lose if you do nothing
  const coiTrainingWaste = teamSize * trainingHoursPerPerson * fullyLoadedHourly * nonApplicableTrainingPct;
  const coiDelay = upsideAnnual * 0.25; // demo: assume 3 months of delayed action costs 25% of annual upside
  const coiAnnual = round(coiTrainingWaste + coiDelay);

  // --- 4) Net value, payback, ROI%
  const netAnnual = round(upsideAnnual - coiAnnual);
  const paybackMonths = clamp(programCost > 0 ? (programCost / (upsideAnnual/12)) : 0.5, 0.5, 24);
  const roiPercent = round(((upsideAnnual - programCost) / (programCost || 1)) * 100);

  return {
    totalKpiLift: Number(totalKpiLift.toFixed(2)),
    upsideAnnual: round(upsideAnnual),
    coiAnnual,
    netAnnual,
    programCost: round(programCost),
    paybackMonths: Number(paybackMonths.toFixed(1)),
    roiPercent
  };
}
