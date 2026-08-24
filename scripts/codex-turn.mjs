#!/usr/bin/env node
// codex-cc-bridge turn driver: drive exactly one turn (or one native review)
// against a resident `codex app-server --listen ws://127.0.0.1:PORT` that was
// started INSIDE the Claude Code sandbox.
//
// SECURITY INVARIANTS (do not weaken; pinned by tests/codex-turn.test.mjs):
//   - Before any thread is started, the server's containment is probed via
//     command/exec: $HOME must NOT be writable (server inside a Claude sandbox)
//     and the target cwd MUST be writable (server inside *this* session's
//     sandbox). Any other outcome aborts.
//   - thread/start and thread/resume always send sandbox "danger-full-access"
//     and approvalPolicy "never".
//   - turn/start always sends sandboxPolicy {type:"dangerFullAccess"}.
//   - No flag can override these; unknown flags are a hard error.
//   - Server->client requests (approvals etc.) are always denied with the
//     schema-valid denial for their method.
// Rationale: inside the Claude sandbox, read-only/workspace-write die on nested
// Seatbelt (`sandbox_apply: Operation not permitted`), and danger-full-access is
// the only mode whose side effects stay ⊆ the Claude sandbox. Never combine with
// dangerouslyDisableSandbox. See docs/spec.md and ikeyan/canon facts/codex/.

import fs from "node:fs";
import process from "node:process";

const PINNED_THREAD_SANDBOX = "danger-full-access";
const PINNED_TURN_SANDBOX_POLICY = Object.freeze({ type: "dangerFullAccess" });
const PINNED_APPROVAL_POLICY = "never";
const DEFAULT_PORT = 41100;
const PROBE_TIMEOUT_MS = 15_000;

const FLAGS_WITH_VALUE = new Set([
  "--cwd",
  "--thread",
  "--schema",
  "--model",
  "--effort",
  "--port",
  "--url",
  "--prompt",
  "--review-target",
]);

function usage(message) {
  if (message) console.error(`codex-turn: ${message}`);
  console.error(
    "usage: codex-turn.mjs [--cwd DIR] [--thread ID] [--schema FILE] [--model M] [--effort E]\n" +
      "                      [--port N | --url ws://127.0.0.1:N] [--prompt TEXT | prompt on stdin]\n" +
      "                      [--review-target JSON]\n" +
      "The app-server must already be running inside the Claude sandbox:\n" +
      "  codex app-server --listen ws://127.0.0.1:PORT   (run_in_background Bash)",
  );
  process.exit(2);
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!FLAGS_WITH_VALUE.has(flag)) usage(`unknown flag: ${flag}`);
    const value = argv[i + 1];
    if (value === undefined) usage(`missing value for ${flag}`);
    opts[flag.slice(2)] = value;
    i++;
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const cwd = opts.cwd ?? process.cwd();
const port = Number(opts.port ?? process.env.CODEX_BRIDGE_PORT ?? DEFAULT_PORT);
const url = opts.url ?? `ws://127.0.0.1:${port}`;
const reviewTargetArg = opts["review-target"];
if (reviewTargetArg && (opts.prompt !== undefined || opts.schema || opts.model || opts.effort)) {
  usage("--review-target cannot be combined with a prompt, --schema, --model or --effort (review/start has no slot for them)");
}
// "-" reads the target JSON from stdin, so callers never have to shell-quote it.
const reviewTarget = reviewTargetArg
  ? JSON.parse(reviewTargetArg === "-" ? fs.readFileSync(0, "utf8") : reviewTargetArg)
  : null;
let prompt = opts.prompt;
if (!reviewTarget && prompt === undefined) prompt = fs.readFileSync(0, "utf8");
if (!reviewTarget && !prompt.trim()) usage("empty prompt");
const outputSchema = opts.schema ? JSON.parse(fs.readFileSync(opts.schema, "utf8")) : undefined;

const progress = (event, detail) => {
  console.error(JSON.stringify({ event, ...detail }));
};

const ws = new WebSocket(url);
let nextId = 1;
const pending = new Map();
let threadId = opts.thread;
let activeTurnId = null;
let finalAnswer = null;
let lastAgentMessage = null;
let usageInfo = null;
let settled = false;
let resolveTurn;
const turnDone = new Promise((r) => (resolveTurn = r));
// turn/completed can arrive in the same TCP chunk as the turn/start response,
// i.e. before the awaited response assigns activeTurnId. Buffer instead of
// dropping, and re-check once our turn is identified.
const earlyCompletions = [];
function turnIdentified() {
  const match = earlyCompletions.find((p) => p.turn?.id === activeTurnId);
  if (match) resolveTurn(match);
  earlyCompletions.length = 0;
}

