// app/boot/sales.js
import RadarCard from "../../components/RadarCard.js";

const React = window.React;
const ReactDOM = window.ReactDOM;

/* ---------- helpers ---------- */
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

/* ---------- Page component ---------- */
function SalesPage({ cfg, hris, crm }) {
  const { useMemo, useState } = React;

  const regions = Array.from(new Set(hris.filter(p=>p.org_unit==="Sales").map(p=>p.region))).filter(Boolean).sort();
  const persons = hris.filter(p=>p.org_unit==="Sales").map(p=>({id:p.person_id, name:p.name||p.person_id}));

  const [cohortType, setCohortType] = useState("All");
  const [cohortKey, setCohortKey] = useState(regions[0] || "");

  const personIds = useMemo(()=> slicePeople(hris, cohortType, cohortKey), [hris, cohortType, cohortKey]);

  const cards = useMemo(() => {
    const byId = new Map(crm.map(r => [r.person_id, r]));
    return cfg.map(block => {
      const labels = block.metrics.map(m => m.label);
      const targetData = block.metrics.map(() => 5);
      const currentData = block.metrics.map(m => {
        const vals = personIds.map(pid => byId.get(pid)?.[m.id]).filter(v => v!=null);
        const raw = avg(vals);
        return norm(raw, m.floor, m.target, m.higher_is_better !== false);
      });
      return { title: block.competency, labels, targetData, currentData };
    });
  }, [cfg, crm, JSON.stringify(personIds)]);

  // layout 3 + 2
  const top3 = cards.slice(0,3);
  const bottom2 = cards.slice(3,5);

  return React.createElement(React.Fragment, null,
    React.createElement("header", null,
      React.createElement("div", { className:"brand" },
        React.createElement("span", { className:"badge" }, "CPO OS"),
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

    React.createElement("div", { className:"grid-3", style:{marginTop:16} },
      ...top3.map((c,i) => React.createElement(RadarCard, { key:"t"+i, ...c, height:360 }))
    ),
    React.createElement("div", { className:"grid-2", style:{marginTop:16} },
      ...bottom2.map((c,i) => React.createElement(RadarCard, { key:"b"+i, ...c, height:360 }))
    )
  );
}

/* ---------- bootstrap ---------- */
(async function bootstrap(){
  try{
    const [cfg, hris, crm] = await Promise.all([
      json("./config/competencies/sales.json"),
      json("./data/hris.json"),
      json("./data/crm.json")
    ]);
    const root = document.getElementById("app");
    ReactDOM.createRoot(root).render(React.createElement(SalesPage, { cfg, hris, crm }));
  }catch(e){
    const el = document.getElementById("app");
    el.innerHTML = `<div class="card"><h3>Sales page failed to load</h3><div class="muted">${e.message}</div></div>`;
    console.error(e);
  }
})();
