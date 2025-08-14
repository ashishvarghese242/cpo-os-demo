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
import { computeROI } from "../lib/roi.js";
import { leverageForCohort, topContentDrivers, recommendContentForGaps } from "../lib/lrs.js";

const React = window.React;

function useStore() {
  const { useEffect, useState } = React;
  const [snap, setSnap] = useState(getState());
  useEffect(() => subscribe(setSnap), []);
  return [snap, setState];
}

function Card({ title, children }) {
  return React.createElement("div", { className:"card" },
    React.createElement("h3", { style:{margin:"0 0 8px 0"} }, title),
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

export default function App() {
  const [snap, set] = useStore();
  const cfg = window.__CONFIG || {};
  const data = window.__DATA || {};
  const modes = (cfg.modes && cfg.modes.modes) || ["Sales","CS","Production"];
  const skillsCfg = cfg.skills;

  // cohort selections
  const peopleInMode = (data.hris||[]).filter(p => p.org_unit === (snap.mode==="Production" ? "Production" : snap.mode));
  const regions = Array.from(new Set(peopleInMode.map(p => p.region))).filter(Boolean).sort();
  const persons = peopleInMode.map(p => ({ id:p.person_id, name:p.name || p.person_id, region:p.region||"" }));

  // guard cohort key
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

  // training leverage (0..5 per skill)
  const leverageMap = leverageForCohort(snap.mode, personIds, data);
  const leverageArray = ids.map(id => leverageMap[id] ?? 0);

  // content
  const contentDrivers = topContentDrivers(snap.mode, personIds, data, 5);
  const contentRecs = recommendContentForGaps(snap.mode, gaps, personIds, data, 2);

  // KPI + ROI — now cohort-aware
  const primaryKpi = primaryKpiLabel(snap.mode);
  const cohortKpiVal = kpiForCohort(snap.mode, data, personIds);
  const recos = rankRecommendations({ mode: snap.mode, gaps, influence, data });

  // pass teamSize so COI/ROI reflect current selection
  const roi = computeROI({ mode: snap.mode, recos, teamSize });

  const fmt = n => (typeof n === "number" ? n.toLocaleString() : n);

  // chart renderers — include training overlay
  function renderIRP(el){
    const a = dsActual(), t = dsTarget(), tr = dsTraining();
    renderRadar(el, labels, [
      { label: "Ideal Persona (Target)", data: targets,
        backgroundColor:t.fill, borderColor:t.line, borderWidth:2, pointRadius:2, order:1 },
      { label: "Training Impact (LRS)", data: leverageArray,
        backgroundColor:tr.fill, borderColor:tr.line, borderWidth:3, borderDash:[8,6], pointRadius:2, order:2 },
      { label: "Current (Cohort Avg)", data: currentSkills,
        backgroundColor:a.fill, borderColor:a.line, borderWidth:2, pointRadius:2, order:3 }
    ]);
  }
  function renderInfluence(el){
    const i = dsInfluence(), tr = dsTraining();
    renderRadar(el, labels, [
      { label: `${primaryKpi} Influence`, data: influence.map(i=>i.score0to5),
        backgroundColor:i.fill, borderColor:i.line, borderWidth:2, pointRadius:2, order:1 },
      { label: "Training Impact (LRS)", data: leverageArray,
        backgroundColor:tr.fill, borderColor:tr.line, borderWidth:3, borderDash:[8,6], pointRadius:2, order:2 }
    ]);
  }
  function renderPerformance(el){
    const a = dsActual(), t = dsTarget(), tr = dsTraining();
    renderRadar(el, labels, [
      { label: "Target", data: targets,
        backgroundColor:t.fill, borderColor:t.line, borderWidth:2, pointRadius:2, order:1 },
      { label: "Training Impact (LRS)", data: leverageArray,
        backgroundColor:tr.fill, borderColor:tr.line, borderWidth:3, borderDash:[8,6], pointRadius:2, order:2 },
      { label: "Actual (Cohort Avg)", data: currentSkills,
        backgroundColor:a.fill, borderColor:a.line, borderWidth:2, pointRadius:2, order:3 }
    ]);
  }

  // Gap summary rows
  const gapRows = gaps.map(g => ({
    Skill: g.label,
    Actual: g.actual.toFixed(1),
    Target: g.target.toFixed(1),
    Gap: `+${g.gap.toFixed(1)}`,
    Training: (leverageMap[g.id] ?? 0).toFixed(1)
  })).slice(0,5);

  // Drilldown rows
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

    /* ===== Hero ===== */
    React.createElement("div", { className:"hero" },
      React.createElement("h1", null, "Transform Enablement from Cost Center to Growth Engine"),
      React.createElement("p", null, "Zero‑custody • KPI‑first • Built for C‑levels")
    ),

    /* ===== Controls ===== */
    React.createElement("header", null,
      React.createElement("div", { className:"brand" },
        React.createElement("span", { className:"badge" }, "CPO OS"),
        React.createElement("div", null,
          React.createElement("h2", null, "Demo Simulator"),
          React.createElement("div", { className:"tag" }, "Persona → Influence → Performance → ROI")
        )
      ),
      React.createElement("div", null,
        React.createElement("select", {
          value: snap.mode,
          onChange: e => set({ mode: e.target.value, cohortType: "All", cohortKey: "" })
        }, modes.map(m => React.createElement("option", { key:m, value:m }, m))),
        " ",
        React.createElement("select", {
          value: snap.cohortType,
          onChange: e => set({ cohortType: e.target.value, cohortKey: "" })
        }, ["All","Region","Person"].map(c => React.createElement("option",{key:c,value:c},c))),
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
        })(),
        " ",
        React.createElement("button", { onClick: () => set({ seed: (snap.seed + 1) % 1000000 }) }, "Regenerate"),
        " ",
        React.createElement("button", { onClick: () => set({ seed: 42 }) }, "Reset")
      )
    ),

    /* ===== ROI/COI Banner — cohort-aware ===== */
    React.createElement("div", { className:"roi-banner" },
      React.createElement("div", { className:"roi-row" },
        React.createElement("div", { className:"kpi negative" },
          React.createElement("h4", null, `Status‑Quo Cost (Annual COI) • Cohort: ${teamSize}`),
          React.createElement("div", { className:"big" }, "$", fmt(roi.coiAnnual)),
          React.createElement("div", { className:"sub" }, "Training waste and delay cost of doing nothing, for this selection.")
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

    /* ===== Three radars, side by side ===== */
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

    /* ===== Gaps & Content ===== */
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

    /* ===== Drilldown ===== */
    React.createElement("div", { className:"card", style:{marginTop:16} },
      React.createElement("h3", null, "Cohort Drilldown"),
      React.createElement(Table, { columns: drillCols, rows: drillRows })
    )
  );
}
