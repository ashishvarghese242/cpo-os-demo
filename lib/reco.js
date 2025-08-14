// lib/reco.js
const CANNED = {
  Sales: {
    discovery: { title:"Discovery Micro‑Tour", expectedSkillLift:0.8, estCost:1500, want:"DSR" },
    objections:{ title:"Objection Playbook Drill", expectedSkillLift:0.7, estCost:1200, want:"Playbook" },
    multi:     { title:"Multithreading Workflow", expectedSkillLift:0.6, estCost:900,  want:"Playbook" },
    demo:      { title:"Demo Coverage Checklist", expectedSkillLift:0.6, estCost:800,  want:"DSR" },
    nextstep:  { title:"Next‑Step Script & CTA", expectedSkillLift:0.5, estCost:600,  want:"Script" }
  },
  CS: {
    onboarding:{ title:"Onboarding Runbook", expectedSkillLift:0.7, estCost:1000, want:"Runbook" },
    activation:{ title:"Feature Activation Coach", expectedSkillLift:0.6, estCost:900, want:"Guide" },
    triage:    { title:"Triage Macros", expectedSkillLift:0.5, estCost:700, want:"Macro" },
    qbr:       { title:"QBR Cadence Pack", expectedSkillLift:0.5, estCost:700, want:"Template" },
    renewal:   { title:"Renewal Forecast Kit", expectedSkillLift:0.6, estCost:900, want:"Forecast" }
  },
  Production: {
    flow:     { title:"Smaller PRs Policy", expectedSkillLift:0.6, estCost:800, want:"Policy" },
    review:   { title:"Review‑SLA Bot", expectedSkillLift:0.7, estCost:1000, want:"Bot" },
    reliable: { title:"Pre‑merge Checklist", expectedSkillLift:0.6, estCost:900, want:"Checklist" },
    recovery: { title:"Incident Drill & Runbooks", expectedSkillLift:0.8, estCost:1200, want:"Runbook" },
    eff:      { title:"WIP Limits Coaching", expectedSkillLift:0.5, estCost:700, want:"Guide" }
  }
};

function suggestAssets(mode, skillId, data){
  const want = (CANNED[mode]||{})[skillId]?.want;
  const cms = data?.cms || [];
  const hits = cms.filter(a => {
    if (want==="DSR") return !!a.dsr_flag;
    if (want==="Playbook") return a.asset_type?.toLowerCase().includes("playbook");
    if (!want) return false;
    return (String(a.asset_type||"").toLowerCase().includes(want.toLowerCase()));
  });
  return hits.slice(0,2).map(a => ({ asset_id:a.asset_id, type:a.asset_type, last_used_at:a.last_used_at }));
}

export function rankRecommendations({ mode, gaps, influence, data }) {
  const infByLabel = Object.fromEntries(influence.map(i => [i.label, i]));
  const rows = gaps.map(g => {
    const inf = infByLabel[g.label]?.score0to5 || 0;
    const priority = inf * Math.max(0, g.gap);
    const canned = (CANNED[mode] || {})[g.id] || { title:"Coaching Intervention", expectedSkillLift:0.5, estCost:800 };
    const expectedKpiLift = Math.round((canned.expectedSkillLift * (inf/5)) * 100) / 100;
    return {
      id: g.id, label: g.label, gap: g.gap, influence: inf, priority,
      title: canned.title, expectedSkillLift: canned.expectedSkillLift, estCost: canned.estCost,
      expectedKpiLift,
      assets: suggestAssets(mode, g.id, data)
    };
  }).sort((a,b)=> b.priority - a.priority);
  return rows.slice(0,3);
}
