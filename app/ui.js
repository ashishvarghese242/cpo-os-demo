// app/ui.js
import { getState, setState, subscribe } from "./state.js";

const React = window.React;

function useStore() {
  const { useEffect, useState } = React;
  const [snap, setSnap] = useState(getState());
  useEffect(() => {
    const unsub = subscribe(setSnap);
    return unsub;
  }, []);
  return [snap, setState];
}

function Card({ title, children }) {
  return React.createElement(
    "div",
    { className: "card" },
    React.createElement("h3", { style:{margin:"0 0 8px 0"} }, title),
    children
  );
}

export default function App() {
  const { useMemo } = React;
  const [snap, set] = useStore();

  const cfg = window.__CONFIG || {};
  const modes = (cfg.modes && cfg.modes.modes) || ["Sales","CS","Production"];
  const kpisByMode = cfg.kpis || { Sales:["WinRate","ACV","Velocity"], CS:["NRR","TTFV","TTR","RenewalRate"], Production:["DeployFreq","LeadTime","ChangeFailure","MTTR"] };

  const kpiList = useMemo(() => kpisByMode[snap.mode] || [], [snap.mode, kpisByMode]);

  return React.createElement(
    "div",
    { className: "wrap" },
    React.createElement(
      "header",
      null,
      React.createElement("div", null,
        React.createElement("h2", { style:{margin:0} }, "CPO OS Demo"),
        React.createElement("div", { className:"muted" }, "Zero‑custody • KPI‑first • Modular")
      ),
      React.createElement("div", null,
        React.createElement("select", {
          value: snap.mode,
          onChange: e => set({ mode: e.target.value, selectedKpi: (kpisByMode[e.target.value]||[])[0] || "" })
        }, modes.map(m => React.createElement("option", { key:m, value:m }, m)))
      )
    ),

    React.createElement(Card, { title: "Current Settings" },
      React.createElement("div", { className:"muted", style:{marginBottom:8} }, "These values come from config files and in‑page state."),
      React.createElement("div", null, "Mode: ", React.createElement("strong", null, snap.mode)),
      React.createElement("div", null, "Available KPIs: ", kpiList.join(", ") || "—")
    ),

    React.createElement(Card, { title: "What’s next" },
      React.createElement("ul", null,
        React.createElement("li", null, "Add skills config files (five per mode, 0–5 targets)."),
        React.createElement("li", null, "Wire charts and calculators as separate modules."),
        React.createElement("li", null, "Publish updates via GitHub Pages automatically.")
      )
    )
  );
}

