// lib/lrs.js
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
const avg = (a)=> a.length ? a.reduce((x,y)=>Number(x)+Number(y),0)/a.length : 0;

function catalogForMode(mode, catalog){
  return (catalog||[]).filter(c => c.mode === mode);
}

// Utilization per skill for a PERSON (0..1) from LRS events
export function utilizationForPerson(mode, personId, data){
  const cat = catalogForMode(mode, data.content_catalog);
  const bySkill = new Map();
  const events = (data.lms||[]).filter(e => e.person_id===personId);
  for (const ev of events){
    const hit = cat.find(c => c.tag === ev.content_tag);
    if (!hit) continue;
    bySkill.set(hit.skill_id, (bySkill.get(hit.skill_id)||0) + 1);
  }
  const out = {};
  for (const c of cat){
    const cnt = bySkill.get(c.skill_id)||0;
    out[c.skill_id] = clamp(cnt / 5, 0, 1); // soft cap at 5 touches
  }
  return out;
}

// Training leverage for a COHORT (scaled 0..5, presentation-friendly)
export function leverageForCohort(mode, cohortIds, data){
  const cat = catalogForMode(mode, data.content_catalog);
  const skills = Array.from(new Set(cat.map(c => c.skill_id)));

  // precompute utilization per person
  const utilByPerson = new Map();
  for (const pid of cohortIds){
    utilByPerson.set(pid, utilizationForPerson(mode, pid, data));
  }

  const leverage = {};
  for (const s of skills){
    const utilVals = cohortIds.map(pid => utilByPerson.get(pid)?.[s] || 0);          // 0..1
    const utilAvg  = avg(utilVals);                                                 // 0..1
    const liftBest = cat.filter(c=>c.skill_id===s).map(c=>c.expected_skill_lift)
                        .sort((a,b)=>b-a)[0] ?? 0.2;                                 // ~0.18..0.30

    // Nonlinear scale so small utilization still shows up; tuned for demo readability
    const utilScaled = Math.pow(utilAvg, 0.6);                                      // boosts low values
    const liftScaled = 0.7 + liftBest * 0.9;                                        // ~0.86..0.97

    let score0to5 = utilScaled * liftScaled * 5;                                    // 0..~4.85
    score0to5 = clamp(score0to5, 0.8, 4.0);                                         // floor/ceiling for visibility

    leverage[s] = Math.round(score0to5 * 10) / 10;                                  // one decimal
  }

  // ensure every displayed skill key exists (even if zero cohort usage)
  for (const c of cat) if (!(c.skill_id in leverage)) leverage[c.skill_id] = 1.0;

  return leverage; // skill_id -> 0..5
}

// Top content drivers for the cohort (usage × expected lift)
export function topContentDrivers(mode, cohortIds, data, topN=5){
  const cat = catalogForMode(mode, data.content_catalog);
  const events = (data.lms||[]).filter(e => cohortIds.includes(e.person_id));
  const counts = new Map();
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

// Recommendations: for top gaps, propose best catalog items not yet saturated
export function recommendContentForGaps(mode, gaps, cohortIds, data, perGap=2){
  const cat = catalogForMode(mode, data.content_catalog);
  const events = (data.lms||[]).filter(e => cohortIds.includes(e.person_id));
  const usedByTag = new Map();
  for (const ev of events) usedByTag.set(ev.content_tag, (usedByTag.get(ev.content_tag)||0)+1);

  const recs = [];
  for (const g of gaps.slice(0,3)){
    const choices = cat.filter(c => c.skill_id === g.id)
      .map(c => ({
        ...c,
        used: usedByTag.get(c.tag)||0,
        priority: (Math.max(0, g.gap)) * (1 - Math.min(1, (usedByTag.get(c.tag)||0)/5)) * (0.5 + c.expected_skill_lift)
      }))
      .sort((a,b)=> b.priority - a.priority)
      .slice(0, perGap);
    recs.push({ skill: g.label, gap: g.gap, items: choices });
  }
  return recs;
}
