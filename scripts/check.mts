#!/usr/bin/env node
// One-command verification: the mock test suite with the driver running under
// node, deno, and bun, plus both type checkers (deno check and tsc).
// Run: `npm test` or `node scripts/check.mts`.
// The test harness itself always runs on node; only the driver-under-test is
// executed per runtime (that is the portability we ship).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tsc = path.join(root, "node_modules", ".bin", "tsc");

interface Step {
  name: string;
  cmd: string[];
  env?: Record<string, string>;
  /** printed when the step cannot run at all (missing binary etc.) */
  hint?: string;
}

const steps: Step[] = [
  { name: "test  driver=node", cmd: ["node", "--test", "tests/codex-turn.test.mjs"] },
  {
    name: "test  driver=deno",
    cmd: ["node", "--test", "tests/codex-turn.test.mjs"],
    env: { CODEX_TURN_DRIVER_RUNTIME: "deno" },
    hint: "deno が必要です (https://deno.com)",
  },
  {
    name: "test  driver=bun",
    cmd: ["node", "--test", "tests/codex-turn.test.mjs"],
    env: { CODEX_TURN_DRIVER_RUNTIME: "bun" },
    hint: "bun が必要です (https://bun.sh)",
  },
  { name: "types deno check", cmd: ["deno", "check", "scripts/codex-turn.mts", "scripts/check.mts"] },
  {
    name: "types tsc",
    cmd: [tsc, "-p", root],
    hint: "devDependencies が未インストールです: `bun install` か `npm install` を実行してください",
  },
];

interface Result {
  step: Step;
  ok: boolean;
  detail: string;
}

const results: Result[] = [];
for (const step of steps) {
  if (step.cmd[0] === tsc && !fs.existsSync(tsc)) {
    results.push({ step, ok: false, detail: step.hint ?? "tsc not found" });
    continue;
  }
  process.stdout.write(`\n=== ${step.name}: ${step.cmd.join(" ")}\n`);
  const r = spawnSync(step.cmd[0], step.cmd.slice(1), {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...step.env },
  });
  const ok = r.status === 0;
  const detail = r.error
    ? `${r.error.message}${step.hint ? ` — ${step.hint}` : ""}`
    : ok
      ? "ok"
      : `exit ${r.status}`;
  results.push({ step, ok, detail });
}

process.stdout.write("\n=== summary\n");
let failed = 0;
for (const { step, ok, detail } of results) {
  if (!ok) failed++;
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${step.name}${ok ? "" : `  (${detail})`}\n`);
}
process.exit(failed === 0 ? 0 : 1);
