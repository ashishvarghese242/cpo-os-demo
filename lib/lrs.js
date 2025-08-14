// lib/lrs.js
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
const avg = (a)=> a.length ? a.reduce((x,y)=>Number(x)+Number(y),0)/a.length : 0;

function catalogForMode(mode, catalog){
  return (catalog||[]).filter(c => c.mode === mode);
}

// Utilization per skill for a PERSON (0..1) from LRS events
export function utilizationForPerson(mode, personId, data){
  const cat = catalogForMode(mode, data.content_catalog);
  const bySkill = new Map(); // skill_id -> count
  const events = (data.lms||[]).filter(e => e.person_id===personId);
  for (const ev of events){
    const hit = cat.find(c => c.tag === ev.content_tag);
    if (!hit) continue;
    bySkill.set(hit.skill_id, (bySkill.get(hit.skill_id)||0) + 1);
  }
  // normalize by simple cap (e.g., 5 items = full utilization)
  const out = {};
  for (const c of cat){
    const cnt = bySkill.get(c.skill_id)||0;
    out[c.skill_id] = clamp(cnt / 5, 0, 1);
  }
  return out; // skill_id -> 0..1
}

// Training leverage for a COHORT (0..5): utilization × content expected lift
export function leverageForCohort(mode, cohortIds, data){
  const cat = catalogForMode(mode, data.content_catalog);
  const skills = Array.from(new Set(cat.map(c => c.skill_id)));
  const utilByPerson = new Map();
  for (const pid of cohortIds){
    utilByPerson.set(pid, utilizationForPerson(mode, pid, data));
  }
  const leverage = {};
  for (const s of skills){
    const u = [];
    for (const pid of cohortIds){
      u.push(utilByPerson.get(pid)?.[s] || 0);
    }
    const utilAvg = avg(u); // 0..1
    // use the strongest asset for this skill as proxy for "available leverage"
    const strongest = cat.filter(c=>c.skill_id===s).map(c=>c.expected_skill_lift).sort((a,b)=>b-a)[0] || 0.2;
    const score0to5 = Math.round(utilAvg * strongest * 5 * 10) / 10;
    leverage[s] = score0to5; // 0..5
  }
  return leverage; // skill_id -> 0..5
}

// Top content drivers for the cohort (usage × expected lift)
export function topContentDrivers(mode, cohortIds, data, topN=5){
  const cat = catalogForMode(mode, data.content_catalog);
  const events = (data.lms||[]).filter(e => cohortIds.includes(e.person_id));
  const counts = new Map(); // content_id -> count
  for (const ev of events){
    const c = cat.find(x=>x.tag===ev.content_tag);
    if (!c) continue;
    counts.set(c.content_id, (counts.get(c.content_id)||0) + 1);
  }
  const scored = cat.map(c => {
    const used = counts.get(c.content_id)||0;
    const driver = used * c.expected_skill_lift;
    return { ...c, used, driver: Math.round(driver*100)/100 };
  }).sort((a,b)=> b.driver - a.driver);
  return scored.slice(0, topN);
}

// Recommendations: for top gaps, return best matching catalog items not yet used much
export function recommendContentForGaps(mode, gaps, cohortIds, data, perGap=2){
  const cat = catalogForMode(mode, data.content_catalog);
  const events = (data.lms||[]).filter(e => cohortIds.includes(e.person_id));
  const usedByTag = new Map(); // tag -> usage count
  for (const ev of events) usedByTag.set(ev.content_tag, (usedByTag.get(ev.content_tag)||0)+1);

  const recs = [];
  for (const g of gaps.slice(0,3)){
    const choices = cat.filter(c => c.skill_id === g.id)
      .map(c => ({ ...c, used: usedByTag.get(c.tag)||0, priority: (g.gap * (1 - Math.min(1, (usedByTag.get(c.tag)||0)/5))) * (c.expected_skill_lift) }))
      .sort((a,b)=> b.priority - a.priority)
      .slice(0, perGap);
    recs.push({ skill: g.label, gap: g.gap, items: choices });
  }
  return recs;
}

