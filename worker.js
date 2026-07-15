// worker.js — Cloudflare Worker proxy for the Focus Ledger "Ask a tutor" feature.
//
// Why this exists: a plain webpage (like one hosted on GitHub Pages) can't safely
// call Anthropic's API directly — the API key would have to sit in the page's
// source code, where anyone could copy it. This tiny server sits in between:
// your browser sends it a chat history, it attaches your private API key,
// forwards the request to Anthropic, and hands the reply back. The key never
// touches the browser.
//
// ---- One-time setup ----
// 1. Sign up free at https://dash.cloudflare.com (Workers has a generous free tier).
// 2. Install Wrangler (Cloudflare's CLI): npm install -g wrangler
// 3. In a new folder, run: wrangler init focus-tutor-proxy   (choose "no" for extra scaffolding)
// 4. Replace the generated worker file's contents with this file.
// 5. Store your Anthropic API key as a secret (never paste it directly into this file):
//      wrangler secret put ANTHROPIC_API_KEY
//    Paste your key when prompted. Get a key at https://console.anthropic.com if needed.
// 6. Deploy: wrangler deploy
//    You'll get a URL like: https://focus-tutor-proxy.YOURNAME.workers.dev
// 7. Paste that URL into the "Settings" tab of the Focus Ledger app.
//
// ---- Security note ----
// ALLOWED_ORIGIN below is set to "*" (any site can call this worker) to keep setup
// simple. Once your app is live at its real GitHub Pages URL, tighten this to that
// exact URL (e.g. "https://yourusername.github.io") so random other sites can't
// piggyback on your API key.

const ALLOWED_ORIGIN = "*";
const MODEL = "claude-sonnet-5";
const SYSTEM_PROMPT =
  "You are a patient study tutor for a high school student preparing for math " +
  "competitions (AMC/AIME), USACO competitive programming, SAT, and a quant " +
  "finance project, plus whatever other courses they've listed. Never just hand " +
  "over a finished answer to a problem. Instead ask a guiding question, point to " +
  "the relevant concept, or work through the first step, then let the student try " +
  "the rest. If they ask a pure concept question (not a specific problem), a " +
  "direct clear explanation is fine. Keep responses under 150 words and encourage focus.";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Send a POST request with a messages array." }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "Server is missing ANTHROPIC_API_KEY. Run: wrangler secret put ANTHROPIC_API_KEY" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    let messages;
    try {
      const body = await request.json();
      messages = body.messages;
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error("messages must be a non-empty array");
      }
    } catch (err) {
      return new Response(JSON.stringify({ error: "Invalid request body: " + err.message }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    try {
      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 700,
          system: SYSTEM_PROMPT,
          messages: messages,
        }),
      });

      const data = await anthropicRes.json();
      return new Response(JSON.stringify(data), {
        status: anthropicRes.status,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Could not reach Anthropic API: " + err.message }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }
  },
};
