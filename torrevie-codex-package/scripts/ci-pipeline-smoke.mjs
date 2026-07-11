import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

const requiredSnippets = [
  "name: CI",
  "pull_request:",
  "push:",
  "- main",
  "name: Platform Gate",
  "timeout-minutes: 30",
  "permissions:",
  "contents: read",
  "concurrency:",
  "pnpm install --frozen-lockfile",
  "pnpm lint",
  "pnpm typecheck",
  "pnpm supabase:start",
  "pnpm supabase:reset",
  "pnpm test",
  "pnpm test:isolation",
  "pnpm build",
  "pnpm exec supabase stop --no-backup"
];

for (const snippet of requiredSnippets) {
  assert.ok(workflow.includes(snippet), `CI workflow is missing required snippet: ${snippet}`);
}

const orderedSteps = [
  "pnpm lint",
  "pnpm typecheck",
  "pnpm supabase:start",
  "pnpm supabase:reset",
  "pnpm test",
  "pnpm test:isolation",
  "pnpm build"
];

let lastIndex = -1;
for (const step of orderedSteps) {
  const index = workflow.indexOf(step);
  assert.ok(index > lastIndex, `CI workflow step is out of order: ${step}`);
  lastIndex = index;
}

console.log("CI pipeline smoke test passed.");
