import { execFileSync } from "node:child_process";

const checks = ["test:auth", "test:tenant-context"];

for (const script of checks) {
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", "pnpm", script], { stdio: "inherit" });
  } else {
    execFileSync("pnpm", [script], { stdio: "inherit" });
  }
}

console.log("FSM Phase 0 login and tenant-flow smoke tests passed.");
