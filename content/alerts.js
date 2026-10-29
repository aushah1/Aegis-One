// Shows Aegis's foreign-adversary pop-up (Matthew's AegisPrompt.adversary) when the background says so.
// The look and wording of the pop-up live in content/c-prompt.js.
(function () {
  if (window.AegisAlerts) return;
  window.AegisAlerts = true;
  let shown = false;
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "aegis-adversary" || shown || !window.AegisPrompt) return;
    if (msg.domain && location.hostname.replace(/^www\./, "") !== msg.domain) return;
    shown = true;
    AegisPrompt.adversary({ companies: msg.companies });
  });
  try { chrome.runtime.sendMessage({ type: "aegis-get-adversary" }).catch(() => {}); } catch (e) { /* extension reloaded */ }
})();
