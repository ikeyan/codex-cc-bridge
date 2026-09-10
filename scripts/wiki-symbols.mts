#!/usr/bin/env node
// Doc drift check: every code-like symbol the wiki names in backticks (camelCase or a call
// like `foo()`) must still exist in scripts/ or tests/. Four review rounds on PR #6 were
// about the wiki naming identifiers that a refactor had removed; this catches that class.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Vocabulary that is code-like but belongs to something other than this repo's scripts:
// Claude Code settings keys, codex app-server schema types, web platform error names.
const EXTERNAL = new Set([
  "AbortError",
  "TimeoutError",
  "ThreadStartResponse",
  "allowUnixSockets",
  "allowAllUnixSockets",
  "allowWrite",
  "allowRead",
  "denyRead",
  "blockReads",
  "blockReadsOutsideWorkingDirectories",
  "allowLocalBinding",
  "allowedDomains",
  "failIfUnavailable",
]);

function* files(dir: string, ext: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p, ext);
    else if (e.name.endsWith(ext)) yield p;
  }
}

let code = "";
for (
  const f of [
    ...files(path.join(root, "scripts"), ".mts"),
    ...files(path.join(root, "tests"), ".mjs"),
  ]
) {
  code += fs.readFileSync(f, "utf8");
}
const known = new Set(code.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);

const drift: string[] = [];
for (const f of files(path.join(root, "wiki"), ".md")) {
  const text = fs.readFileSync(f, "utf8");
  for (const m of text.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)(\(\))?`/g)) {
    const name = m[1];
    const codeLike = m[2] !== undefined || /[a-z][A-Z]/.test(name);
    if (!codeLike || EXTERNAL.has(name) || known.has(name)) continue;
    drift.push(`${path.relative(root, f)}: \`${name}\` is not in scripts/ or tests/`);
  }
}
if (drift.length > 0) {
  console.error(drift.join("\n"));
  process.exit(1);
}
console.log("wiki symbols: ok");
