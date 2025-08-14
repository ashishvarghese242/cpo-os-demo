// app/main.js
import App from "./ui.js";
import { loadAllData } from "../lib/dataLoader.js";

async function json(path){ const r = await fetch(path, { cache:"no-store" }); if(!r.ok) throw new Error(`${path} ${r.status}`); return r.json(); }

async function bootstrap() {
  try {
    const [modes, kpis, skillsSales, skillsCS, skillsProd, data, catalog] = await Promise.all([
      json("./config/modes.json"),
      json("./config/kpis.json"),
      json("./config/skills.sales.json"),
      json("./config/skills.cs.json"),
      json("./config/skills.prod.json"),
      loadAllData(),
      json("./data/content_catalog.json")
    ]);

    window.__CONFIG = { modes, kpis, skills: { sales: skillsSales, cs: skillsCS, prod: skillsProd } };
    window.__DATA = { ...data, content_catalog: catalog };

    const rootEl = document.getElementById("root");
    const { React, ReactDOM } = window;
    ReactDOM.createRoot(rootEl).render(React.createElement(App));
  } catch (e) {
    document.getElementById("root").innerHTML = `<div class="wrap"><div class="card"><h3>Startup error</h3><div class="muted">${e.message}</div></div></div>`;
    console.error(e);
  }
}
bootstrap();
