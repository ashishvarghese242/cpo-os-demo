// lib/roi.js
export function computeROI({
  mode,
  recos,
  avgDealSize = 50000,   // Sales default
  grossMargin = 0.7,
  repsAffected = 10,
  csAccountsAffected = 20,
  engCostPerDay = 800
}) {
  // Example baseline KPI delta from recos
  const totalKpiLift = recos.reduce((sum, r) => sum + r.expectedKpiLift, 0);

  let revenueImpact = 0;
  let costSavings = 0;
  let coiLoss = 0;

  if (mode === "Sales") {
    // revenue impact = lift% × affected deals × avg deal size × margin
    revenueImpact = totalKpiLift * repsAffected * avgDealSize * grossMargin;
    // non-applicable training cost (COI)
    coiLoss = recos.length * 1500 * 0.4; // 40% wasted time factor
  }
  else if (mode === "CS") {
    // retention impact = lift% × accounts × ARR/account × margin
    const arrPerAccount = 20000;
    revenueImpact = totalKpiLift * csAccountsAffected * arrPerAccount * grossMargin;
    coiLoss = recos.length * 1000 * 0.3;
  }
  else { // Production
    // cost savings from reduced cycle time
    costSavings = totalKpiLift * engCostPerDay * repsAffected;
    coiLoss = recos.length * 800 * 0.35;
  }

  return {
    totalKpiLift,
    revenueImpact: Math.round(revenueImpact),
    costSavings: Math.round(costSavings),
    coiLoss: Math.round(coiLoss),
    netImpact: Math.round(revenueImpact + costSavings - coiLoss)
  };
}
