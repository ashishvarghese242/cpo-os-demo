// app/ui.js
import { getState, setState, subscribe } from "./state.js";
import {
  idealPersona, sampleCohort,
  skillScoresForCohort, skillScoresForPerson,
  cohortPersonIds, performanceGaps,
  primaryKpiLabel, kpiForCohort, kpiForPerson
} from "../lib/compute.js";
import { renderRadar, dsActual, dsTarget, dsInfluence, dsTraining } from "../lib/charts.js";
import { influenceScores } from "../lib/influence.js";
import { rankRecommendations } from "../lib/reco.js";
import { computeROI, defaultAssumptions, normalizeAssumptions } from "../lib/roi.js";
import { leverageForCohort, topContentDrivers, recommendContentForGaps } from "../lib/lrs.js";

const React = window.React;

/* ---------- small store helper ---------- */
function useStore() {
  const { useEffect, useState } = React;
  const [snap, setSnap] = useState(getState());
  useEffect(() => subscribe(setSnap), []);
  return [snap, setState];
}

/* ---------- UI primitives ---------- */
function Card({ title, children }) {
  return React.createElement("div", { className:"card" },
    title ? React.createElement("h3", { style:{margin:"0 0 8px 0"} }, title) : null,
    children
  );
}
function RadarCanvas({ height=320, render }) {
  const { useEffect, useRef } = React;
  const ref = useRef(null);
  useEffect(() => { if (ref.current) render(ref.current); }, [render]);
  return React.createElement("div", { style:{height} }, React.createElement("canvas", { ref }));
}
function Table({ columns, rows }) {
  const thead = React.createElement("thead", null,
    React.createElement("tr", null, columns.map(c => React.createElement("th", { key:c }, c)))
  );
  const tbody = React.createElement("tbody", null,
    rows.map((r,i) => React.createElement("tr",{key:i}, columns.map(c => React.createElement("td",{key:c}, r[c]))))
  );
  return React.createElement("table", { style:{ width:"100%", borderCollapse:"separate", borderSpacing:"0", fontSize:"14px" }}, thead, tbody);
}

