// lib/compute.js
function mulberry32(seed){ return function(){ let t=(seed+=0x6d2b79f5); t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; }
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

export function seededScores(count, seed=42){ const r=mulberry32(seed); return Array.from({length:count},()=>Math.floor(r()*5)+1); }

export function idealPersona(mode, skillsConfig){
  const arr = mode==="Sales" ? skillsConfig.sales : mode==="CS" ? skillsConfig.cs : skillsConfig.prod;
  return { labels: arr.map(s=>s.label), targets: arr.map(s=>s.target), ids: arr.map(s=>s.id) };
}

// helper: simple 0..1 normalize with guard
function norm01(v, min, max){ const span=(max-min)||1; return clamp((v-min)/span,0,1); }

// === Cohort sampler & KPI (still used for Influence radar demo) ===
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
    if(mode==="CS")    return 80 + x*20;   // Retention %
    return 0.5 + x*1.5;                    // Deploy/day
  });
  cohort.forEach((c,i)=>c.kpi=scaled[i]);
  return cohort;
}

// === Compute actual skill scores from real signals (synthetic data) ===
export function skillScores(mode, skillsConfig, seed=42){
  const data = window.__DATA || {};
  const { labels, ids } = idealPersona(mode, skillsConfig);

  if (mode === "Sales"){
    // signals per person (aggregate over last entries)
    // pick first sales person in HRIS for demo
    const person = (data.hris||[]).find(p=>p.org_unit==="Sales") || { person_id:"p1" };
    const convos = (data.gong||[]).filter(g=>g.person_id===person.person_id);
    const cmsUse = (data.cms||[]).filter(c=>c.person_id===person.person_id);
    const opps   = (data.crm||[]).filter(o=>o.owner_person_id===person.person_id);

    const talkBalance = convos.length ? 1 - Math.abs(0.55 - avg(convos.map(c=>c.talk_ratio)))/0.55 : 0.5; // best near 0.5–0.6
    const qpm         = convos.length ? avg(convos.map(c=>c.questions_per_min)) : 0.3;
    const nextSteps   = convos.length ? avg(convos.map(c=>c.next_steps_called)) : 0;
    const objections  = convos.length ? 1 - norm01(avg(convos.map(c=>c.objections_mentioned)),0,3) : 0.5; // fewer better
    const dsrUse      = cmsUse.length ? norm01(sum(cmsUse.map(c=>c.usage_count)),0,10) : 0;

    const map = {
      discovery:  clamp(scale5( (qpm*0.5 + talkBalance*0.5) )),    // ask good Qs, good talk ratio
      objections: clamp(scale5( objections )),                      // fewer objection spikes → better handling
      multi:      clamp(scale5( norm01(unique(opps.map(o=>o.account_id)).length, 1, 5) )), // contacts/accounts
      demo:       clamp(scale5( dsrUse )),                          // DSR/content usage proxy
      nextstep:   clamp(scale5( nextSteps ))                        // calls with defined next step
    };
    return ids.map(id => map[id] ?? 3);
  }

  if (mode === "CS"){
    const person = (data.hris||[]).find(p=>p.org_unit==="CS") || { person_id:"c1" };
    const events = (data.lms||[]).filter(e=>e.person_id===person.person_id);
    const tickets= (data.support||[]).filter(t=>t.account_id); // simple aggregate

    const completions = events.filter(e=>e.verb==="completed").length;
    const avgScore    = events.length ? avg(events.map(e=>e.score||0)) : 70;
    const ttrMin      = tickets.length ? avg(tickets.map(t=>t.resolution_min)) : 600;

    const map = {
      onboarding: clamp(scale5( norm01(completions, 0, 5) )),
      activation: clamp(scale5( norm01(avgScore, 50, 95) )),
      triage:     clamp(scale5( 1 - norm01(ttrMin, 60, 1440) )),
      qbr:        3.2,
      renewal:    3.5
    };
    return ids.map(id => map[id] ?? 3);
  }

  // Production
  {
    const tickets= (data.support||[]);
    const deployPerDay = 1.1; // placeholder
    const changeFailure= norm01(tickets.filter(t=>t.severity==="high").length, 0, 3);
    const mttrMin      = tickets.length ? avg(tickets.map(t=>t.resolution_min)) : 600;
    const reviewSla    = 0.6; // placeholder fraction meeting SLA

    const map = {
      flow:     clamp(scale5( norm01(deployPerDay, 0.5, 2.0) )),
      review:   clamp(scale5( reviewSla )),
      reliable: clamp(scale5( 1 - changeFailure )),
      recovery: clamp(scale5( 1 - norm01(mttrMin, 60, 1440) )),
      eff:      3.4
    };
    return ids.map(id => map[id] ?? 3);
  }
}

export function performanceGaps(actual, targets, ids, labels){
  return actual.map((a,i)=>({ id:ids[i], label:labels[i], actual:a, target:targets[i], gap:Number((targets[i]-a).toFixed(2)) }))
               .sort((a,b)=> b.gap - a.gap);
}

// helpers
function avg(a){ return a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0; }
function sum(a){ return a.reduce((x,y)=>x+y,0); }
function unique(a){ return Array.from(new Set(a)); }
function scale5(x){ return Math.round((x*5)*10)/10; }
