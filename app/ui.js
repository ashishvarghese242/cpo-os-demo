// app/ui.js
import { getState, setState, subscribe } from "./state.js";
import { idealPersona, sampleCohort, skillScores, performanceGaps } from "../lib/compute.js";
import { renderRadar, dsActual, dsTarget, dsInfluence } from "../lib/charts.js";
import { influenceScores } from "../lib/influence.js";
import { rankRecommendations } from "../lib/reco.js";
import { computeROI } from "../lib/roi.js";

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

function RadarCanvas({ height=360, render }) {
  const { useEffect, useRef } = React;
  const ref = useRef(null);
  useEffect(() => { if (ref.current) render(ref.current); }, [render]);
  return React.createElement("div", { style:{height} }, React.createElement("canvas", { ref }));
}

export default function App() {
  const [snap, set] = useStore();
  const cfg = window.__CONFIG || {};
  const modes = (cfg.modes && cfg.modes.modes) || ["Sales","CS","Production"];
  const kpisByMode = cfg.kpis || { Sales:["WinRate","ACV","Velocity"], CS:["NRR","TTFV","TTR","RenewalRate"], Production:["DeployFreq","LeadTime","ChangeFailure","MTTR"] };
  const skillsCfg = cfg.skills;

  const { labels, targets, ids } = idealPersona(snap.mode, skillsCfg);
  const currentSkills = skillScores(snap.mode, skillsCfg, snap.seed);
  const gaps = performanceGaps(currentSkills, targets, ids, labels);

  const cohort = sampleCohort(snap.mode, skillsCfg, 7, 80);
  const influence = influenceScores(labels, cohort);
  const recos = rankRecommendations({ mode: snap.mode, gaps, influence });

  // chart renderers with theme colors
  function renderIdeal(el){
    const a = dsActual(), t = dsTarget();
    renderRadar(el, labels, [
      { label: "Ideal Persona (Target)", data: targets, backgroundColor:t.fill, borderColor:t.line, borderWidth:2, pointRadius:2 },
      { label: "Current (Demo)", data: currentSkills, backgroundColor:a.fill, borderColor:a.line, borderWidth:2, pointRadius:2 }
    ]);
  }
  function renderInfluence(el){
    const i = dsInfluence();
    renderRadar(el, labels, [
      { label: (snap.selectedKpi || "KPI") + " Influence", data: influence.map(i=>i.score0to5),
        backgroundColor:i.fill, borderColor:i.line, borderWidth:2, pointRadius:2 }
    ]);
  }
  function renderPerformance(el){
    const a = dsActual(), t = dsTarget();
    renderRadar(el, labels, [
      { label: "Target", data: targets, backgroundColor:t.fill, borderColor:t.line, borderWidth:2, pointRadius:2 },
      { label: "Actual", data: currentSkills, backgroundColor:a.fill, borderColor:a.line, borderWidth:2, pointRadius:2 }
    ]);
  }

  const kpiOptions = kpisByMode[snap.mode] || [];
  if (!kpiOptions.includes(snap.selectedKpi)) {
    set({ selectedKpi: kpiOptions[0] || "" });
  }

  const roi = computeROI({ mode: snap.mode, recos });
  const fmt = n => (typeof n === "number" ? n.toLocaleString() : n);

  return React.createElement("div", { className:"wrap" },

    // Hero strip (brand touch, Step 6)
    React.createElement("div", { className:"hero" },
      React.createElement("h1", null, "Transform Enablement from Cost Center to Growth Engine"),
      React.createElement("p", null, "Zero‑custody • KPI‑first • Built for C‑levels")
    ),

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
          onChange: e => set({ mode: e.target.value, selectedKpi: (kpisByMode[e.target.value]||[])[0] || "" })
        }, modes.map(m => React.createElement("option", { key:m, value:m }, m))),
        " ",
        React.createElement("select", {
          value: snap.selectedKpi,
          onChange: e => set({ selectedKpi: e.target.value })
        }, (kpiOptions).map(k => React.createElement("option", { key:k, value:k }, k))),
        " ",
        React.createElement("button", { onClick: () => set({ seed: (snap.seed + 1) % 1000000 }) }, "Regenerate"),
        " ",
        React.createElement("button", { onClick: () => set({ seed: 42 }) }, "Reset")
      )
    ),

    React.createElement(Card, { title: "Ideal Persona Radar" },
      React.createElement(RadarCanvas, { render: renderIdeal })
    ),

    React.createElement(Card, { title: `Influence Radar — ${snap.selectedKpi}` },
      React.createElement("div", { className:"muted", style:{marginBottom:8} }, "Which skills correlate most with the selected KPI (0–5 scaled)."),
      React.createElement(RadarCanvas, { render: renderInfluence })
    ),

    React.createElement(Card, { title: "Performance Radar — Actual vs Target" },
      React.createElement(RadarCanvas, { render: renderPerformance }),
      React.createElement("div", { className:"muted", style:{marginTop:8} },
        "Top gaps: ",
        gaps.slice(0,3).map(g => `${g.label} (+${g.gap})`).join(", ")
      )
    ),

    React.createElement(Card, { title: "Recommendations" },
      React.createElement("ul", null,
        recos.map(r =>
          React.createElement("li", { key:r.id },
            React.createElement("strong", null, r.label), " — ",
            r.title, " | Gap: ", r.gap,
            " | Influence: ", r.influence,
            " | Expected KPI lift: +", r.expectedKpiLift
          )
        )
      ),
      React.createElement("div", { className:"muted" }, "Demo math for lift; live product uses cohort‑based estimators.")
    ),

    React.createElement(Card, { title: "ROI / COI Overview" },
      React.createElement("div", null,
        React.createElement("div", null, "Total KPI Lift (sum of recos): ", roi.totalKpiLift.toFixed(2)),
        roi.revenueImpact ? React.createElement("div", null, "Revenue Impact: $", fmt(roi.revenueImpact)) : null,
        roi.costSavings ? React.createElement("div", null, "Cost Savings: $", fmt(roi.costSavings)) : null,
        React.createElement("div", null, "Loss of Productivity (COI): -$", fmt(roi.coiLoss)),
        React.createElement("hr", null),
        React.createElement("strong", null, "Net Impact: $", fmt(roi.netImpact))
      ),
      React.createElement("div", { className:"muted" }, "Adjust assumptions in /lib/roi.js for your audience.")
    )
  );
}
