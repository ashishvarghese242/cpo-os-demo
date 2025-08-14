// app/ui.js
import { getState, setState, subscribe } from "./state.js";
import { idealPersona, seededScores } from "../lib/compute.js";
import { renderRadar } from "../lib/charts.js";

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

function IdealPersonaRadar({ mode, seed }) {
  const { useEffect, useRef } = React;
  const canvasRef = useRef(null);
  const cfg = window.__CONFIG;
  const { labels, targets } = idealPersona(mode, cfg.skills);
  const actual = seededScores(labels.length, seed); // placeholder until we wire real scores

  useEffect(() => {
    if (!canvasRef.current) return;
    renderRadar(canvasRef.current, labels, [
      { label: "Ideal Persona (Target)", data: targets, backgroundColor:"rgba(124,58,237,0.15)", borderColor:"rgba(124,58,237,1)", borderWidth:2, pointRadius:2 },
      { label: "Current (Demo)", data: actual, backgroundColor:"rgba(17,24,39,0.20)", borderColor:"rgba(17,24,39,1)", borderWidth:2, pointRadius:2 }
    ]);
  }, [mode, seed, labels.join("|"), JSON.stringify(targets)]);

  return React.createElement("div", { style:{height:360} },
    React.createElement("canvas", { ref: canvasRef })
  );
}

export default function App() {
  const [snap, set] = useStore();
  const cfg = window.__CONFIG || {};
  const modes = (cfg.modes && cfg.modes.modes) || ["Sales","CS","Production"];
  const kpisByMode = cfg.kpis || { Sales:["WinRate","ACV","Velocity"], CS:["NRR","TTFV","TTR","RenewalRate"], Production:["DeployFreq","LeadTime","ChangeFailure","MTTR"] };
  const kpiList = (kpisByMode[snap.mode] || []);

  return React.createElement("div", { className:"wrap" },
    React.createElement("header", null,
      React.createElement("div", null,
        React.createElement("h2", { style:{margin:0} }, "CPO OS Demo"),
        React.createElement("div", { className:"muted" }, "Zero‑custody • KPI‑first • Modular")
      ),
      React.createElement("div", null,
        React.createElement("select", {
          value: snap.mode,
          onChange: e => set({ mode: e.target.value, selectedKpi: (kpisByMode[e.target.value]||[])[0] || "" })
        }, modes.map(m => React.createElement("option", { key:m, value:m }, m))),
        " ",
        React.createElement("button", { onClick: () => set({ seed: (snap.seed + 1) % 1000000 }) }, "Regenerate"),
        " ",
        React.createElement("button", { onClick: () => set({ seed: 42 }) }, "Reset")
      )
    ),

    React.createElement(Card, { title: "Current Settings" },
      React.createElement("div", { className:"muted", style:{marginBottom:8} }, "These values come from config files and in‑page state."),
      React.createElement("div", null, "Mode: ", React.createElement("strong", null, snap.mode)),
      React.createElement("div", null, "Available KPIs: ", kpiList.join(", ") || "—")
    ),

    React.createElement(Card, { title: "Ideal Persona Radar" },
      React.createElement(IdealPersonaRadar, { mode: snap.mode, seed: snap.seed })
    )
  );
}
