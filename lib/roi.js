// lib/roi.js
// Cohort-aware ROI/COI model with per-function cost drivers.
// All numbers are annualized, conservative by default, and fully overrideable via the UI.

const round = (n)=> Math.round(Number(n)||0);
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));

// Defaults are “safe conservative” and easy to explain on an exec call.
// They were chosen considering public benchmarks (ITIC/HDI/Gartner/etc.).
export const defaultAssumptions = {
  // General
  fullyLoadedHourly: 90,           // $/hour per person (salary + benefits)
  nonApplicableTrainingPct: 0.35,  // share of training time that doesn’t apply
  trainingHoursPerPerson: 24,      // hours/year per person
  grossMargin: 0.70,               // contribution margin on revenue impact
  delayFactor: 0.25,               // % of annual upside lost by waiting 1 quarter

  // Program cost model
  programCostFixed: 2000,          // $ fixed (setup/content/orchestration)
  programCostPerUser: 60 * 12,     // $/user/year (license + ops)

  // SALES inputs
  sales: {
    avgDealSize: 50000,            // $
    dealsPerRepPerYear: 20,
  },

  // CS inputs
  cs: {
    ticketsPerPersonPerMonth: 120, // support or CS ops load (adjust)
    avgDaysOpen: 2.5,              // average days open per ticket
    costPerTicketOpenDay: 25,      // $ per ticket per open day (HDI/Gartner ranges)
    accountsPerCSM: 25,
    arrPerAccount: 20000
  },

  // PRODUCTION (Engineering) inputs
  prod: {
    engCostPerDay: 800,            // $ per engineer-day saved
    // downtime economics (ITIC)
    costPerHourDowntime: 300000,   // $
    downtimeHoursAnnual: 8,        // baseline annual downtime hours (preventable slice handled below)
    preventableShare: 0.30,        // fraction of downtime we can realistically influence
    daysSavedPerLift: 40,          // team-days saved per +1.0 total skill lift across the 5 skills
    downtimeAvoidanceFactor: 0.50  // share of preventable downtime avoided at +1.0 lift
  }
};

// Merge user overrides with defaults
export function normalizeAssumptions(overrides = {}) {
  const deep = (t,s)=>(Object.keys(s||{}).forEach(k=>{
    if (s[k] && typeof s[k]==="object" && !Array.isArray(s[k])) t[k]=deep({...t[k]},s[k]);
    else t[k]=s[k];
  }), t);
  return deep(JSON.parse(JSON.stringify(defaultAssumptions)), overrides || {});
}

// Main calculator
export function computeROI({
  mode,
  recos = [],
  teamSize = 1,
  assumptions = {}
} = {}) {
  const a = normalizeAssumptions(assumptions);

  // 1) Expected KPI lift from recommended actions
  const totalKpiLift = Number(
    (recos.reduce((sum, r) => sum + (Number(r.expectedKpiLift)||0), 0)).toFixed(2)
  );

  // 2) Upside (annualized) — revenue or efficiency depending on function
  let upsideAnnual = 0;

  if (mode === "Sales") {
    const baselineVol = a.sales.dealsPerRepPerYear * a.sales.avgDealSize * teamSize * a.grossMargin;
    upsideAnnual = totalKpiLift * baselineVol;
  }
  else if (mode === "CS") {
    // Revenue lens (NRR/GRR uplift)
    const baselineARR = a.cs.accountsPerCSM * a.cs.arrPerAccount * teamSize * a.grossMargin;
    const arrUpside = totalKpiLift * baselineARR;

    // Efficiency lens (ticket handling) — time=money, modeled as cost avoided
    const yearlyTickets = a.cs.ticketsPerPersonPerMonth * 12 * teamSize;
    const ticketCost = yearlyTickets * a.cs.avgDaysOpen * a.cs.costPerTicketOpenDay;
    // Assume each +1.0 lift reduces avgDaysOpen by 20% (conservative) → cost avoided
    const ticketSavings = ticketCost * Math.min(1, 0.20 * totalKpiLift);

    upsideAnnual = arrUpside + ticketSavings;
  }
  else { // Production
    // Cycle-time savings → engineer-days saved
    const daysSaved = totalKpiLift * a.prod.daysSavedPerLift;
    const flowSavings = daysSaved * a.prod.engCostPerDay;

    // Downtime avoidance (preventable share)
    const preventable = a.prod.downtimeHoursAnnual * a.prod.preventableShare;
    const avoidedHours = preventable * Math.min(1, a.prod.downtimeAvoidanceFactor * totalKpiLift);
    const downtimeSavings = avoidedHours * a.prod.costPerHourDowntime;

    upsideAnnual = flowSavings + downtimeSavings;
  }

  // 3) COI — what you lose if you do nothing (status quo)
  // Training waste is general
  const coiTrainingWaste = teamSize * a.trainingHoursPerPerson * a.fullyLoadedHourly * a.nonApplicableTrainingPct;

  let functionCOI = 0;
  if (mode === "CS") {
    // Cost of tickets left open with today’s operating model
    const yearlyTickets = a.cs.ticketsPerPersonPerMonth * 12 * teamSize;
    functionCOI += yearlyTickets * a.cs.avgDaysOpen * a.cs.costPerTicketOpenDay;
  } else if (mode === "Production") {
    // Cost of downtime expected anyway (we’ll count preventable slice in delay)
    functionCOI += a.prod.downtimeHoursAnnual * a.prod.costPerHourDowntime * 0.10; // conservative slice counted as ongoing drag
  }
  // Sales function COI sits mostly in delay (pipeline opportunity cost)

  // Delayed action cost (lost upside for a quarter)
  const coiDelay = upsideAnnual * a.delayFactor;

  const coiAnnual = round(coiTrainingWaste + functionCOI + coiDelay);

  // 4) Program cost (fixed + per-user, OR from recos if provided)
  const recosCost = recos.reduce((s,r)=> s + (Number(r.estCost)||0), 0);
  const programCost = recosCost > 0
    ? recosCost
    : (a.programCostFixed + a.programCostPerUser * teamSize);

  // 5) Net, Payback, ROI%
  const netAnnual = round(upsideAnnual - coiAnnual);
  const paybackMonths = clamp(programCost > 0 ? (programCost / (upsideAnnual/12 || 1)) : 0.5, 0.5, 36);
  const roiPercent = round(((upsideAnnual - programCost) / (programCost || 1)) * 100);

  return {
    totalKpiLift,
    upsideAnnual: round(upsideAnnual),
    coiAnnual,
    netAnnual,
    programCost: round(programCost),
    paybackMonths: Number(paybackMonths.toFixed(1)),
    roiPercent
  };
}
