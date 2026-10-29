// Wherever an icon stands for C (This week's "Aegis stepped in", Aegis's impact, the popup's "Ask Aegis why" button, the Ask Aegis
// button on every row), it shows the Aegis One logo (icons/logo.svg) from shared/logo.js. No mascot artwork is left.
// Run with: node --test
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

globalThis.window = globalThis;
require("../shared/logo.js");
require("../shared/icons.js");
const I = window.AegisIcons;

test("icon(\"c\") and tile(\"c\") draw the logo, hidden from screen readers (a text label always sits beside it)", () => {
  for (const html of [I.icon("c"), I.icon("c", 16), I.tile("c", "c", "sm"), I.tile("c", "c", "lg")]) {
    assert.match(html, /<img class="aegis-logo" src="[^"]*icons\/logo\.svg"/, "the logo file: " + html.slice(0, 80));
    assert.match(html, /aria-hidden="true"/, "decoration only");
    assert.ok(!/<svg/.test(html), "no drawn mascot");
  }
  assert.match(I.icon("c", 16), /height="16"/);
  assert.match(I.tile("c", "c", "sm"), /class="icon-tile tile-face tile-sm"/, "no orange square behind the logo");
});

test("the Ask Aegis button on each dashboard row uses the logo", () => {
  const noop = () => {};
  globalThis.document = { addEventListener: noop, removeEventListener: noop };
  globalThis.addEventListener = noop;
  require("../dashboard/explain.js");
  const b = window.AegisExplain.button("Who is Criteo?", "Criteo");
  assert.match(b, /class="ask-btn"/);
  assert.match(b, /icons\/logo\.svg/);
});

test("the logo stays visible in dark mode, and the logo tile has no colored square", () => {
  const css = read("shared/ui.css");
  assert.match(css, /\[data-theme="dark"\] \.aegis-logo \{[^}]*background: #fff/);
  assert.match(css, /\.icon-tile\.tile-face \{[^}]*background: var\(--fill\)/);
});

test("no mascot artwork or helper is left in the extension", () => {
  for (const gone of ["c-poses", "shared/mascot.js", "shared/c-ink.js", "content/c-contrast.js", "content/c-reaction-look.js", "icons/logo-mark.svg", "icons/icon16.png"]) {
    assert.ok(!fs.existsSync(path.join(__dirname, "..", gone)), gone + " is removed");
  }
  assert.ok(fs.existsSync(path.join(__dirname, "..", "icons/logo.svg")) && fs.existsSync(path.join(__dirname, "..", "icons/logo.png")));
  const manifest = JSON.parse(read("manifest.json"));
  assert.ok(!/mascot|c-poses|c-ink|c-contrast|reaction-look/.test(JSON.stringify(manifest)));
  for (const size of ["16", "32", "48", "128"]) assert.strictEqual(manifest.icons[size], "icons/logo.png");
});
