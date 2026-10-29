// Who sent a message to the background (docs/STORE.md section 6, fix 4). Loaded first by /background.js.
// fromAegisPage: Aegis One's own pages (popup, dashboard, also the popup shown in the rounded panel on a website).
//   Only these may read your Aegis One data (Ask Aegis, which site a tab is on) or control Aegis's AI.
// fromAegis: also Aegis One's own scripts inside websites, which may only report what they saw (a cookie choice).
// Other extensions and websites can't message Aegis One at all (no "externally_connectable"); this is a second lock.
function fromAegis(sender) {
  return !!(sender && sender.id && sender.id === chrome.runtime.id);
}

function fromAegisPage(sender) {
  return fromAegis(sender) && typeof sender.url === "string" && sender.url.startsWith("chrome-extension://" + chrome.runtime.id + "/");
}
