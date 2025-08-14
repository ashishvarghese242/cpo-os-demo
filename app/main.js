// app/main.js
import App from "./ui.js";

async function loadJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

async function bootstrap() {
  try {
    console.log("[CPO] main.js loaded");
    const [modes, kpis, skillsSales, skillsCS, skillsProd] = await Promise.all([
      loadJson("./config/modes.json"),
      loadJson("./config/kpis.json"),
      loadJson("./config/skills.sales.json"),
      loadJson("./config/skills.cs.json"),
      loadJson("./config/skills.prod.json"),
    ]);

    window.__CONFIG = {
      modes,
      kpis,
      skills: { sales: skillsSales, cs: skillsCS, prod: skillsProd }
    };

    const rootEl = document.getElementById("root");
    const React = window.React;
    const ReactDOM = window.ReactDOM;

    if (!React || !ReactDOM) throw new Error("React/ReactDOM not available");
    ReactDOM.createRoot(rootEl).render(React.createElement(App));
  } catch (err) {
    const rootEl = document.getElementById("root");
    rootEl.innerHTML = `
      <div class="wrap">
        <div class="card">
          <h3>Could not start the demo</h3>
          <div class="muted">${(err && err.message) || err}</div>
          <div class="muted">Check that all /config/*.json files exist.</div>
        </div>
      </div>`;
    console.error("[CPO] bootstrap error:", err);
  }
}

bootstrap();