function fail(message, code = 1) {
  if (settled) return;
  settled = true;
  console.error(`codex-turn: ${message}`);
  process.exit(code);
}

ws.onerror = () => {
  fail(
    `cannot reach app-server at ${url}. Start it inside the Claude sandbox first:\n` +
      `  codex app-server --listen ${url}   (run_in_background Bash; check http://127.0.0.1:${port}/readyz)`,
  );
};
ws.onclose = () => {
  if (!settled) fail("app-server connection closed before the turn completed");
};

const send = (msg) => ws.send(JSON.stringify(msg));
function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
    send({ jsonrpc: "2.0", id, method, params });
  });
}

// Schema-valid denials per server->client request method (fail closed).
// These should never fire with approvalPolicy "never", but if they do, deny.
const DENIALS = {
  "item/commandExecution/requestApproval": { decision: "decline" },
  "item/fileChange/requestApproval": { decision: "decline" },
  execCommandApproval: { decision: "abort" },
  applyPatchApproval: { decision: "abort" },
};

function handleServerRequest(msg) {
  progress("server-request-denied", { method: msg.method });
  const denial = DENIALS[msg.method];
  if (denial) {
    send({ jsonrpc: "2.0", id: msg.id, result: denial });
  } else {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      error: { code: -32000, message: "denied by codex-cc-bridge (fail closed)" },
    });
  }
}

ws.onmessage = (raw) => {
  const msg = JSON.parse(String(raw.data));
  if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(`${p.method}: ${JSON.stringify(msg.error)}`));
    else p.resolve(msg.result);
    return;
  }
  if (!msg.method) return;
  if (msg.id !== undefined) {
    handleServerRequest(msg);
    return;
  }
  const params = msg.params ?? {};
  // Ignore all thread/turn-scoped events until our own thread is identified,
  // and events for other threads afterwards (child threads spawned by
  // subagents, unrelated threads on a shared server).
  if (threadId === undefined) return;
  if (params.threadId !== undefined && params.threadId !== threadId) return;
  switch (msg.method) {
    case "item/completed": {
      const item = params.item ?? {};
      if (item.type === "agentMessage") {
        if (item.phase === "final_answer") finalAnswer = item.text ?? "";
        else lastAgentMessage = item.text ?? "";
        progress("agent-message", { phase: item.phase, text: item.text });
      } else if (item.type === "commandExecution") {
        progress("command", { command: item.command, status: item.status, exitCode: item.exitCode });
      } else if (item.type !== "userMessage" && item.type !== "reasoning") {
        progress("item", { type: item.type });
      }
      break;
    }
    case "thread/tokenUsage/updated":
      usageInfo = params.tokenUsage ?? params ?? null;
      break;
    case "turn/completed":
      // Only accept the completion of the turn we started; anything else
      // (concurrent drivers, child turns) is not ours.
      if (activeTurnId === null) {
        earlyCompletions.push(params);
        return;
      }
      if (params.turn?.id !== activeTurnId) return;
      resolveTurn(params);
      break;
    case "error":
      progress("error", { detail: params });
      break;
    default:
      break;
  }
};

// Best effort: when CC cancels this task, interrupt the resident turn so the
// app-server does not keep spending tokens / mutating files.
function onSignal(signal) {
  if (settled) process.exit(130);
  settled = true;
  const finish = () => {
    console.error(`codex-turn: ${signal}: turn interrupted`);
    process.exit(130);
  };
  if (threadId && activeTurnId) {
    request("turn/interrupt", { threadId, turnId: activeTurnId }).then(finish, finish);
    setTimeout(finish, 3000);
  } else {
    finish();
  }
}
process.on("SIGINT", () => onSignal("SIGINT"));
process.on("SIGTERM", () => onSignal("SIGTERM"));

await new Promise((resolve) => (ws.onopen = resolve));

await request("initialize", {
  clientInfo: { name: "codex-cc-bridge", title: "codex-cc-bridge", version: "0.1.0" },
  capabilities: {
    optOutNotificationMethods: [
      "item/agentMessage/delta",
      "item/reasoning/summaryTextDelta",
      "item/reasoning/summaryPartAdded",
      "item/reasoning/textDelta",
      "item/commandExecution/outputDelta",
    ],
  },
});
send({ jsonrpc: "2.0", method: "initialized", params: {} });

