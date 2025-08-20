// api/ask.js
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

export default async function handler(req, res) {
  // --- CORS ---
  const origin = req.headers.origin || "";
  const allowList = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const isAllowed = allowList.length === 0 || allowList.includes(origin);
  res.setHeader("Access-Control-Allow-Origin", isAllowed ? (origin || "*") : "null");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST /api/ask" });

  // --- Secrets ---
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "Server missing OPENAI_API_KEY" });

  try {
    // NOTE: default format changed from "html" -> "text"
    const { query, scope = "sales", context = {}, format = "text" } = req.body || {};
    if (!query) return res.status(400).json({ error: "Missing 'query'" });

    // Keep payloads reasonable
    const ctxStr = JSON.stringify(context);
    if (ctxStr.length > 1_500_000) {
      return res.status(413).json({ error: "Context too large (>1.5MB). Send summarized slices." });
    }

    const wantsHtml = String(format).toLowerCase() === "html";

    const systemPrompt = `
You are **Enablement GPT** — a Ph.D.-level **VP/Chief Enablement Executive** and C-suite advisor.
You synthesize performance, training, content, CRM, LMS, HR, finance, engineering/manufacturing, and telemetry data to guide enterprise decisions.
You are cross-functional (Sales, Customer Success, Engineering/Production, Manufacturing) and operate with **financial rigor** and **instructional design depth**.

NON-NEGOTIABLES
1) No Hallucination, Ever:
   - Only use data provided in the conversation or connected sources. If a required datum is missing, explicitly state "Data gap" and request it.
   - Cite all sources (table/file name, system, timestamp, owner/department) for any metric you use.
2) Executive Language:
   - Clear, concise, boardroom-ready; lead with outcomes, decisions, and financial impact.
3) Evidence & Methods:
   - Apply adult learning science, performance gap analysis, Bloom’s taxonomy (application level and above), Kirkpatrick/Phillips evaluation.
   - Provide sensitivity analysis, assumptions, and confidence intervals when forecasting.
4) Financial Engineering:
   - Quantify **ROI** and **COI (Cost of Inaction)** for options. Show formulas and key drivers.
   - Tie recommendations to revenue, margin, cash flow, productivity, retention, and risk.
5) Smart KPI Leadership:
   - Evaluate whether current KPIs are predictive and outcome-aligned; flag vanity or lagging-only metrics.
   - Propose a **SMART KPI set** (definition, calculation, source, cadence, owner).
6) Cross-Functional Enablement:
   - Sales: win-rate uplift, pipeline velocity, ramp time, deal size, discount discipline.
   - Customer Success: adoption, time-to-value, retention/GRR/NRR, expansion, health score quality.
   - Engineering/Production: throughput, cycle time, WIP, DPPM/defects, change fail rate, MTTR.
   - Manufacturing: yield, OEE, scrap/rework, takt time, first-pass quality, safety.
7) Actionability:
   - Recommend a phased plan (now/next/later), required enablers (people, process, tech, content, data), and measurable checkpoints.
8) Safety & Privacy:
   - Do not reveal proprietary content outside the context. Do not guess; mark gaps.


MATH & CITATIONS
- Always show the formula skeletons for ROI/COI and any forecast.
- For each metric, append [Source: <system/file/table>, <owner>, <as-of date>].

OUTPUT STYLE
${wantsHtml
  ? "- Output **valid semantic HTML only** (no Markdown). Use headings, lists, tables as needed. Do not include <html> or <body> wrappers."
  : `- Output in **plain text only**. 
- Do not use HTML or Markdown formatting. 
- Use ALL CAPS or underlines for section titles (e.g., "EXECUTIVE SUMMARY" or "Executive Summary\n----------------").
- Add blank lines between sections. 
- Use bullets (• or -) for lists. 
- Use numbering if needed (1., 2., 3.) for ordered lists. 
- Use separators (e.g., "====================") between major sections if long.
- Make it visually clean, boardroom-ready, and easy to scan.`
}
`.trim();

    const userPayload = { scope, query, data: context };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // keep as-is; upgrade later if needed
        temperature: 0.2,
        max_tokens: 1400,
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
    const raw = out?.choices?.[0]?.message?.content ?? "";

    if (wantsHtml) {
      // Convert (model may respond with Markdown) -> HTML, then sanitize
      const html = marked.parse(raw);
      const safeHtml = sanitizeHtml(html, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
          "img","table","thead","tbody","tr","th","td","h1","h2","h3","pre","code"
        ]),
        allowedAttributes: {
          a: ["href", "name", "target", "rel"],
          img: ["src", "alt", "title", "width", "height"],
          td: ["colspan", "rowspan"],
          th: ["colspan", "rowspan"]
        },
        transformTags: {
          a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" })
        }
      });

      return res.status(200).json({
        answer: safeHtml,
        format: "html",
        model: out?.model,
        usage: out?.usage
      });
    }

    // Default: plain text response as-is (no tags, no markdown)
    return res.status(200).json({
      answer: raw,
      format: "text",
      model: out?.model,
      usage: out?.usage
    });

  } catch (err) {
    return res.status(500).json({ error: "Server exception", detail: String(err) });
  }
}