/* ---------- Assumptions panel ---------- */
function useAssumptions() {
  const key = "__cpo_assumptions_v1";
  const [assume, setAssume] = React.useState(() => {
    try { return normalizeAssumptions(JSON.parse(localStorage.getItem(key)||"{}")); }
    catch { return normalizeAssumptions({}); }
  });
  const update = (path, val) => {
    const parts = path.split(".");
    const next = JSON.parse(JSON.stringify(assume));
    let cur = next;
    for (let i=0;i<parts.length-1;i++) cur = cur[parts[i]];
    cur[parts[parts.length-1]] = Number(val);
    localStorage.setItem(key, JSON.stringify(next));
    setAssume(normalizeAssumptions(next));
  };
  const reset = () => { localStorage.removeItem(key); setAssume(normalizeAssumptions({})); };
  return { assume, update, reset };
}
function NumberField({ label, value, onChange, min=0, step=1, suffix="" }) {
  return React.createElement("label", { style:{display:"grid", gap:4} },
    React.createElement("span", { style:{fontSize:12, color:"#6b7280"} }, label),
    React.createElement("input", {
      type:"number", value, step, min,
      onChange:(e)=>onChange(e.target.value),
      style:{padding:"8px 10px", border:"1px solid #e5e7eb", borderRadius:10, width:"100%"}
    }),
    suffix ? React.createElement("span", { style:{fontSize:11, color:"#6b7280"} }, suffix) : null
  );
}
function AssumptionsPanel({ mode, teamSize, onChange }) {
  const { assume, update, reset } = useAssumptions();
  React.useEffect(()=> onChange && onChange(assume), [assume]);

  const g = assume;
  const grid = { display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:12 };
  const grid2 = { display:"grid", gridTemplateColumns:"repeat(2,minmax(0,1fr))", gap:12 };

  return React.createElement("div", { className:"card" },
    React.createElement("h3", null, "Assumptions — Cost Drivers"),
    React.createElement("div", { className:"muted", style:{margin:"-4px 0 8px 0"} },
      `Cohort size: ${teamSize}. Values persist in your browser.`
    ),
    React.createElement("div", { style:grid },
      React.createElement(NumberField, {
        label:"Fully-loaded hourly ($/hr)", value:g.fullyLoadedHourly, step:5,
        onChange:v=>update("fullyLoadedHourly", v)
      }),
      React.createElement(NumberField, {
        label:"Training hours per person (yr)", value:g.trainingHoursPerPerson, step:2,
        onChange:v=>update("trainingHoursPerPerson", v)
      }),
      React.createElement(NumberField, {
        label:"Non‑applicable training (%)", value:g.nonApplicableTrainingPct, step:0.05,
        onChange:v=>update("nonApplicableTrainingPct", v), suffix:"Share of time that doesn’t apply"
      })
    ),
    React.createElement("div", { style:grid2, className:"mt-2" },
      React.createElement(NumberField, {
        label:"Gross margin (0–1)", value:g.grossMargin, step:0.05,
        onChange:v=>update("grossMargin", v)
      }),
      React.createElement(NumberField, {
        label:"Delay factor (0–1)", value:g.delayFactor, step:0.05,
        onChange:v=>update("delayFactor", v), suffix:"Lost upside if you wait a quarter"
      })
    ),
    React.createElement("div", { style:grid2, className:"mt-2" },
      React.createElement(NumberField, {
        label:"Program cost — fixed ($/yr)", value:g.programCostFixed, step:100,
        onChange:v=>update("programCostFixed", v)
      }),
      React.createElement(NumberField, {
        label:"Program cost — per user ($/yr)", value:g.programCostPerUser, step:10,
        onChange:v=>update("programCostPerUser", v)
      })
    ),

    // Mode-specific
    mode==="Sales" && React.createElement(React.Fragment, null,
      React.createElement("h4", null, "Sales"),
      React.createElement("div", { style:grid },
        React.createElement(NumberField, { label:"Avg deal size ($)", value:g.sales.avgDealSize, step:1000, onChange:v=>update("sales.avgDealSize", v) }),
        React.createElement(NumberField, { label:"Deals per rep (yr)", value:g.sales.dealsPerRepPerYear, step:1, onChange:v=>update("sales.dealsPerRepPerYear", v) }),
        React.createElement("div")
      )
    ),
    mode==="CS" && React.createElement(React.Fragment, null,
      React.createElement("h4", null, "Customer Success / Support"),
      React.createElement("div", { style:grid },
        React.createElement(NumberField, { label:"Tickets per person per month", value:g.cs.ticketsPerPersonPerMonth, step:10, onChange:v=>update("cs.ticketsPerPersonPerMonth", v) }),
        React.createElement(NumberField, { label:"Avg days open per ticket", value:g.cs.avgDaysOpen, step:0.1, onChange:v=>update("cs.avgDaysOpen", v) }),
        React.createElement(NumberField, { label:"Cost per ticket per open day ($)", value:g.cs.costPerTicketOpenDay, step:1, onChange:v=>update("cs.costPerTicketOpenDay", v) })
      ),
      React.createElement("div", { style:grid2 },
        React.createElement(NumberField, { label:"Accounts per CSM", value:g.cs.accountsPerCSM, step:1, onChange:v=>update("cs.accountsPerCSM", v) }),
        React.createElement(NumberField, { label:"ARR per account ($)", value:g.cs.arrPerAccount, step:1000, onChange:v=>update("cs.arrPerAccount", v) })
      )
    ),
    mode==="Production" && React.createElement(React.Fragment, null,
      React.createElement("h4", null, "Production / Engineering"),
      React.createElement("div", { style:grid },
        React.createElement(NumberField, { label:"Engineer cost per day ($)", value:g.prod.engCostPerDay, step:50, onChange:v=>update("prod.engCostPerDay", v) }),
        React.createElement(NumberField, { label:"Downtime cost per hour ($)", value:g.prod.costPerHourDowntime, step:10000, onChange:v=>update("prod.costPerHourDowntime", v) }),
        React.createElement(NumberField, { label:"Annual downtime hours (baseline)", value:g.prod.downtimeHoursAnnual, step:1, onChange:v=>update("prod.downtimeHoursAnnual", v) })
      ),
      React.createElement("div", { style:grid2 },
        React.createElement(NumberField, { label:"Preventable share (0–1)", value:g.prod.preventableShare, step:0.05, onChange:v=>update("prod.preventableShare", v) }),
        React.createElement(NumberField, { label:"Avoidance factor per +1.0 lift (0–1)", value:g.prod.downtimeAvoidanceFactor, step:0.05, onChange:v=>update("prod.downtimeAvoidanceFactor", v) })
      ),
      React.createElement(NumberField, { label:"Team-days saved per +1.0 lift", value:g.prod.daysSavedPerLift, step:5, onChange:v=>update("prod.daysSavedPerLift", v) })
    ),

    React.createElement("div", { style:{marginTop:12, display:"flex", gap:8} },
      React.createElement("button", { onClick: reset }, "Reset to defaults")
    )
  );
}

