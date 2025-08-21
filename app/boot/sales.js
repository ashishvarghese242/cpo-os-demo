// app/boot/sales.js
// Builds Sales page radars + orange enablement points (cohort-aggregated)

import RadarCard from "../../components/RadarCard.js";

const React = window.React;
const ReactDOM = window.ReactDOM;

/* -------------------------- utilities -------------------------- */
async function json(path){
  const r = await fetch(path, { cache:"no-store" });
  if(!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
function avg(arr){
  const a = arr.filter(x=>typeof x==="number" && !isNaN(x));
  return a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0;
}
function norm(val, floor, target, higher=true){
  if (val==null || isNaN(val)) return 0;
  const a = Math.min(target, Math.max(floor, val));
  const scaled = (a - floor) / (target - floor || 1);
  const score = clamp(scaled * 5, 0, 5);
  return higher ? score : (5 - score);
}
function lc(s){ return String(s ?? "").toLowerCase().trim(); }
function getArray(x){ return !x ? [] : (Array.isArray(x) ? x : [x]); }
const getContentId = (x)=> x?.content_id ?? x?.contentId ?? x?.id ?? x?.content ?? null;

/* --------------------- cohort/person slicing ------------------- */
function slicePeople(hris, cohortType, cohortKey){
  const sales = hris.filter(p => p.org_unit === "Sales");
  if (cohortType === "All")    return sales.map(p=>p.person_id);
  if (cohortType === "Region") return sales.filter(p => p.region === cohortKey).map(p=>p.person_id);
  if (cohortType === "Person") return cohortKey ? [cohortKey] : [];
  return sales.map(p=>p.person_id);
}

/* --------------------- catalog/LRS mappers --------------------- */
// Catalog: accept your schema (related_metric, competency) + common alternates.
function getTagsLike(item){
  const raw = [
    ...(getArray(item?.metrics)),   // optional alt
    ...(getArray(item?.tags)),      // optional alt
    ...(getArray(item?.labels)),    // optional alt
    item?.related_metric            // YOUR field
  ].filter(Boolean);
  return raw.map(lc);
}
function getCompetencies(item){
  const raw = [
    ...(getArray(item?.competencies)), // optional alt
    item?.competency                   // YOUR field
  ].filter(Boolean);
  return raw.map(lc);
}
// LRS: treat completion/progress/minutes as consumption
function isConsumed(row){
  const status = lc(row?.status || row?.state || (row?.completion ? "completed" : ""));
  const progress = Number(row?.progress ?? row?.completion ?? 0);
  const minutes  = Number(row?.minutes ?? row?.duration_min ?? row?.duration ?? 0);
  return status === "completed" || status === "passed" || progress >= 1 || minutes > 0;
}
function buildConsumedByPerson(lrs){
  const m = new Map();
  for (const r of (Array.isArray(lrs) ? lrs : [])){
    const pid = r?.person_id || r?.user_id || r?.learner_id;
    const cid = getContentId(r);
    if (!pid || !cid) continue;
    if (!isConsumed(r)) continue;
    if (!m.has(pid)) m.set(pid, new Set());
    m.get(pid).add(String(cid));
  }
  return m;
}

// Metric id leniency (e.g., demo_accuracy_rate ↔ demo_accuracy)
function metricAliases(metricIdLC){
  const a = new Set([metricIdLC]);
  if (metricIdLC.endsWith("_rate")) a.add(metricIdLC.replace(/_rate$/, ""));
  if (metricIdLC.endsWith("_days")) a.add(metricIdLC.replace(/_days$/, ""));
  const map = {
    "demo_accuracy_rate": "demo_accuracy",
    "customer_sentiment_score": "sentiment",
    "sales_stage_velocity": "stage_velocity_days"
  };
  if (map[metricIdLC]) a.add(map[metricIdLC]);
  return a;
}

// Find content IDs related to a metric (prefer metric tag; fallback to competency)
function relatedContentForMetric(catalog, metricIdLC, compLC){
  const ids = new Set();
  const aliases = metricAliases(metricIdLC);

  for (const row of (Array.isArray(catalog) ? catalog : [])){
    const cid = getContentId(row);
    if (!cid) continue;
    const tags  = getTagsLike(row);
    const comps = getCompetencies(row);

    if (tags.some(t => aliases.has(t))) { ids.add(String(cid)); continue; }
    if (comps.includes(compLC) && tags.length === 0) { ids.add(String(cid)); continue; }
  }
  if (ids.size === 0){
    for (const row of (Array.isArray(catalog) ? catalog : [])){
      const cid = getContentId(row);
      if (!cid) continue;
      const comps = getCompetencies(row);
      if (comps.includes(compLC)) ids.add(String(cid));
    }
  }
  return Array.from(ids);
}

/* --------------------------- React page ------------------------ */
function SalesPage({ cfg, hris, crm, lrs, catalog }) {
  const { useMemo, useState } = React;

  const regions = Array.from(new Set(hris.filter(p=>p.org_unit==="Sales").map(p=>p.region))).filter(Boolean).sort();
  const persons = hris.filter(p=>p.org_unit==="Sales").map(p=>({id:p.person_id, name:p.name||p.person_id}));

  const [cohortType, setCohortType] = useState("All");
  const [cohortKey, setCohortKey]   = useState(regions[0] || "");

  const personIds = useMemo(()=> slicePeople(hris, cohortType, cohortKey), [hris, cohortType, cohortKey]);
  const crmById   = useMemo(() => new Map(crm.map(r => [r.person_id, r])), [crm]);
  const consumedByPerson = useMemo(() => buildConsumedByPerson(lrs), [lrs]);

  const cards = useMemo(() => {
    return cfg.map(block => {
      const compName = block.competency;
      const compLC   = lc(compName);

      const labels = block.metrics.map(m => m.label);
      const targetData = block.metrics.map(() => 5);

      // current (KPI normalized to 0..5)
      const currentData = block.metrics.map(m => {
        const vals = personIds.map(pid => crmById.get(pid)?.[m.id]).filter(v => v!=null);
        const raw  = avg(vals);
        return norm(raw, m.floor, m.target, m.higher_is_better !== false);
      });

      // enablement points (cohort-aggregated coverage 0..1 → 0..5)
      const overlayPoints = block.metrics.map(m => {
        const metricIdLC = lc(m.id);
        const related = relatedContentForMetric(catalog, metricIdLC, compLC);
        const denom = related.length;
        if (denom === 0) return 0;

        const personScores = personIds.map(pid => {
          const set = consumedByPerson.get(pid);
          if (!set) return 0;
          let cnt = 0;
          for (const cid of related) if (set.has(cid)) cnt++;
          return cnt / denom; // 0..1 for this person
        });

        const cohortPct = avg(personScores);   // 0..1
        return clamp(cohortPct * 5, 0, 5);     // 0..5 for point size/intensity
      });

      return { title: compName, labels, targetData, currentData, overlayPoints };
    });
  }, [cfg, catalog, consumedByPerson, crmById, JSON.stringify(personIds)]);

  const row1 = cards.slice(0,2);
  const row2 = cards.slice(2,4);
  const row3 = cards.slice(4,5);

  return React.createElement(React.Fragment, null,
    React.createElement("header", null,
      React.createElement("div", { className:"brand" },
        React.createElement("div", null,
          React.createElement("h2", null, "Sales — Competency Radars"),
          React.createElement("div", { className:"tag" }, "Where we are vs where we need to be (benchmarked to top performers)")
        )
      ),
      React.createElement("div", null,
        React.createElement("select", {
          value: cohortType,
          onChange: e => { setCohortType(e.target.value); if (e.target.value==="Region") setCohortKey(regions[0]||""); }
        }, ["All","Region","Person"].map(x => React.createElement("option", { key:x, value:x }, x))),
        " ",
        cohortType==="Region" && regions.length ? React.createElement("select", {
          value: cohortKey, onChange: e => setCohortKey(e.target.value)
        }, regions.map(r => React.createElement("option", { key:r, value:r }, r))) : null,
        cohortType==="Person" && persons.length ? React.createElement("select", {
          value: cohortKey || persons[0].id, onChange: e => setCohortKey(e.target.value)
        }, persons.map(p => React.createElement("option", { key:p.id, value:p.id }, p.name))) : null
      )
    ),

    React.createElement("div", { className:"grid-2", style:{marginTop:16} },
      ...row1.map((c,i) => React.createElement(RadarCard, { key:"r1"+i, ...c, height:360 }))
    ),
    React.createElement("div", { className:"grid-2", style:{marginTop:16} },
      ...row2.map((c,i) => React.createElement(RadarCard, { key:"r2"+i, ...c, height:360 }))
    ),
    React.createElement("div", { className:"grid-1", style:{marginTop:16} },
      ...row3.map((c,i) => React.createElement(RadarCard, { key:"r3"+i, ...c, height:360 }))
    )
  );
}

/* ---------------------------- bootstrap ------------------------ */
(async function bootstrap(){
  try{
    const [cfg, hris, crm, lrs, catalog] = await Promise.all([
      json("./config/competencies/sales.json"),
      json("./data/hris.json"),
      json("./data/crm.json"),
      fetch("./data/lrs.json").then(r => r.ok ? r.json() : []).catch(()=>[]),
      fetch("./data/content_catalog.json").then(r => r.ok ? r.json() : []).catch(()=>[])
    ]);
    const root = document.getElementById("app");
    ReactDOM.createRoot(root).render(
      React.createElement(SalesPage, { cfg, hris, crm, lrs, catalog })
    );
  }catch(e){
    const el = document.getElementById("app");
    el.innerHTML = `<div class="card"><h3>Sales page failed to load</h3><div class="muted">${e.message}</div></div>`;
    console.error(e);
  }
})();
