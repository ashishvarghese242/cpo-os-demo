// app/main.js
import App from "./ui.js";
import { loadAllData } from "../lib/dataLoader.js";

// --- helper to load local JSON files (unchanged) ---
async function json(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

// --- Enablement GPT: fetch + render server-sanitized HTML ---
async function askEnablementGPT(query, context = {}, scope = "sales") {
  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, context, scope, format: "html" })
    });
    const data = await res.json();

    // Create a container if it doesn't exist
    let container = document.getElementById("enablement-gpt-result");
    if (!container) {
      container = document.createElement("div");
      container.id = "enablement-gpt-result";
      container.style.maxWidth = "960px";
      container.style.margin = "2rem auto";
      container.style.padding = "1rem";
      container.style.border = "1px solid #e5e7eb";
      container.style.borderRadius = "12px";
      container.style.background = "#fff";
      container.style.lineHeight = "1.6";
      document.body.appendChild(container);
    }

    // API already returns sanitized HTML
    container.innerHTML = data.answer || "<p>No response.</p>";
  } catch (err) {
    console.error(err);
    // Non-blocking UI hint
    const msg = document.createElement("div");
    msg.textContent = "Enablement GPT request failed. See console for details.";
    msg.style.color = "#b91c1c";
    msg.style.margin = "1rem auto";
    document.body.appendChild(msg);
  }
}

// expose so you can call it from anywhere (or browser console)
window.askEnablementGPT = askEnablementGPT;

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

    // Optional: make one sample call on load so you see formatted HTML immediately.
    // Change the query anytime or remove this line if you prefer manual calls.
    await askEnablementGPT("Executive summary: enablement impact on sales performance");
  } catch (e) {
    document.getElementById("root").innerHTML = `
      <div class="wrap">
        <div class="card">
          <h3>Startup error</h3>
          <div class="muted">${e.message}</div>
        </div>
      </div>`;
    console.error(e);
  }
}

bootstrap();
