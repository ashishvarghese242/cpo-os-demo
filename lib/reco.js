// lib/reco.js
const CANNED = {
  Sales: {
    discovery: { title:"Discovery Micro‑Tour", expectedSkillLift:0.8, estCost:1500 },
    objections:{ title:"Objection Playbook Drill", expectedSkillLift:0.7, estCost:1200 },
    multi:     { title:"Multithreading Workflow", expectedSkillLift:0.6, estCost:900  },
    demo:      { title:"Demo Coverage Checklist", expectedSkillLift:0.6, estCost:800  },
    nextstep:  { title:"Next‑Step Script & CTA", expectedSkillLift:0.5, estCost:600  }
  },
  CS: {
    onboarding:{ title:"Onboarding Runbook", expectedSkillLift:0.7, estCost:1000 },
    activation:{ title:"Feature Activation Coach", expectedSkillLift:0.6, estCost:900 },
    triage:    { title:"Triage Macros", expectedSkillLift:0.5, estCost:700 },
    qbr:       { title:"QBR Cadence Pack", expectedSkillLift:0.5, estCost:700 },
    renewal:   { title:"Renewal Forecast Kit", expectedSkillLift:0.6, estCost:900 }
  },
  Production: {
    flow:     { title:"Smaller PRs Policy", expectedSkillLift:0.6, estCost:800 },
    review:   { title:"Review‑SLA Bot", expectedSkillLift:0.7, estCost:1000 },
    reliable: { title:"Pre‑merge Checklist", expectedSkillLift:0.6, estCost:900 },
    recovery: { title:"Incident Drill & Runbooks", expectedSkillLift:0.8, estCost:1200 },
    eff:      { title:"WIP Limits Coaching", expectedSkillLift:0.5, estCost:700 }
  }
};

export function rankRecommendations({ mode, gaps, influence }) {
  // influence by label → quick lookup
  const infByLabel = Object.fromEntries(influence.map(i => [i.label, i]));
  const rows = gaps.map(g => {
    const inf = infByLabel[g.label]?.score0to5 || 0;
    const priority = inf * Math.max(0, g.gap);
    const canned = (CANNED[mode] || {})[g.id] || { title:"Coaching Intervention", expectedSkillLift:0.5, estCost:800 };
    const expectedKpiLift = Math.round((canned.expectedSkillLift * (inf/5)) * 100) / 100; // simple demo math
    return {
      id: g.id, label: g.label, gap: g.gap, influence: inf, priority,
      title: canned.title, expectedSkillLift: canned.expectedSkillLift, estCost: canned.estCost,
      expectedKpiLift
    };
  }).sort((a,b)=> b.priority - a.priority);
  return rows.slice(0,3);
}
