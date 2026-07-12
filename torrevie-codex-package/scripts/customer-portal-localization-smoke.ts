import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirForLocale, getMessages } from "../packages/localization/src/index";

const pageSource = readFileSync("apps/customer-portal/app/[locale]/page.tsx", "utf8");
const layoutSource = readFileSync("apps/customer-portal/app/[locale]/layout.tsx", "utf8");
const cssSource = readFileSync("apps/customer-portal/app/globals.css", "utf8");
const tokenSource = readFileSync("packages/ui/tokens.css", "utf8");

assert.equal(dirForLocale("en"), "ltr");
assert.equal(dirForLocale("ar"), "rtl");
assert.equal(getMessages("en").shell.title, "Work queue");
assert.equal(getMessages("ar").shell.title, "قائمة العمل");

assert.match(layoutSource, /lang=\{locale\}/);
assert.match(layoutSource, /dir=\{dirForLocale/);
assert.match(pageSource, /data-visual-check="customer-shell"/);
assert.match(pageSource, /\/logo\/torrevie_logo_color\.png/);
assert.match(pageSource, /from public\.opportunities/);
assert.doesNotMatch(pageSource, /crm_opportunities/);

assert.match(cssSource, /border-inline-start/);
assert.match(cssSource, /border-inline-end/);
assert.match(cssSource, /padding-inline/);
assert.doesNotMatch(cssSource, /margin-left|margin-right|padding-left|padding-right|border-left|border-right/);

for (const color of ["#162449", "#ffffff", "#0a0a0a", "#0d9488", "#4a6fa5", "#f2f4f7"]) {
  assert.match(tokenSource.toLowerCase(), new RegExp(color));
}

console.log("Customer portal localization smoke test passed.");
