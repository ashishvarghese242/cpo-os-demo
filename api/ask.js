// api/ask.js
export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || "";
  const allowList = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const isAllowed = allowList.length === 0 || allowList.includes(origin);
  res.setHeader("Access-Control-Allow-Origin", isAllowed ? origin : "null");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST /api/ask" });

  // Secrets
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "Server missing OPENAI_API_KEY" });

  try {
    const { query, scope = "sales", context = {} } = req.body || {};
    if (!query) return res.status(400).json({ error: "Missing 'query'" });

    // Keep payloads reasonable
    const ctxStr = JSON.stringify(context);
    if (ctxStr.length > 1_500_000) {
      return res.status(413).json({ error: "Context too large (>1.5MB). Send summarized slices." });
    }

    const systemPrompt = [
      "You are EnablementGPT — a consulting-grade analyst for Sales, CS, and Production.",
      "Answer ONLY with calculations and facts derived from the provided JSON context (HRIS, CRM, LRS, catalogs).",
      "If data is missing, explicitly state what’s missing and the minimal additional fields needed.",
      "Style: executive. Start with a short headline, then bullet insights. Be concise.",
      "Prioritize KPI-first reasoning (win rate, revenue, margins, cycle time, retention, defects).",
      "Never invent data or metrics not in context. No fluff."
    ].join(" ");

    // Pass the JSON slices your page already loaded from /data/*.json
    const userPayload = { scope, query, data: context };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
headers: {
  "Authorization": `Bearer ${OPENAI_API_KEY}`,
  "Content-Type": "application/json"
},

      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) }
        ]
      })
    });

    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: "Upstream error", detail });
    }

    const out = await r.json();
    const content = out?.choices?.[0]?.message?.content || "";
    return res.status(200).json({ answer: content, model: out?.model, usage: out?.usage });
  } catch (err) {
    return res.status(500).json({ error: "Server exception", detail: String(err) });
  }
}
