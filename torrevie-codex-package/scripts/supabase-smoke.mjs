import { execFileSync } from "node:child_process";

const projectId = "torrevie-codex-package";
const containerName = `supabase_db_${projectId}`;

const output = execFileSync(
  "docker",
  ["exec", containerName, "psql", "-U", "postgres", "-d", "postgres", "-tAc", "select 'ok';"],
  { encoding: "utf8" }
).trim();

if (output !== "ok") {
  throw new Error("Supabase local database smoke test did not return the expected result.");
}

console.log("Supabase local database smoke test passed.");