// --- Containment preflight -------------------------------------------------
// command/exec runs in the server's own context (no thread, no model, no
// tokens). A server inside the Claude sandbox cannot write $HOME; a server
// inside *this* session's sandbox can write the target cwd. Anything else
// means we are talking to the wrong server: abort before starting any thread.
{
  const probeName = `.codex-cc-bridge-probe-${process.pid}-${Math.floor(Math.random() * 1e9)}`;
  const script =
    `home=BLOCKED; if touch "$HOME/${probeName}" 2>/dev/null; then home=WRITABLE; rm -f "$HOME/${probeName}"; fi; ` +
    `cwdw=BLOCKED; if touch "./${probeName}" 2>/dev/null; then cwdw=WRITABLE; rm -f "./${probeName}"; fi; ` +
    `echo "$home $cwdw"`;
  let probeTimer;
  const probe = await Promise.race([
    request("command/exec", {
      command: ["/bin/sh", "-c", script],
      cwd,
      // Without this, command/exec applies the user's configured codex sandbox,
      // which dies on nested Seatbelt inside the Claude sandbox (exit 71).
      sandboxPolicy: PINNED_TURN_SANDBOX_POLICY,
      timeoutMs: PROBE_TIMEOUT_MS - 5000,
    }),
    new Promise((_, rej) => {
      probeTimer = setTimeout(() => rej(new Error("containment probe timed out")), PROBE_TIMEOUT_MS);
    }),
  ])
    .finally(() => clearTimeout(probeTimer))
    .catch((e) => fail(`containment probe failed (refusing to run a turn): ${e.message ?? e}`));
  if (probe.exitCode !== 0) {
    fail(
      `containment probe did not run cleanly (exit ${probe.exitCode}, stderr: ${String(probe.stderr ?? "").trim()}). Refusing to run a turn.`,
    );
  }
  const [home, cwdw] = String(probe.stdout ?? "").trim().split(/\s+/);
  if (home !== "BLOCKED") {
    fail(
      "REFUSING TO RUN: the app-server at " +
        url +
        " can write $HOME, so it is NOT confined by the Claude sandbox.\n" +
        "Kill it and restart it from a sandboxed (run_in_background) Bash: codex app-server --listen " +
        url,
    );
  }
  if (cwdw !== "WRITABLE") {
    fail(
      `REFUSING TO RUN: the app-server at ${url} cannot write ${cwd}.\n` +
        "It is probably confined by a different session's sandbox. Start one for this session on another port.",
    );
  }
  progress("containment", { home: "BLOCKED", cwd: "WRITABLE" });
}
// ---------------------------------------------------------------------------

if (threadId) {
  const r = await request("thread/resume", {
    threadId,
    cwd,
    sandbox: PINNED_THREAD_SANDBOX,
    approvalPolicy: PINNED_APPROVAL_POLICY,
  }).catch((e) => fail(String(e.message ?? e)));
  threadId = r?.thread?.id ?? threadId;
} else {
  const r = await request("thread/start", {
    cwd,
    sandbox: PINNED_THREAD_SANDBOX,
    approvalPolicy: PINNED_APPROVAL_POLICY,
    ephemeral: false,
    ...(opts.model ? { model: opts.model } : {}),
  }).catch((e) => fail(String(e.message ?? e)));
  threadId = r?.thread?.id;
}
if (!threadId) fail("app-server returned no thread id");
progress("thread", { threadId });

if (reviewTarget) {
  const r = await request("review/start", {
    threadId,
    target: reviewTarget,
    delivery: "inline",
  }).catch((e) => fail(String(e.message ?? e)));
  activeTurnId = r?.turn?.id ?? null;
  if (r?.reviewThreadId) threadId = r.reviewThreadId;
  turnIdentified();
} else {
  const params = {
    threadId,
    input: [{ type: "text", text: prompt }],
    sandboxPolicy: PINNED_TURN_SANDBOX_POLICY,
    approvalPolicy: PINNED_APPROVAL_POLICY,
  };
  if (outputSchema !== undefined) params.outputSchema = outputSchema;
  if (opts.model) params.model = opts.model;
  if (opts.effort) params.effort = opts.effort;
  const r = await request("turn/start", params).catch((e) => fail(String(e.message ?? e)));
  activeTurnId = r?.turn?.id ?? null;
  turnIdentified();
}

const completed = await turnDone;
settled = true;
const turn = completed?.turn ?? {};
let finalMessage = finalAnswer ?? lastAgentMessage;
if (finalMessage === null) {
  const items = (turn.items ?? []).filter((i) => i.type === "agentMessage");
  const final = items.find((i) => i.phase === "final_answer") ?? items[items.length - 1];
  if (final) finalMessage = final.text ?? "";
}
console.log(
  JSON.stringify(
    {
      threadId,
      turnStatus: turn.status ?? null,
      turnError: turn.error ?? null,
      finalMessage,
      tokenUsage: usageInfo,
    },
    null,
    2,
  ),
);
// Let stdout drain; do not process.exit() on the success path.
process.exitCode = turn.status === "completed" ? 0 : 1;
ws.close();
