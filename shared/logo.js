/*
  Aegis One logo. The only brand artwork in the extension: icons/logo.svg (icons/logo.png is the raster copy
  used by the manifest). AegisLogo.img(height) returns an <img> tag, AegisLogo.url() the file's address, and
  AegisLogo.wordmark(height) the logo followed by the name.
*/
(function () {
  function url() {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) return chrome.runtime.getURL("icons/logo.svg");
    } catch (e) { /* not inside the extension (preview pages): use the relative path */ }
    return "../icons/logo.svg";
  }

  // The logo is 434 x 332, so the width follows the height. alt="" marks it as decoration when a text label sits beside it.
  function img(height = 48, opts = {}) {
    const alt = opts.alt === undefined ? "Aegis One" : opts.alt;
    const decorative = alt === "";
    return `<img class="aegis-logo" src="${url()}" alt="${alt}" height="${height}" style="height:${height}px;width:auto"${decorative ? ' aria-hidden="true"' : ""}>`;
  }

  function wordmark(height = 28) {
    return `<span class="aegis-wordmark" style="display:inline-flex;align-items:center;gap:8px;font-family:system-ui,sans-serif;font-weight:850;font-size:${height}px;letter-spacing:-0.05em;line-height:1;color:inherit">${img(Math.round(height * 1.1), { alt: "" })}Aegis<span style="color:#14b8a6">One</span></span>`;
  }

  window.AegisLogo = { img, url, wordmark };
})();
