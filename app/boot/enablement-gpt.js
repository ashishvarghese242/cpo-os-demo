// app/boot/enablement-gpt.js
// Loads ALL data files under /data and calls /api/ask with a combined context.
// No user toggles; auto-trims lowest-priority datasets if payload nears 1.5MB.

const { useEffect, useState } = window.React;
const ReactDOM = window.ReactDOM;

const LIMIT_BYTES = 1_500_000; // matches your server guardrail
const PRIORITY = [
  "crm",              // must-have
  "hris",             // must-have
  "lrs",              // highly valuable
  "lms_lrs",          // secondary
  "cms",              // secondary
  "content_catalog",  // secondary
  "gong",             // low-priority
  "support"           // low-priority
];

function EnablementGPTCard() {
  const [context, setContext] = useState(null);
  const [used, setUsed] = useState([]);
  const [dropped, setDropped] = useState([]);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [errorCtx, setErrorCtx] = useState("");

  const [q, setQ] = useState("Can you perform a gap analysis?");
  const [answer, setAnswer] = useState("");
  const [loadingAsk, setLoadingAsk] = useState(false);
  const [errorAsk, setErrorAsk] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoadingCtx(true);
      setErrorCtx("");
      setDropped([]);
      try {
        const sources = {
          crm: "./data/crm.json",
          hris: "./data/hris.json",
          lrs: "./data/lrs.json",
          lms_lrs: "./data/lms_lrs.json",
          cms: "./data/cms.json",
          content_catalog: "./data/content_catalog.json",
          gong: "./data/gong.json",
          support: "./data/support.json",
        };

        // fetch all, but tolerate missing files
        const entries = await Promise.allSettled(
          Object.entries(sources).map(async ([key, path]) => {
            const r = await fetch(path);
            if (!r.ok) throw new Error(`${path} ${r.status}`);
            return [key, await r.json()];
          })
        );

        const loaded = {};
        const available = [];
        for (const res of entries) {
          if (res.status === "fulfilled") {
            const [key, data] = res.value;
            loaded[key] = data;
            available.push(key);
          }
        }

        // Build context and keep under LIMIT_BYTES by dropping low-priority datasets
        let current = {};
        let kept = [];
        let removed = [];

        for (const key of PRIORITY) {
          if (!(key in loaded)) continue;
          const test = { ...current, [key]: loaded[key] };
          const size = new TextEncoder().encode(JSON.stringify(test)).length;
          if (size <= LIMIT_BYTES) {
            current = test;
            kept.push(key);
          } else {
            removed.push(key);
          }
        }

        if (!cancelled) {
          setContext(current);
          setUsed(kept);
          setDropped(removed);
          const badge = document.getElementById("gpt-status");
          if (badge) badge.textContent = "ready";
        }
      } catch (e) {
        if (!cancelled) {
          setErrorCtx(String(e.message || e));
          const badge = document.getElementById("gpt-status");
          if (badge) badge.textContent = "data error";
        }
      } finally {
        if (!cancelled) setLoadingCtx(false);
      }
    }

    loadAll();
    return () => { cancelled = true; };
  }, []);

  async function onAsk(e) {
    e?.preventDefault?.();
    setErrorAsk("");
    setAnswer("");
    if (!q || !q.trim()) return;

    if (!context) {
      setErrorAsk("Data context not loaded yet. Please wait a moment and try again.");
      return;
    }

    setLoadingAsk(true);
    const badge = document.getElementById("gpt-status");
    if (badge) badge.textContent = "thinking…";

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: "sales",
          query: q.trim(),
          context,
          format: "text" // plain text output; no HTML/Markdown
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        const msg = json?.error || `Request failed (${res.status})`;
        throw new Error(msg);
      }
      setAnswer(json?.answer || "");
      if (badge) badge.textContent = "ready";
    } catch (err) {
      setErrorAsk(String(err.message || err));
      if (badge) badge.textContent = "error";
    } finally {
      setLoadingAsk(false);
    }
  }

  function copyOut() {
    if (!answer) return;
    try { navigator.clipboard.writeText(answer); } catch {}
  }
  function clearOut() { setAnswer(""); setErrorAsk(""); }

  return window.React.createElement(
    "div",
    null,
    // input row
    window.React.createElement(
      "form",
      { onSubmit: onAsk, className: "gpt-row" },
      window.React.createElement("input", {
        type: "text",
        value: q,
        onChange: e => setQ(e.target.value),
        placeholder: "Ask about Sales (e.g., “Who are my top 3 performers?”)",
        className: "gpt-input",
      }),
      window.React.createElement("button", {
        type: "submit",
        disabled: loadingCtx || loadingAsk,
        className: "gpt-btn",
      }, loadingAsk ? "Analyzing…" : "Ask")
    ),

    // status / errors
    errorCtx
      ? window.React.createElement("div", { style:{ color:"#b91c1c", fontSize:13, marginTop:6 }}, `Could not load data context: ${errorCtx}`)
      : null,

    // output
    window.React.createElement(
      "div",
      { className: "gpt-out", style:{ marginTop:8 } },
      errorAsk ? `⚠️ ${errorAsk}` : (answer || "Ask a question to see results here.")
    ),

    // footer: which sources included vs dropped
    window.React.createElement(
      "div",
      { className: "gpt-foot", style:{ marginTop:8 } },
      window.React.createElement(
        "div",
        null,
        "Included: ",
        used.length ? used.join(", ") : (loadingCtx ? "loading…" : "none"),
        dropped.length ? `  •  Trimmed: ${dropped.join(", ")}` : ""
      ),
      window.React.createElement(
        "div",
        { className: "gpt-actions" },
        window.React.createElement("button", { type:"button", className:"gpt-action", onClick: copyOut }, "Copy"),
        window.React.createElement("button", { type:"button", className:"gpt-action", onClick: clearOut }, "Clear")
      )
    )
  );
}

(function mount(){
  const rootEl = document.getElementById("enablement-gpt");
  if (!rootEl) return;
  ReactDOM.createRoot(rootEl).render(window.React.createElement(EnablementGPTCard));
})();
