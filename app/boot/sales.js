// app/boot/sales.js
import RadarCard from "../../components/RadarCard.js";

const React = window.React;
const ReactDOM = window.ReactDOM;

async function json(path){
  const r = await fetch(path, { cache:"no-store" });
  if(!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
function norm(val, floor, target, higher=true){
  if (val==null || isNaN(val)) return 0;
  const a = Math.min(target, Math.max(floor, val));
  const scaled = (a - floor) / (target - floor || 1);
  const score = clamp(scaled * 5, 0, 5);
  return higher ? score : (5 - score);
}
function slicePeople(hris, cohortType, cohortKey){
  const sales = hris.filter(p => p.org_unit === "Sales");
  if (cohortType === "All") return sales.map(p=>p.person_id);
  if (cohortType === "Region") return sales.filter(p => p.region === cohortKey).map(p=>p.person_id);
  if (cohortType === "Person") return cohortKey ? [cohortKey] : [];
  return sales.map(p=>p.person_id);
}
function avg(arr){
  const a = arr.filter(x=>typeof x==="number" && !isNaN(x));
  return a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0;
}

/* ----------------------- Enablement Halo Helpers (non-breaking) ----------------------- */

/** Top performers = top 25% by win_rate_uplift (fallbacks if missing). */
function topPerformerIds(crm, percentile = 0.75){
  const arr = Array.isArray(crm) ? crm.slice() : [];
  if (!arr.length) return new Set();

  const key =
    (arr.some(r => typeof r.win_rate_uplift === "number") && "win_rate_uplift") ||
    (arr.some(r => typeof r.margin_retention === "number") && "margin_retention") ||
    (arr.some(r => typeof r.client_retention === "number") && "client_retention") ||
    null;

  if (!key) return new Set();

  arr.sort((a,b) => (b[key]??-Infinity) - (a[key]??-Infinity));
  const cutoff = Math.max(1, Math.floor(arr.length * (1 - percentile)) + 1);
  const top = arr.slice(0, cutoff);
  return new Set(top.map(r => r.person_id).filter(Boolean));
}

/** Normalize competency name for lookup. */
function normCompKey(name){ return String(name || "").toLowerCase().trim(); }

/** Extract content_id from various shapes. */
function getContentId(item){
  return item?.content_id ?? item?.contentId ?? item?.id ?? item?.content ?? null;
}

/** Extract competency tags from catalog items. */
function getCompetencyTags(item){
  const tags = item?.competencies ?? item?.tags ?? item?.labels ?? [];
  if (!Array.isArray(tags)) return [];
  return tags.map(t => String(t || "").toLowerCase().trim()).filter(Boolean);
}

/** Simple “consumed” rule for demo: completed/passed OR progress>=1 OR minutes>0 */
function isConsumed(lrsRow){
  const status = (lrsRow?.status || lrsRow?.state || "").toString().toLowerCase();
  const progress = Number(lrsRow?.progress ?? lrsRow?.completion ?? 0);
  const minutes = Number(lrsRow?.minutes ?? lrsRow?.duration_min ?? lrsRow?.duration ?? 0);
  return status === "completed" || status === "passed" || progress >= 1 || minutes > 0;
}

/**
 * Compute: competency(lower) -> % (0..1) of TOP performers who consumed any related content.
 * lrs: [{ person_id, content_id, status/progress/minutes }]
 * catalog: [{ content_id/id, competencies/tags: [...] }]
 */
function computeHaloPercentByCompetency({ lrs, catalog, topIds }){
  const result = new Map();
  if (!Array.isArray(lrs) || !Array.isArray(catalog) || !(topIds instanceof Set)) return result;

  // Map content_id -> competencies
  const contentToComps = new Map();
  for (const row of catalog){
    const cid = getContentId(row);
    if (!cid) continue;
    const tags = getCompetencyTags(row);
    if (!tags.length) continue;
    contentToComps.set(String(cid), new Set(tags));
  }

  // comp -> Set(person_id) among TOP only
  const compToConsumers = new Map();
  for (const rec of lrs){
    const pid = rec?.person_id || rec?.user_id || rec?.learner_id || null;
    if (!pid || !topIds.has(pid)) continue;
    if (!isConsumed(rec)) continue;

    const cid = getContentId(rec);
    if (!cid) continue;

    const comps = contentToComps.get(String(cid));
    if (!comps || !comps.size) continue;

    for (const comp of comps){
      if (!compToConsumers.has(comp)) compToConsumers.set(comp, new Set());
      compToConsumers.get(comp).add(pid);
    }
  }

  const denom = Math.max(1, topIds.size);
  for (const [comp, set] of compToConsumers.entries()){
    result.set(comp, clamp(set.size / denom, 0, 1));
  }
  return result;
}

/* ----------------------- React Page ----------------------- */

function SalesPage({ cfg, hris, crm, lrs, catalog }) {
  const { useMemo, useState } = React;

  const regions = Array.from(new Set(hris.filter(p=>p.org_unit==="Sales").map(p=>p.region))).filter(Boolean).sort();
  const persons = hris.filter(p=>p.org_unit==="Sales").map(p=>({id:p.person_id, name:p.name||p.person_id}));

  const [cohortType, setCohortType] = useState("All");
  const [cohortKey, setCohortKey] = useState(regions[0] || "");

  const personIds = useMemo(()=> slicePeople(hris, cohortType, cohortKey), [hris, cohortType, cohortKey]);

  // Lookups
  const crmById = useMemo(() => new Map(crm.map(r => [r.person_id, r])), [crm]);
  const topIds = useMemo(() => topPerformerIds(crm, 0.75), [crm]);

  // Enablement halo % per competency (TOP performers only)
  const haloPctByComp = useMemo(() => computeHaloPercentByCompetency({
    lrs: Array.isArray(lrs) ? lrs : [],
    catalog: Array.isArray(catalog) ? catalog : [],
    topIds
  }), [lrs, catalog, topIds]);

  const cards = useMemo(() => {
    return cfg.map(block => {
      const labels = block.metrics.map(m => m.label);
      const targetData = block.metrics.map(() => 5);
      const currentData = block.metrics.map(m => {
        const vals = personIds.map(pid => crmById.get(pid)?.[m.id]).filter(v => v!=null);
        const raw = avg(vals);
        return norm(raw, m.floor, m.target, m.higher_is_better !== false);
      });

      // Halo overlay: % of top performers consuming related content → 0..5
      const compKey = normCompKey(block.competency);
      const pct = haloPctByComp.get(compKey) ?? 0;   // 0..1
      const haloScaled = clamp(pct * 5, 0, 5);       // 0..5 for radar
      const overlayData = labels.map(() => haloScaled);

      return { title: block.competency, labels, targetData, currentData, overlayData };
    });
  }, [cfg, crmById, JSON.stringify(personIds), haloPctByComp]);

  const row1 = cards.slice(0,2);
  const row2 = cards.slice(2,4);
  const row3 = cards.slice(4,5);

  return React.createElement(React.Fragment, null,
    // Keep your existing header/filters exactly as-is
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

(async function bootstrap(){
  try{
    const [cfg, hris, crm, lrs, catalog] = await Promise.all([
      json("./config/competencies/sales.json"),
      json("./data/hris.json"),
      json("./data/crm.json"),
      // Optional sources; tolerate 404s and keep page working
      fetch("./data/lrs.json").then(r => r.ok ? r.json() : []).catch(() => []),
      fetch("./data/content_catalog.json").then(r => r.ok ? r.json() : []).catch(() => [])
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
