#!/usr/bin/env node
// One-command verification: the mock test suite with the driver running under
// node, deno, and bun, both type checkers (deno check and tsc), deno fmt/lint,
// the wiki/ index+health check, and the REVIEW.md upstream-sync check.
// Run: `npm test` or `node scripts/check.mts`.
// The test harness itself always runs on node; only the driver-under-test is
// executed per runtime (that is the portability we ship).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

// plasma-wiki は pyproject.toml / uv.lock で固定した dev 依存。--frozen で lock どおりに実行する。
const UV_WIKI = ["uv", "run", "--frozen", "wiki"];
const UV_HINT = "uv が必要です (https://docs.astral.sh/uv/)";
// 既定のキャッシュ (~/.cache/uv) は Claude sandbox 内では書けず uv が起動時に落ちる。
// 中身は数個の pure-python wheel なので、常に TMPDIR 下に置いて環境差を無くす。
const UV_ENV = { UV_CACHE_DIR: path.join(os.tmpdir(), "codex-cc-bridge-uv-cache") };

// REVIEW.md は ikeyan/agent-files のコピー。frontmatter の `source:` (raw URL) を取って diff する。
// WARN が非空なら drift を警告に留める (CI の PR ジョブ用)。取得失敗と `source:` 欠落は必ず落とす。
// 各要素は省くと壊れる — 根拠は canon: facts/shell/{trap-exit-replaces-callers-handler,
// mktemp-tmpdir-handling-bsd-vs-gnu, and-or-list-left-associative, bsd-sed-block-one-liners}。
const reviewSync = `(f=$(mktemp -p "\${TMPDIR:-/tmp}"); trap 'rm -f "$f"' EXIT; ` +
  `curl -fsSL --connect-timeout 10 --max-time 60 --retry 2 --retry-connrefused ` +
  `"$(sed -n '/^source: /{s///p;q;}' REVIEW.md)" -o "$f" && ` +
  `{ diff -u "$f" REVIEW.md || { [ -n "$WARN" ] && echo 'REVIEW.md: 上流と違う'; }; })`;

const steps: Step[] = [
  { name: "test  driver=node", cmd: ["node", "--test", "tests/codex-turn.test.mjs"] },
  // The launch helper only ever runs under node (the skill says `node`), so no matrix.
  { name: "test  launch helper", cmd: ["node", "--test", "tests/codex-bridge.test.mjs"] },
  // fast-check over grammar-generated event streams (node only; spawns a driver per run).
  { name: "test  property", cmd: ["node", "--test", "tests/codex-turn.property.test.mjs"] },
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
  {
    name: "types deno check",
    cmd: [
      "deno",
      "check",
      "scripts/codex-turn.mts",
      "scripts/codex-bridge.mts",
      "scripts/check.mts",
      "scripts/wiki-symbols.mts",
      "scripts/guard.mts",
    ],
  },
  {
    name: "types tsc",
    cmd: [tsc, "-p", root],
    hint: "devDependencies が未インストールです: `bun install` か `npm install` を実行してください",
  },
  { name: "fmt   deno fmt", cmd: ["deno", "fmt", "--check"] },
  { name: "lint  deno lint", cmd: ["deno", "lint"] },
  // wiki/ の index と相互リンクは生成物: `wiki update` で作り直せる状態から
  // ずれていないかを --check で見る (書き込まない)。lint は desc 欠落・リンク切れ等。
  { name: "wiki  index drift", cmd: [...UV_WIKI, "update", "--check"], env: UV_ENV, hint: UV_HINT },
  { name: "wiki  lint", cmd: [...UV_WIKI, "lint"], env: UV_ENV, hint: UV_HINT },
  // wiki が名指しする識別子がコードに残っているか (リファクタ後の名前残りを捕まえる)。
  { name: "wiki  symbols", cmd: ["node", "scripts/wiki-symbols.mts"] },
  { name: "sync  REVIEW.md", cmd: ["sh", "-c", reviewSync] },
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
