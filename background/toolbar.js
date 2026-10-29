// Aegis One's toolbar button (PLAN R10). Loaded by /background.js after shared/settings.js.
// Chrome draws an extension's pop-up window as a plain rectangle, and extensions can't change its shape. So on
// a website, clicking the button floats the same pop-up page over the page in a rounded panel instead
// (content/panel.js). Everywhere the panel can't go (Chrome's own pages, the Web Store, PDFs, a page showing a
// modal dialog), and when Settings > Toolbar pop-up is "Chrome's", Chrome's usual pop-up window opens. A website tab
// that was open before Aegis One was installed or reloaded gets the panel script added when you click the button.
(function () {
  const POPUP = "popup/popup.html";

  async function mode() {
    try { return (await AegisSettings.load()).toolbar; } catch (e) { return "panel"; }
  }

  // Chrome's own pop-up for this tab: set it for the tab, then open it. If Chrome can't open it right now,
  // it stays set, so the next click on this tab opens it the usual way.
  async function openWindow(tab) {
    try { await chrome.action.setPopup({ tabId: tab.id, popup: POPUP }); } catch (e) { return "none"; }
    try { await chrome.action.openPopup({ windowId: tab.windowId }); return "window"; } catch (e) { return "window-next-click"; }
  }

  const ask = (tab) => chrome.tabs.sendMessage(tab.id, { type: "aegis-panel" }, { frameId: 0 });

  async function click(tab) {
    if (!tab || typeof tab.id !== "number" || tab.id < 0) return "none";
    if ((await mode()) !== "window") {
      let r = null;
      try { r = await ask(tab); } catch (e) { r = null; }
      if (!r && chrome.scripting) {
        // Nothing answered: the panel isn't on this page yet (a tab open since before Aegis One was installed or
        // reloaded). You just clicked the button, so add only the panel script to that tab's top page and ask
        // again. Chrome's own pages and the Web Store refuse this, and get Chrome's window below.
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: ["content/panel.js"] });
          r = await ask(tab);
        } catch (e) { r = null; }
      }
      if (r && r.ok) return "panel";   // opened, or closed by this second click
    }
    return openWindow(tab);
  }

  // Back to "no pop-up set" for this tab, so its next click comes here and can try the rounded panel.
  function forget(tabId) {
    return chrome.action.setPopup({ tabId, popup: "" }).catch(() => {});
  }

  chrome.action.onClicked.addListener((tab) => { click(tab); });

  // A new page in the tab.
  if (chrome.webNavigation && chrome.webNavigation.onCommitted) {
    chrome.webNavigation.onCommitted.addListener((d) => { if (d.frameId === 0) forget(d.tabId); });
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    // The panel couldn't load Aegis One's page on that website.
    if (msg && msg.type === "aegis-panel-failed" && sender && sender.tab) openWindow(sender.tab);
    // The grade box on the page was clicked (content/grade-chip.js): open Aegis One like the toolbar button does.
    if (msg && msg.type === "aegis-open-panel" && sender && sender.tab) click(sender.tab);
    // The grade box asks for its site's grade: the same numbers the popup shows (never the sample data).
    if (msg && msg.type === "aegis-site-grade" && sender && sender.tab) {
      AegisData.load().then((d) => {
        const s = !d.sample && (d.sites || []).find((x) => x.domain === msg.domain && !x.example);
        reply(s ? { grade: s.grade, score: s.score, range: s.range } : null);
      }).catch(() => reply(null));
      return true;   // answers after loading
    }
  });

  // Settings switched back to the rounded panel: tabs that were using Chrome's window try the panel again.
  chrome.storage.onChanged.addListener((changes, area) => {
    const c = area === "local" && changes.aegisSettings;
    if (!c) return;
    const now = AegisSettings.merge(c.newValue).toolbar, was = AegisSettings.merge(c.oldValue).toolbar;
    if (now === "panel" && was !== "panel") {
      chrome.tabs.query({}).then((tabs) => { for (const t of tabs) forget(t.id); }).catch(() => {});
    }
  });

  self.AegisToolbar = { click, openWindow, forget };
})();
