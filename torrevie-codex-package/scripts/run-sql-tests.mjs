import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const projectId = "torrevie-codex-package";
const containerName = `supabase_db_${projectId}`;
const testsDirectory = join(process.cwd(), "supabase", "tests");

const testFiles = readdirSync(testsDirectory)
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort();

if (testFiles.length === 0) {
  throw new Error("No SQL isolation tests were found.");
}

for (const fileName of testFiles) {
  const testPath = join(testsDirectory, fileName);
  const sql = readFileSync(testPath, "utf8");

  execFileSync("docker", [
    "exec",
    "-i",
    containerName,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    "-"
  ], {
    input: `\\echo Running ${fileName}\n${sql}`,
    stdio: ["pipe", "inherit", "inherit"]
  });
}

console.log("SQL isolation tests passed.");
