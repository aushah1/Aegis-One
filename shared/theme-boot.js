// Paints the saved light/dark + glass/clean look (and glass color) before the page draws (no flash), then applies the real
// settings and follows the Mac switching between light and dark. Load right after shared/settings.js.
(function () {
  const el = document.documentElement;
  try {
    const look = JSON.parse(localStorage.getItem("aegisLook") || "null");
    if (look && look.theme) { el.dataset.theme = look.theme; el.dataset.style = look.style; if (look.tint) el.dataset.tint = look.tint; }
    else if (matchMedia("(prefers-color-scheme: dark)").matches) el.dataset.theme = "dark";
  } catch (e) { /* first visit */ }
  if (!window.AegisSettings) return;
  AegisSettings.load().then(AegisSettings.applyTheme);
  try {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => AegisSettings.load().then(AegisSettings.applyTheme));
  } catch (e) { /* older browsers */ }
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.aegisSettings) AegisSettings.applyTheme(AegisSettings.merge(c.aegisSettings.newValue)); });
  }
})();