/* ---------- App ---------- */
export default function App() {
  const [snap, set] = useStore();
  const cfg = window.__CONFIG || {};
  const data = window.__DATA || {};
  const modes = (cfg.modes && cfg.modes.modes) || ["Sales","CS","Production"];
  const skillsCfg = cfg.skills;

  // cohort in mode
  const peopleInMode = (data.hris||[]).filter(p => p.org_unit === (snap.mode==="Production" ? "Production" : snap.mode));
  const regions = Array.from(new Set(peopleInMode.map(p => p.region))).filter(Boolean).sort();
  const persons = peopleInMode.map(p => ({ id:p.person_id, name:p.name || p.person_id, region:p.region||"" }));

  // keep keys valid
  React.useEffect(() => {
    if (snap.cohortType === "Person" && (!snap.cohortKey || !persons.find(p=>p.id===snap.cohortKey))) {
      set({ cohortKey: persons[0]?.id || "" });
    }
    if (snap.cohortType === "Region" && (!snap.cohortKey || !regions.includes(snap.cohortKey))) {
      set({ cohortKey: regions[0] || "" });
    }
  }, [snap.mode, snap.cohortType]);

  const personIds = cohortPersonIds(snap.mode, data, snap.cohortType, snap.cohortKey);
  const teamSize = snap.cohortType === "Person" ? 1 : personIds.length;

  const { labels, targets, ids } = idealPersona(snap.mode, skillsCfg);
  const currentSkills = skillScoresForCohort(snap.mode, skillsCfg, data, personIds);
  const gaps = performanceGaps(currentSkills, targets, ids, labels);

  const cohort = sampleCohort(snap.mode, skillsCfg, 7, 120);
  const influence = influenceScores(labels, cohort);

  // LRS training leverage (0..5 per skill)
  const leverageMap = leverageForCohort(snap.mode, personIds, data);
  const leverageArray = ids.map(id => leverageMap[id] ?? 0);

  // content
  const contentDrivers = topContentDrivers(snap.mode, personIds, data, 5);
  const contentRecs = recommendContentForGaps(snap.mode, gaps, personIds, data, 2);

  // ROI/COI — cohort-aware + assumptions
  const [assumptions, setAssumptions] = React.useState(defaultAssumptions);
  const primaryKpi = primaryKpiLabel(snap.mode);
  const cohortKpiVal = kpiForCohort(snap.mode, data, personIds);
  const recos = rankRecommendations({ mode: snap.mode, gaps, influence, data });
  const roi = computeROI({ mode: snap.mode, recos, teamSize, assumptions });

  const fmt = n => (typeof n === "number" ? n.toLocaleString() : n);

  /* charts */
  function renderIRP(el){
    const a = dsActual(), t = dsTarget(), tr = dsTraining();
    renderRadar(el, labels, [
      { label: "Ideal Persona (Target)", data: targets, backgroundColor:t.fill, borderColor:t.line, borderWidth:2, pointRadius:2, order:1 },
      { label: "Training Impact (LRS)", data: leverageArray, backgroundColor:tr.fill, borderColor:tr.line, borderWidth:3, borderDash:[8,6], pointRadius:2, order:2 },
      { label: "Current (Cohort Avg)", data: currentSkills, backgroundColor:a.fill, borderColor:a.line, borderWidth:2, pointRadius:2, order:3 }
    ]);
  }
  function renderInfluence(el){
    const i = dsInfluence(), tr = dsTraining();
    renderRadar(el, labels, [
      { label: `${primaryKpi} Influence`, data: influence.map(i=>i.score0to5), backgroundColor:i.fill, borderColor:i.line, borderWidth:2, pointRadius:2, order:1 },
      { label: "Training Impact (LRS)", data: leverageArray, backgroundColor:tr.fill, borderColor:tr.line, borderWidth:3, borderDash:[8,6], pointRadius:2, order:2 }
    ]);
  }
  function renderPerformance(el){
    const a = dsActual(), t = dsTarget(), tr = dsTraining();
    renderRadar(el, labels, [
      { label: "Target", data: targets, backgroundColor:t.fill, borderColor:t.line, borderWidth:2, pointRadius:2, order:1 },
      { label: "Training Impact (LRS)", data: leverageArray, backgroundColor:tr.fill, borderColor:tr.line, borderWidth:3, borderDash:[8,6], pointRadius:2, order:2 },
      { label: "Actual (Cohort Avg)", data: currentSkills, backgroundColor:a.fill, borderColor:a.line, borderWidth:2, pointRadius:2, order:3 }
    ]);
  }

  // tables
  const gapRows = gaps.map(g => ({
    Skill: g.label,
    Actual: g.actual.toFixed(1),
    Target: g.target.toFixed(1),
    Gap: `+${g.gap.toFixed(1)}`,
    Training: (leverageMap[g.id] ?? 0).toFixed(1)
  })).slice(0,5);

  const drillCols = ["Person","KPI"].concat(labels);
  const drillRows = personIds.slice(0,50).map(pid => {
    const p = persons.find(x=>x.id===pid);
    const s = skillScoresForPerson(snap.mode, skillsCfg, pid, data);
    const k = kpiForPerson(snap.mode, data, pid);
    const row = { Person: p?.name || pid, KPI: k };
    labels.forEach((lab, i) => row[lab] = s[i].toFixed(1));
    return row;
  });

  return React.createElement("div", { className:"wrap" },

    /* hero */
    React.createElement("div", { className:"hero" },
      React.createElement("h1", null, "Transform Enablement from Cost Center to Growth Engine"),
      React.createElement("p", null, "Zero‑custody • KPI‑first • Built for C‑levels")
    ),

    /* controls */
    React.createElement("header", null,
      React.createElement("div", { className:"brand" },
        React.createElement("span", { className:"badge" }, "CPO OS"),
        React.createElement("div", null,
          React.createElement("h2", null, "Demo Simulator"),
          React.createElement("div", { className:"tag" }, "Persona → Influence → Performance → ROI")
        )
      ),
      React.createElement("div", null,
        React.createElement("select", { value: snap.mode, onChange: e => set({ mode: e.target.value, cohortType: "All", cohortKey: "" }) },
          modes.map(m => React.createElement("option", { key:m, value:m }, m))
        ), " ",
        React.createElement("select", { value: snap.cohortType, onChange: e => set({ cohortType: e.target.value, cohortKey: "" }) },
          ["All","Region","Person"].map(c => React.createElement("option",{key:c,value:c},c))
        ),
        (() => {
          if (snap.cohortType==="Region" && regions.length) {
            return React.createElement(React.Fragment, null, " ",
              React.createElement("select", {
                value: snap.cohortKey || regions[0],
                onChange: e => set({ cohortKey: e.target.value })
              }, regions.map(r => React.createElement("option",{key:r,value:r},r)))
            );
          }
          if (snap.cohortType==="Person" && persons.length) {
            return React.createElement(React.Fragment, null, " ",
              React.createElement("select", {
                value: snap.cohortKey || persons[0]?.id || "",
                onChange: e => set({ cohortKey: e.target.value })
              }, persons.map(p => React.createElement("option",{key:p.id,value:p.id},p.name)))
            );
          }
          return null;
        })(), " ",
        React.createElement("button", { onClick: () => set({ seed: (snap.seed + 1) % 1000000 }) }, "Regenerate"), " ",
        React.createElement("button", { onClick: () => set({ seed: 42 }) }, "Reset")
      )
    ),

    /* banner */
    React.createElement("div", { className:"roi-banner" },
      React.createElement("div", { className:"roi-row" },
        React.createElement("div", { className:"kpi negative" },
          React.createElement("h4", null, `Status‑Quo Cost (Annual COI) • Cohort: ${teamSize}`),
          React.createElement("div", { className:"big" }, "$", fmt(roi.coiAnnual)),
          React.createElement("div", { className:"sub" }, "Training waste, operational drag, and delay cost of doing nothing.")
        ),
        React.createElement("div", { className:"kpi positive" },
          React.createElement("h4", null, "Projected Annual Upside"),
          React.createElement("div", { className:"big" }, "$", fmt(roi.upsideAnnual)),
          React.createElement("div", { className:"sub" }, "Revenue gain or efficiency savings from prioritized actions.")
        ),
        React.createElement("div", { className:"kpi neutral" },
          React.createElement("h4", null, "Net Value • Year 1"),
          React.createElement("div", { className:"big" }, "$", fmt(roi.netAnnual)),
          React.createElement("div", { className:"sub" }, "After subtracting status‑quo cost. Conservative demo math.")
        ),
        React.createElement("div", { className:"kpi neutral" },
          React.createElement("h4", null, "Program Cost • Payback • ROI"),
          React.createElement("div", { className:"big" }, "$", fmt(roi.programCost), " • ", roi.paybackMonths, " mo • ", roi.roiPercent, "%"),
          React.createElement("div", { className:"sub" }, "Direct enablement investment and payback horizon.")
        )
      )
    ),

    /* assumptions */
    React.createElement(AssumptionsPanel, {
      mode: snap.mode,
      teamSize,
      onChange: (a)=> setAssumptions(a)
    }),

    /* three radars */
    React.createElement("div", { className:"grid-3" },
      React.createElement("div", { className:"card" },
        React.createElement("h3", null, `IRP vs Cohort (${primaryKpi} • Size: ${teamSize})`),
        React.createElement("div", { className:"muted", style:{marginBottom:8} }, `Cohort ${snap.cohortType}${snap.cohortKey?`: ${snap.cohortKey}`:""}. Current ${primaryKpi}: ${fmt(cohortKpiVal)}.`),
        React.createElement(RadarCanvas, { render: renderIRP })
      ),
      React.createElement("div", { className:"card" },
        React.createElement("h3", null, `Influence Radar — ${primaryKpi}`),
        React.createElement("div", { className:"muted", style:{marginBottom:8} }, "Skill → KPI strength with training overlay."),
        React.createElement(RadarCanvas, { render: renderInfluence })
      ),
      React.createElement("div", { className:"card" },
        React.createElement("h3", null, "Performance — Actual vs Target (+ Training)"),
        React.createElement(RadarCanvas, { render: renderPerformance })
      )
    ),

    /* gaps + content */
    React.createElement("div", { className:"grid-3", style:{marginTop:16} },
      React.createElement("div", { className:"card" },
        React.createElement("h3", null, "Gap Summary"),
        React.createElement(Table, { columns:["Skill","Actual","Target","Gap","Training"], rows: gapRows })
      ),
      React.createElement("div", { className:"card" },
        React.createElement("h3", null, "Recommended Content (for this cohort/person)"),
        contentRecs.length
          ? contentRecs.map(block =>
              React.createElement("div", { key:block.skill, style:{marginBottom:8} },
                React.createElement("strong", null, block.skill, ` (Gap +${block.gap.toFixed(1)})`),
                React.createElement("ul", null,
                  block.items.map(it =>
                    React.createElement("li", { key: it.content_id },
                      `${it.title} — ${it.type} • Expected skill lift: ${(it.expected_skill_lift*100).toFixed(0)}%`,
                      it.used ? ` • Current usage: ${it.used}` : ""
                    )
                  )
                )
              )
            )
          : React.createElement("div", { className:"muted" }, "No catalog items found for this mode.")
      ),
      React.createElement("div", { className:"card" },
        React.createElement("h3", null, "Top Content Drivers (Observed from LRS)"),
        React.createElement("ul", null,
          contentDrivers.map(c => React.createElement("li", { key:c.content_id },
            `${c.title} — ${c.type} • Skill: ${c.skill_id} • Used: ${c.used} • Driver: ${c.driver}`
          ))
        ),
        React.createElement("div", { className:"muted" }, "Driver = cohort usage × expected skill lift (synthetic).")
      )
    ),

    /* drilldown */
    React.createElement("div", { className:"card", style:{marginTop:16} },
      React.createElement("h3", null, "Cohort Drilldown"),
      React.createElement(Table, { columns: drillCols, rows: drillRows })
    )
  );
}
