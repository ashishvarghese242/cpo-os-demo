// app/boot/enablement-gpt.js
const { useEffect, useState } = window.React;
const ReactDOM = window.ReactDOM;

function EnablementGPTCard() {
  const [context, setContext] = useState(null);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [errorCtx, setErrorCtx] = useState("");
  const [q, setQ] = useState("Can you perform a gap analysis?");
  const [answer, setAnswer] = useState("");
  const [loadingAsk, setLoadingAsk] = useState(false);
  const [errorAsk, setErrorAsk] = useState("");
  const [used, setUsed] = useState([]);

  const PRESETS = [
    "Who are my top 3 performers?",
    "Which reps are below 70% in any KPI?",
    "What’s going on with my team’s performance?",
    "Give me 3 actions to lift win rate next month."
  ];

  // Load JSON context at mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingCtx(true);
      setErrorCtx("");
      try {
        const fetchJson = async (path) => {
          const r = await fetch(path);
          if (!r.ok) throw new Error(`${path} ${r.status}`);
          return r.json();
        };
        const sources = [
          "./data/crm.json",
          "./data/hris.json",
          "./data/lrs.json" // optional
        ];
        const results = await Promise.allSettled(sources.map(fetchJson));
        const ctx = {};
        const usedList = [];
        results.forEach((res, i) => {
          const name = sources[i];
          if (res.status === "fulfilled") {
            if (name.includes("crm")) ctx.crm = res.value;
            else if (name.includes("hris")) ctx.hris = res.value;
            else if (name.includes("lrs")) ctx.lrs = res.value;
            usedList.push(name);
          }
        });
        if (!cancelled) {
          setContext(ctx);
          setUsed(usedList);
          document.getElementById("gpt-status").textContent = "ready";
        }
      } catch (e) {
        if (!cancelled) {
          setErrorCtx(String(e.message || e));
          document.getElementById("gpt-status").textContent = "data error";
        }
      } finally {
        if (!cancelled) setLoadingCtx(false);
      }
    }
    load();
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
    document.getElementById("gpt-status").textContent = "thinking…";
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: "sales",
          query: q.trim(),
          context,
          format: "text" // we want clean plain text
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json?.error || `Request failed (${res.status})`;
        throw new Error(msg);
      }
      setAnswer(json?.answer || "");
      document.getElementById("gpt-status").textContent = "ready";
    } catch (err) {
      setErrorAsk(String(err.message || err));
      document.getElementById("gpt-status").textContent = "error";
    } finally {
      setLoadingAsk(false);
    }
  }

  function usePreset(p) {
    setQ(p);
    setAnswer("");
    setErrorAsk("");
  }

  async function copyOut() {
    try {
      await navigator.clipboard.writeText(answer || "");
    } catch {}
  }

  function clearOut() {
    setAnswer("");
    setErrorAsk("");
  }

  return window.React.createElement(
    "div",
    { className: "gpt-body-inner" },

    // Input row
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

    // Presets
    window.React.createElement(
      "div",
      { className: "gpt-presets" },
      ...PRESETS.map((p, i) =>
        window.React.createElement(
          "button",
          {
            key: i,
            type: "button",
            className: "gpt-chip",
            onClick: () => usePreset(p)
          },
          p
        )
      )
    ),

    // Data status / error
    errorCtx
      ? window.React.createElement(
          "div",
          { style: { color: "#b91c1c", fontSize: 13 } },
          "Could not load data context: ",
          errorCtx
        )
      : null,

    // Output box
    window.React.createElement(
      "div",
      { className: "gpt-out" },
      errorAsk
        ? `⚠️ ${errorAsk}`
        : (answer || "Ask a question to see results here.")
    ),

    // Footer
    window.React.createElement(
      "div",
      { className: "gpt-foot" },
      window.React.createElement(
        "div",
        null,
        "Data sources: ",
        used.length
          ? used.join(", ")
          : "loading…"
      ),
      window.React.createElement(
        "div",
        { className: "gpt-actions" },
        window.React.createElement("button", { type: "button", className: "gpt-action", onClick: copyOut }, "Copy"),
        window.React.createElement("button", { type: "button", className: "gpt-action", onClick: clearOut }, "Clear")
      )
    )
  );
}

(function mount() {
  const rootEl = document.getElementById("enablement-gpt");
  if (!rootEl) return;
  ReactDOM.createRoot(rootEl).render(window.React.createElement(EnablementGPTCard));
})();
