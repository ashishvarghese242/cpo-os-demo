// lib/compute.js
function mulberry32(seed){ return function(){ let t=(seed+=0x6d2b79f5); t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; }
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const isNum = (v) => Number.isFinite(v);
const safe = (v, d=0) => (isNum(v) ? v : d);

export function idealPersona(mode, skillsConfig){
  const arr = mode==="Sales" ? skillsConfig.sales : mode==="CS" ? skillsConfig.cs : skillsConfig.prod;
  return { labels: arr.map(s=>s.label), targets: arr.map(s=>s.target), ids: arr.map(s=>s.id) };
}

// --- helpers
const norm01 = (v, min, max) => {
  const span = (max - min) || 1;
  return clamp(((safe(Number(v), min) - min) / span), 0, 1);
};
const avg = (a) => a.length ? a.reduce((x,y)=>Number(x)+Number(y),0)/a.length : 0;
const sum = (a) => a.reduce((x,y)=>Number(x)+Number(y),0);
const unique = (a) => Array.from(new Set(a));
const scale5 = (x) => Math.round((safe(x,0)*5)*10)/10;

// === Cohort sampler & KPI (for Influence radar demo) ===
function minMax(arr){ const min=Math.min(...arr), max=Math.max(...arr), span=max-min||1; return arr.map(v=>(v-min)/span); }
export function sampleCohort(mode, skillsConfig, seed=7, n=80){
  const { ids } = idealPersona(mode, skillsConfig);
  const r = mulberry32(seed); const w = ids.map((_,i)=>0.6+i*0.1);
  const cohort=[];
  for(let i=0;i<n;i++){
    const skills=ids.map(()=>Math.floor(r()*5)+1);
    const kpiRaw = skills.reduce((acc,s,j)=>acc+s*w[j],0)+(r()-0.5)*2;
    cohort.push({ skills, kpi:kpiRaw });
  }
  const scaled = minMax(cohort.map(c=>c.kpi)).map(x=>{
    if(mode==="Sales") return 10 + x*40;   // WinRate %
    if(mode==="CS")    return 80 + x*20;   // NRR %
    return 60 + x*300;                     // MTTR mins (for display we’ll invert elsewhere)
  });
  cohort.forEach((c,i)=>c.kpi=scaled[i]);
  return cohort;
}

// === Skill scores per PERSON (deterministic from data)
export function skillScoresForPerson(mode, skillsCfg, person_id, data){
  const { ids } = idealPersona(mode, skillsCfg);

  if (mode === "Sales"){
    const convos = (data.gong||[]).filter(g=>g.person_id===person_id);
    const cmsUse = (data.cms||[]).filter(c=>c.person_id===person_id);
    const opps   = (data.crm||[]).filter(o=>o.owner_person_id===person_id);

    const talkBalance = convos.length ? 1 - Math.abs(0.55 - avg(convos.map(c=>+c.talk_ratio)))/0.55 : 0.5;
    const qpm         = convos.length ? avg(convos.map(c=>+c.questions_per_min)) : 0.3;
    const nextSteps   = convos.length ? avg(convos.map(c=>+c.next_steps_called)) : 0;
    const objections  = convos.length ? 1 - norm01(avg(convos.map(c=>+c.objections_mentioned)),0,3) : 0.5;
    const dsrUse      = cmsUse.length ? norm01(sum(cmsUse.map(c=>+c.usage_count)),0,10) : 0;
    const multiScope  = norm01(unique(opps.map(o=>o.account_id)).length, 1, 5);

    const map = {
      discovery:  clamp(scale5(qpm*0.5 + talkBalance*0.5), 0, 5),
      objections: clamp(scale5(objections), 0, 5),
      multi:      clamp(scale5(multiScope), 0, 5),
      demo:       clamp(scale5(dsrUse), 0, 5),
      nextstep:   clamp(scale5(nextSteps), 0, 5)
    };
    return sanitize(ids.map(id => map[id]));
  }

  if (mode === "CS"){
    const events = (data.lms||[]).filter(e=>e.person_id===person_id);
    const tickets= (data.support||[]).filter(t=>true);

    const completions = events.filter(e=>e.verb==="completed").length;
    const avgScore    = events.length ? avg(events.map(e=>+e.score||0)) : 70;
    const ttrMin      = tickets.length ? avg(tickets.map(t=>+t.resolution_min||0)) : 600;

    const map = {
      onboarding: scale5(norm01(completions, 0, 5)),
      activation: scale5(norm01(avgScore, 50, 95)),
      triage:     scale5(1 - norm01(ttrMin, 60, 1440)),
      qbr:        3.2,
      renewal:    3.5
    };
    return sanitize(ids.map(id => map[id]));
  }

  // Production
  {
    const tickets= (data.support||[]);
    const deployPerDay = 1.1; // placeholder
    const changeFailure= norm01(tickets.filter(t=>String(t.severity).toLowerCase()==="high").length, 0, 3);
    const mttrMin      = tickets.length ? avg(tickets.map(t=>+t.resolution_min||0)) : 600;
    const reviewSla    = 0.6; // placeholder

    const map = {
      flow:     scale5(norm01(deployPerDay, 0.5, 2.0)),
      review:   scale5(reviewSla),
      reliable: scale5(1 - changeFailure),
      recovery: scale5(1 - norm01(mttrMin, 60, 1440)),
      eff:      3.4
    };
    return sanitize(ids.map(id => map[id]));
  }
}

// === Cohort (All / Region / Person)
export function cohortPersonIds(mode, data, type="All", key=""){
  const people = (data.hris||[]).filter(p => p.org_unit === (mode==="Production" ? "Production" : mode));
  if (type === "Person" && key) return people.filter(p=>p.person_id===key).map(p=>p.person_id);
  if (type === "Region" && key) return people.filter(p=>p.region===key).map(p=>p.person_id);
  return people.map(p=>p.person_id); // All
}

export function skillScoresForCohort(mode, skillsCfg, data, personIds){
  if (!personIds.length) return zeros5();
  const per = personIds.map(id => skillScoresForPerson(mode, skillsCfg, id, data));
  const dims = per[0].length;
  const avgVec = Array.from({length:dims}, (_,i)=> avg(per.map(v=>v[i])));
  return avgVec.map(v => Number(v.toFixed(2)));
}

// === KPI (primary per mode)
export function primaryKpiLabel(mode){
  if (mode==="Sales") return "WinRate";
  if (mode==="CS") return "NRR";
  return "MTTR";
}

export function kpiForPerson(mode, data, person_id){
  if (mode==="Sales"){
    const opps=(data.crm||[]).filter(o=>o.owner_person_id===person_id);
    const total=opps.length||1, won=opps.filter(o=>o.is_won).length;
    return Math.round((won/total)*100); // %
  }
  if (mode==="CS"){
    // Simulated NRR from ticket health (fewer high sev + faster TTR ⇒ higher NRR)
    const tickets=(data.support||[]);
    const high=tickets.filter(t=>String(t.severity).toLowerCase()==="high").length;
    const ttr= tickets.length? avg(tickets.map(t=>+t.resolution_min||0)) : 600;
    const health = clamp(1 - (high*0.05 + norm01(ttr, 60, 1440)*0.3), 0.6, 0.98);
    return Math.round(health*100); // %
  }
  // Production → MTTR (mins, lower better)
  const tickets=(data.support||[]);
  return Math.round(tickets.length? avg(tickets.map(t=>+t.resolution_min||0)) : 600);
}

export function kpiForCohort(mode, data, personIds){
  if (!personIds.length) return 0;
  const vals = personIds.map(id => kpiForPerson(mode, data, id));
  return Math.round(avg(vals));
}

export function performanceGaps(actual, targets, ids, labels){
  return actual.map((a,i)=>({ id:ids[i], label:labels[i], actual:safe(a,0), target:safe(targets[i],0), gap:Number((safe(targets[i],0)-safe(a,0)).toFixed(2)) }))
               .sort((a,b)=> b.gap - a.gap);
}

// utils
function zeros5(){ return [0,0,0,0,0]; }
function sanitize(arr){
  const out = (arr || []).map(v => (isNum(v) ? clamp(v,0,5) : 0.2));
  while (out.length < 5) out.push(0.2);
  return out.slice(0,5);
}
