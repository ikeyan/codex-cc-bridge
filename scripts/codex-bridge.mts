#!/usr/bin/env node
// codex-cc-bridge launch helpers: the mechanical half of the skill's launch recipe.
//
// The recipe has exactly one step that only Claude Code can do — starting the
// app-server as a `run_in_background` Bash task, so the harness owns its
// lifetime and TaskStop can reclaim it. Everything around that step is
// deterministic, so it lives here instead of as shell one-liners in SKILL.md:
// prose cannot be tested, and a mistyped regex or mktemp mode fails silently.
//
//   codex-bridge.mts init            -> create a private session dir holding the 0600
//                                       capability token; print the DIR
//   codex-bridge.mts ready DIR FILE  -> wait until the app-server in the background task
//                                       whose output is FILE is listening and /readyz
//                                       answers, publish the port as DIR/port, print it
//   codex-bridge.mts turn-context THREAD [TURN]
//                                    -> print the turn_context records codex wrote for that
//                                       thread (the server-side record of the model /
//                                       sandbox / approval policy each turn actually ran with)
//
// Between the two, start the server (see `init`'s printed hint). The DIR is the one
// value a session carries: the driver takes `--session DIR` and reads both files.

import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";

// Env override exists for tests (a stalled /readyz must be provable in seconds). Validated
// below once usage() exists: Infinity would poll forever, NaN/negative would time out at once.
const readyTimeoutEnv = process.env.CODEX_BRIDGE_READY_TIMEOUT_MS;
const READY_TIMEOUT_MS = readyTimeoutEnv === undefined || readyTimeoutEnv === ""
  ? 30_000
  : Number(readyTimeoutEnv);
const READYZ_FETCH_TIMEOUT_MS = 2_000;
const POLL_INTERVAL_MS = 250;
// The app-server prints its endpoint once it is bound. Port 0 means the OS picks a
// free port, so this banner is the only place the actual number appears.
const LISTENING_RE = /listening on: ws:\/\/127\.0\.0\.1:(\d+)/;

function usage(message?: string): never {
  if (message) console.error(`codex-bridge: ${message}`);
  console.error(
    "usage: codex-bridge.mts init\n" +
      "       codex-bridge.mts ready <session-dir> <background-task-output-file>\n" +
      "       codex-bridge.mts turn-context <thread-id> [turn-id]",
  );
  process.exit(2);
}

function fail(message: string): never {
  console.error(`codex-bridge: ${message}`);
  process.exit(1);
}

if (!(Number.isFinite(READY_TIMEOUT_MS) && READY_TIMEOUT_MS > 0)) {
  usage(`CODEX_BRIDGE_READY_TIMEOUT_MS must be a positive number of ms, got ${readyTimeoutEnv}`);
}

/** POSIX single-quoting: the only escaping that survives every shell the hint may be pasted into. */
const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/** Capability token for `codex app-server --ws-auth capability-token`, in a fresh private dir. */
function init(): void {
  // 0700 dir (mkdtemp) + 0600 file: the token is the only thing standing between a
  // local process and a resident server that can run commands.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-bridge-"));
  const tokenFile = path.join(dir, "token");
  fs.writeFileSync(tokenFile, randomBytes(32).toString("hex"), { mode: 0o600 });
  console.log(dir);
  console.error(
    "next: start the app-server as a run_in_background Bash task (never with `&`, or\n" +
      "TaskStop cannot reclaim it), then run `codex-bridge.mts ready` with its output file:\n" +
      `  codex app-server --listen "ws://127.0.0.1:0" --ws-auth capability-token --ws-token-file ${
        shellQuote(tokenFile)
      }\n` +
      `  node codex-bridge.mts ready ${shellQuote(dir)} <that task's output file>`,
  );
}

