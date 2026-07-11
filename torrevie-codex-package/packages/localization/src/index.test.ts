import assert from "node:assert/strict";
import { dirForLocale, getMessages, locales } from "./index.js";

const englishKeys = flattenKeys(getMessages("en"));

for (const locale of locales) {
  assert.deepEqual(flattenKeys(getMessages(locale)), englishKeys);
}

assert.equal(dirForLocale("en"), "ltr");
assert.equal(dirForLocale("ar"), "rtl");
assert.equal(getMessages("ar").shell.title, "قائمة العمل");

console.log("Localization tests passed.");

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") {
    return [prefix];
  }

  return Object.entries(value)
    .flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}
