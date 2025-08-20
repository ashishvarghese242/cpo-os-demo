// app/boot/enablement-gpt.js
// Renders a simple EnablementGPT card into #enablement-gpt,
// loads your existing JSON (crm/hris/lrs), and calls /api/ask with a natural-language query.
// No client-side computations: GPT computes leaderboard/attainment from raw data.

const { useEffect, useState } = window.React;
const ReactDOM = window.ReactDOM;

function EnablementGPTCard() {
  const [context, setContext] = useState(null);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [errorCtx, setErrorCtx] = useState("");
  const [q, setQ] = useState("Who are my top 3 performers?");
  const [answer, setAnswer] = useState("");
  const [loadingAsk, setLoadingAsk] = useState(false);
  const [errorAsk, setErrorAsk] = useState("");

  // Load JSON context at mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingCtx(true);
      setErrorCtx("");
      try {
        const [crm, hris, lrs] = await Promise.all([
          fetch("./data/crm.json").then(r => {
            if (!r.ok) throw new Error(`crm.json ${r.status}`);
            return r.json();
          }),
          fetch("./data/hris.json").then(r => {
            if (!r.ok) throw new Error(`hris.json ${r.status}`);
            return r.json();
          }),
          fetch("./data/lrs.json").then(r => {
            if (!r.ok) throw new Error(`lrs.json ${r.status}`);
            return r.json();
          }).catch(() => null), // lrs is optional for first demo
        ]);

        if (!cancelled) {
          setContext({ crm, hris, ...(lrs ? { lrs } : {}) });
        }
      } catch (e) {
        if (!cancelled) setErrorCtx(String(e.message || e));
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
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: "sales",
          query: q.trim(),
          // Pass ONLY raw data; GPT will compute (attainment, leaderboard, etc.)
          context,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        const msg = json?.error || `Request failed (${res.status})`;
        throw new Error(msg);
      }

      const a = json?.answer || "";
      setAnswer(a);
    } catch (err) {
      setErrorAsk(String(err.message || err));
    } finally {
      setLoadingAsk(false);
    }
  }

  return window.React.createElement(
    "div",
    {
      style: {
        border: "1px solid var(--line)",
        borderRadius: "12px",
        padding: "16px",
        background: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      },
    },
    // Header
    window.React.createElement(
      "div",
      { style: { display: "flex", alignItems: "center", marginBottom: 8 } },
      window.React.createElement(
        "h2",
        { style: { margin: 0, fontSize: "18px" } },
        "EnablementGPT"
      ),
      window.React.createElement("span", { style: { marginLeft: "auto", fontSize: 12, color: "#6b7280" } },
        loadingCtx ? "loading data…" : errorCtx ? "data error" : "ready"
      )
    ),

    // Input Row
    window.React.createElement(
      "form",
      { onSubmit: onAsk, style: { display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 8 } },
      window.React.createElement("input", {
        type: "text",
        value: q,
        onChange: e => setQ(e.target.value),
        placeholder: "Who are my top 3 performers?",
        style: {
          padding: "10px 12px",
          border: "1px solid var(--line)",
          borderRadius: "10px",
          fontSize: "14px",
          outline: "none",
        },
      }),
      window.React.createElement("button", {
        type: "submit",
        disabled: loadingCtx || loadingAsk,
        style: {
          padding: "10px 14px",
          borderRadius: "10px",
          border: "1px solid var(--line)",
          background: loadingAsk ? "#f3f4f6" : "#111827",
          color: loadingAsk ? "#6b7280" : "#fff",
          cursor: loadingAsk ? "default" : "pointer",
          fontWeight: 600,
        },
      }, loadingAsk ? "Analyzing…" : "Ask")
    ),

    // Data status / error
    errorCtx
      ? window.React.createElement(
          "div",
          { style: { marginBottom: 8, color: "#b91c1c", fontSize: 13 } },
          "Could not load data context: ",
          errorCtx
        )
      : null,

    // Answer / error panel
    window.React.createElement(
      "div",
      {
        style: {
          border: "1px dashed var(--line)",
          borderRadius: "10px",
          padding: "12px",
          minHeight: "90px",
          background: "#f9fafb",
          whiteSpace: "pre-wrap",
          fontSize: "14px",
          lineHeight: 1.5,
          color: "#111827",
        },
      },
      errorAsk
        ? `⚠️ ${errorAsk}`
        : (answer || "Ask a question to see results here.")
    ),

    // “Data used” footnote
    window.React.createElement(
      "div",
      { style: { marginTop: 8, fontSize: 12, color: "#6b7280" } },
      "Data sources: ",
      window.React.createElement("code", null, "./data/crm.json"),
      ", ",
      window.React.createElement("code", null, "./data/hris.json"),
      ", ",
      window.React.createElement("code", null, "./data/lrs.json"),
      " (lrs optional)"
    )
  );
}

// Mount the card into #enablement-gpt
(function mount() {
  const rootEl = document.getElementById("enablement-gpt");
  if (!rootEl) return;
  ReactDOM.createRoot(rootEl).render(window.React.createElement(EnablementGPTCard));
})();