async function readyz(port: string): Promise<boolean> {
  try {
    // Bounded: a server that accepts the TCP connection but never answers must not
    // pin the poll loop past READY_TIMEOUT_MS.
    const r = await fetch(`http://127.0.0.1:${port}/readyz`, {
      signal: AbortSignal.timeout(READYZ_FETCH_TIMEOUT_MS),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Wait for the server to bind and answer, then publish and print the port it got. */
async function ready(dir: string, outputFile: string): Promise<void> {
  if (!fs.existsSync(path.join(dir, "token"))) {
    usage(`${dir} is not a session dir (no token file; use the dir printed by init)`);
  }
  const portFile = path.join(dir, "port");
  // One server per dir: rebinding would silently retarget every driver call that
  // holds this dir. A new server gets a new init.
  if (fs.existsSync(portFile)) {
    fail(
      `${dir} is already bound (port ${
        fs.readFileSync(portFile, "utf8").trim()
      }); run init for a new server`,
    );
  }
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let port: string | undefined;
  while (Date.now() < deadline) {
    if (port === undefined) {
      // The task's output file may not exist yet in the first moments.
      let text = "";
      try {
        text = fs.readFileSync(outputFile, "utf8");
      } catch { /* not created yet */ }
      port = LISTENING_RE.exec(text)?.[1];
      if (port === undefined && /^\[exited with code /m.test(text)) {
        fail(`the app-server exited before it started listening. Its output:\n${text.trim()}`);
      }
      if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) {
        fail(`banner port ${port} is not a TCP port`);
      }
    }
    if (port !== undefined && await readyz(port)) {
      // Publish only after readiness, atomically AND exclusively: a driver must never read
      // a half-written or not-yet-ready port, and two concurrent `ready` calls on one dir
      // must not both win. link(2) fails with EEXIST if the port file already exists (rename
      // would silently replace it), so the first publisher wins and the other fails loudly.
      const tmp = `${portFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, `${port}\n`, { mode: 0o600 });
      try {
        fs.linkSync(tmp, portFile);
      } catch (e) {
        fs.unlinkSync(tmp);
        if ((e as { code?: string }).code === "EEXIST") {
          fail(
            `${dir} was bound by a concurrent ready (port ${
              fs.readFileSync(portFile, "utf8").trim()
            }) while this one waited for ${port}; run init for a new server`,
          );
        }
        throw e;
      }
      fs.unlinkSync(tmp);
      console.log(port);
      return;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  fail(
    port === undefined
      ? `no "listening on:" line in ${outputFile} after ${
        READY_TIMEOUT_MS / 1000
      }s (is it the app-server task's output file?)`
      : `port ${port} never answered /readyz within ${READY_TIMEOUT_MS / 1000}s`,
  );
}

// --- turn-context -------------------------------------------------------------
// codex writes one rollout jsonl per thread under $CODEX_HOME/sessions/<y>/<m>/<d>/.
// The file name carries a UUID that is NOT reliably the thread id (canon), so the thread
// is matched structurally: the first record is session_meta and its payload.id is the
// thread id. turn_context records then carry what each turn actually ran with.
const codexHome = process.env.CODEX_HOME ?? path.join(process.env.HOME ?? "", ".codex");

function* rolloutFiles(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* rolloutFiles(p);
    else if (e.isFile() && /^rollout-.*\.jsonl$/.test(e.name)) yield p;
  }
}

interface RolloutMeta {
  id?: string;
  /** Set on subagent threads, e.g. the child review/start runs the review in. */
  parent_thread_id?: string;
  source?: unknown;
}
/** A rollout's first record (session_meta) payload, or undefined when it is not one. */
function rolloutMeta(file: string): RolloutMeta | undefined {
  const fd = fs.openSync(file, "r");
  try {
    // session_meta is the first line and can be large (it embeds base_instructions, whose
    // size is unbounded), so read chunk by chunk until the first newline or EOF rather than
    // through a fixed window.
    const chunks: Buffer[] = [];
    let line: Buffer | undefined;
    let pos = 0;
    while (line === undefined) {
      const chunk = Buffer.alloc(64 * 1024);
      const n = fs.readSync(fd, chunk, 0, chunk.length, pos);
      if (n === 0) return undefined; // EOF without a newline: not a complete record
      const nl = chunk.subarray(0, n).indexOf(0x0a);
      if (nl >= 0) {
        chunks.push(chunk.subarray(0, nl));
        line = Buffer.concat(chunks);
      } else {
        chunks.push(chunk.subarray(0, n));
        pos += n;
      }
    }
    const rec = JSON.parse(line.toString("utf8"));
    return rec?.type === "session_meta" ? rec.payload : undefined;
  } catch {
    return undefined;
  } finally {
    fs.closeSync(fd);
  }
}

function turnContextsIn(rollout: string, turnId?: string): unknown[] {
  const contexts: unknown[] = [];
  let unparsable = 0;
  for (const line of fs.readFileSync(rollout, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let rec: { type?: string; payload?: { turn_id?: string } };
    try {
      rec = JSON.parse(line);
    } catch {
      unparsable++; // a record still being written, or a truncated tail
      continue;
    }
    if (rec.type !== "turn_context") continue;
    if (turnId !== undefined && rec.payload?.turn_id !== turnId) continue;
    contexts.push(rec.payload);
  }
  if (unparsable > 0) {
    console.error(`codex-bridge: skipped ${unparsable} unparsable line(s) in ${rollout}`);
  }
  return contexts;
}

function turnContext(threadId: string, turnId?: string): void {
  const sessions = path.join(codexHome, "sessions");
  const own: string[] = [];
  // review/start runs the review in a subagent child thread whose rollout carries the
  // turn_context (the parent's has none), so children are part of the answer.
  const children: { threadId: string; rollout: string; source: unknown }[] = [];
  for (const f of rolloutFiles(sessions)) {
    const meta = rolloutMeta(f);
    if (meta?.id === threadId) own.push(f);
    else if (meta?.parent_thread_id === threadId && meta.id) {
      children.push({ threadId: meta.id, rollout: f, source: meta.source ?? null });
    }
  }
  if (own.length === 0) fail(`no rollout under ${sessions} has session_meta.id ${threadId}`);
  if (own.length > 1) {
    fail(`ambiguous: ${own.length} rollouts claim thread ${threadId}:\n${own.join("\n")}`);
  }
  const rollout = own[0];
  const result = {
    rollout,
    turnContexts: turnContextsIn(rollout, turnId),
    children: children.map((c) => ({ ...c, turnContexts: turnContextsIn(c.rollout, turnId) })),
  };
  const total = result.turnContexts.length +
    result.children.reduce((n, c) => n + c.turnContexts.length, 0);
  if (turnId !== undefined && total === 0) {
    fail(
      `neither ${rollout} nor its ${children.length} child rollout(s) has a turn_context for turn ${turnId}`,
    );
  }
  console.log(JSON.stringify(result, null, 2));
}

const { positionals } = (() => {
  try {
    return parseArgs({ args: process.argv.slice(2), strict: true, allowPositionals: true });
  } catch (e) {
    usage((e as Error).message);
  }
})();

const [command, ...rest] = positionals;
if (command === "init") {
  if (rest.length !== 0) usage("init takes no arguments");
  init();
} else if (command === "ready") {
  if (rest.length !== 2) usage("ready needs <session-dir> <background-task-output-file>");
  await ready(rest[0], rest[1]);
} else if (command === "turn-context") {
  if (rest.length < 1 || rest.length > 2) usage("turn-context needs <thread-id> [turn-id]");
  turnContext(rest[0], rest[1]);
} else {
  usage(command === undefined ? "no command" : `unknown command: ${command}`);
}
