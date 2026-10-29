// Aegis One background service worker (in-browser AI version).
// Answers "Ask Aegis" questions with Gemma running in Chrome on this computer's graphics chip (shared/ai.js ->
// offscreen/brain.html), or through Ollama if you pick that in the dashboard.
// Also loads background/tracking.js, which records each tab's trackers into aegisData.
// background/toolbar.js decides what the toolbar button opens (the rounded panel on a website, or Chrome's pop-up).
self.window = self; // shared/*.js attach themselves to window
importScripts("background/senders.js", "shared/settings.js", "shared/lists.js", "shared/cookies.js", "shared/example-data.js", "shared/data.js", "shared/gemma.js", "shared/ai.js", "shared/askc.js", "shared/policy.js", "shared/state-media.js", "shared/ipgeo.js", "shared/stats.js", "background/tracking.js", "background/alerts.js", "background/policy-reader.js", "background/stats.js", "background/toolbar.js", "background/frames.js", "background/clear-site.js");

// Download the public breach and data-broker lists: at startup and once a day.
// Whole files only; nothing about your browsing is sent (see shared/lists.js).
function refreshLists() { AegisLists.refresh().catch(e => console.warn("Aegis One: list refresh failed", e)); }
chrome.runtime.onInstalled.addListener((details) => {
  AegisLists.refresh({ force: true });
  // First install only: open the welcome page, which says what Aegis One records and sends (Chrome Web Store disclosure rule).
  if (details && details.reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("welcome/welcome.html") });
});
chrome.runtime.onStartup.addListener(refreshLists);
chrome.alarms.create("aegis-lists", { periodInMinutes: 24 * 60 });
chrome.alarms.onAlarm.addListener(a => { if (a.name === "aegis-lists") refreshLists(); });

// What Ask Aegis needs to answer. onToken (optional) receives Gemma's answer while it's being written (askc.js passes
// it on to Gemma, hiding a "What you can do" part the answer won't keep).
// history: the last few questions and answers from the Ask Aegis panel (Aegis's short memory).
function askDeps(onToken, signal, history) {
  return { load: AegisData.load, lists: AegisLists.load, atlas: () => ATLAS, signal,
           stats: async () => (await chrome.storage.local.get("aegisStats")).aegisStats,   // "What did Aegis do for me?"
           history, onToken,
           ask: AegisAI.ask };
}

// Speed: load Gemma before the first question (the dashboard and popup say they're open). At most once a minute,
// except right after Aegis's brain finishes downloading (force).
let lastWarm = 0;
function warmGemma(force) {
  if (!force && Date.now() - lastWarm < 60000) return;
  lastWarm = Date.now();
  AegisAI.warm(AegisAskC.SYSTEM_PROMPT);   // readies Ask Aegis's conversation, so only the question is left to read
}

// Streaming Ask Aegis (dashboard/ask-c.js): the answer appears word by word instead of all at the end.
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== "aegis-ask" || !fromAegisPage(port.sender)) return;
  let open = true;
  const hangUp = new AbortController();   // the Ask Aegis tab closed or gave up: stop Gemma so it's free again
  port.onDisconnect.addListener(() => { open = false; hangUp.abort(); });
  port.onMessage.addListener(msg => {
    if (!msg || msg.type !== "ask") return;
    const post = (m) => { if (open) try { port.postMessage(m); } catch (e) { open = false; } };
    post({ type: "start" });               // tells the panel streaming works, so it never asks twice
    AegisAskC.answer(msg.question, askDeps((piece, text) => post({ type: "token", text }), hangUp.signal, msg.history))
      .then(result => post({ type: "done", result }))
      .catch((e) => post({ type: "done", result: { error: (e && e.message) || "Aegis's brain isn't ready yet." } }));
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!fromAegis(sender)) return;
  if (msg && msg.type === "cookieChoice") {   // from content/c-events.js and content/cookie-detector.js
    updateCookieChoice(msg.domain, msg.choice);
    return;
  }
  if (!fromAegisPage(sender)) return;      // everything below reads your data or controls C: Aegis One's own pages only
  if (msg && msg.type === "askC") {
    AegisAskC.answer(msg.question, askDeps(null, null, msg.history))
      .then(sendResponse)
      .catch((e) => sendResponse({ error: (e && e.message) || "Aegis's brain isn't ready yet." }));
    return true; // keep the channel open for the async reply
  }
  if (msg && (msg.type === "aegis-warm" || msg.type === "aegis-tab-site")) warmGemma(msg.force === true);   // the popup asks for its tab's site when it opens
  if (msg && msg.type === "aegis-ai") {   // dashboard: Aegis's brain status, download, remove, Ollama/browser choice
    AegisAI.command(msg).then(sendResponse, (e) => sendResponse({ error: String((e && e.message) || e) }));
    return true;
  }
  if (msg && msg.type === "refreshLists") {
    AegisLists.refresh({ force: true }).then(l => sendResponse({ ok: true, breaches: Object.keys((l.hibp || {}).byDomain || {}).length, brokers: ((l.brokers || {}).list || []).length }));
    return true;
  }
});
