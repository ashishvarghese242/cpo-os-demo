// app/main.js
import App from "./ui.js";

async function loadJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

async function bootstrap() {
  try {
    const [modes, kpis] = await Promise.all([
      loadJson("./config/modes.json"),
      loadJson("./config/kpis.json"),
    ]);

    window.__CONFIG = { modes, kpis };

    const rootEl = document.getElementById("root");
    const React = window.React;
    const ReactDOM = window.ReactDOM;

    ReactDOM.createRoot(rootEl).render(React.createElement(App));
  } catch (err) {
    const rootEl = document.getElementById("root");
    rootEl.innerHTML = `
      <div class="wrap">
        <div class="card">
          <h3>Could not start the demo</h3>
          <div class="muted">${(err && err.message) || err}</div>
          <div class="muted">Check that <code>/config/modes.json</code> and <code>/config/kpis.json</code> exist and are valid JSON.</div>
        </div>
      </div>
    `;
    console.error(err);
  }
}

bootstrap();
