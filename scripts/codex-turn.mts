#!/usr/bin/env node
// codex-cc-bridge turn driver: drive exactly one turn (or one native review)
// against a resident `codex app-server --listen ws://127.0.0.1:PORT` that was
// started INSIDE the Claude Code sandbox with capability-token auth.
//
// TypeScript with erasable types only: Node >= 23.6 runs this file directly
// (type stripping), no build step.
//
// SECURITY INVARIANTS (do not weaken; pinned by tests/codex-turn.test.mjs):
//   - The endpoint must be loopback (ws://127.0.0.1 / localhost / ::1); the
//     capability token is never sent anywhere else.
//   - A capability token is REQUIRED (--token-file or CODEX_BRIDGE_TOKEN_FILE);
//     the driver refuses to talk to an unauthenticated server.
//   - Before any thread is started, the server's containment is probed via
//     command/exec: $HOME and /tmp (outside the sandbox-writable subtrees)
//     must NOT be writable, and the target cwd MUST be writable (server inside
//     *this* session's sandbox). Any other outcome aborts.
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
import { parseArgs } from "node:util";

const PINNED_THREAD_SANDBOX = "danger-full-access";
const PINNED_TURN_SANDBOX_POLICY = Object.freeze({ type: "dangerFullAccess" });
const PINNED_APPROVAL_POLICY = "never";
const DEFAULT_PORT = 41100;
const PROBE_TIMEOUT_MS = 15_000;
// Control-plane RPCs (initialize/thread/turn-start) must answer promptly; only
// waiting for turn *completion* is unbounded. Env override exists for tests.
const CONTROL_TIMEOUT_MS = Number(process.env.CODEX_BRIDGE_CONTROL_TIMEOUT_MS ?? 30_000);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

// --- Protocol types (the small subset of the codex app-server v2 API we use;
// authoritative schemas: `codex app-server generate-json-schema`) -----------

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** Incoming frame: response, notification, or server->client request. */
interface IncomingMessage {
  id?: number;
  method?: string;
  params?: NotificationParams;
  result?: unknown;
  error?: JsonRpcError;
}

interface AgentItem {
  type?: string;
  phase?: string;
  text?: string;
  command?: string;
  status?: string;
  exitCode?: number;
}

interface Turn {
  id?: string;
  status?: string;
  error?: unknown;
  items?: AgentItem[];
}

interface NotificationParams {
  threadId?: string;
  turnId?: string;
  item?: AgentItem;
  tokenUsage?: unknown;
  turn?: Turn;
}

interface TurnCompletedParams {
  threadId?: string;
  turn?: Turn;
}

interface ThreadResponse {
  thread?: { id?: string };
}

interface TurnStartResponse {
  turn?: Turn;
}

interface ReviewStartResponse {
  reviewThreadId?: string;
  turn?: Turn;
}

interface CommandExecResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// --- CLI --------------------------------------------------------------------

function usage(message?: string): never {
  if (message) console.error(`codex-turn: ${message}`);
  console.error(
    "usage: codex-turn.mts --token-file FILE [--cwd DIR] [--thread ID] [--schema FILE]\n" +
      "                      [--model M] [--effort E] [--port N | --url ws://127.0.0.1:N]\n" +
      "                      [--prompt TEXT | prompt on stdin] [--review-target JSON]\n" +
      "The app-server must already be running inside the Claude sandbox, with auth:\n" +
      "  codex app-server --listen ws://127.0.0.1:PORT --ws-auth capability-token --ws-token-file FILE",
  );
  process.exit(2);
}

function parseCli(args: string[]) {
  try {
    // strict + no positionals: unknown flags are a hard error, so there is no
    // argv path that could smuggle in a sandbox override.
    return parseArgs({
      args,
      options: {
        cwd: { type: "string" },
        thread: { type: "string" },
        schema: { type: "string" },
        model: { type: "string" },
        effort: { type: "string" },
        port: { type: "string" },
        url: { type: "string" },
        prompt: { type: "string" },
        "review-target": { type: "string" },
        "token-file": { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (e) {
    usage((e as Error).message);
  }
}

const opts = parseCli(process.argv.slice(2));
const cwd: string = opts.cwd ?? process.cwd();
const url: string = opts.url ?? `ws://127.0.0.1:${Number(opts.port ?? process.env.CODEX_BRIDGE_PORT ?? DEFAULT_PORT)}`;
// The capability token must never leave this machine: loopback only.
let endpoint: URL;
try {
  endpoint = new URL(url);
} catch {
  usage(`invalid --url: ${url}`);
}
if (endpoint.protocol !== "ws:" || !LOOPBACK_HOSTS.has(endpoint.hostname)) {
  usage(`refusing non-loopback endpoint ${url} (the capability token and prompts must stay on this machine)`);
}
const port = endpoint.port || "80";
const reviewTargetArg = opts["review-target"];
if (reviewTargetArg && (opts.prompt !== undefined || opts.schema || opts.model || opts.effort)) {
  usage("--review-target cannot be combined with a prompt, --schema, --model or --effort (review/start has no slot for them)");
}
// "-" reads the target JSON from stdin, so callers never have to shell-quote it.
const reviewTarget: unknown = reviewTargetArg
  ? JSON.parse(reviewTargetArg === "-" ? fs.readFileSync(0, "utf8") : reviewTargetArg)
  : null;
let prompt = opts.prompt;
if (!reviewTarget && prompt === undefined) prompt = fs.readFileSync(0, "utf8");
if (!reviewTarget && !prompt!.trim()) usage("empty prompt");
const outputSchema: unknown = opts.schema ? JSON.parse(fs.readFileSync(opts.schema, "utf8")) : undefined;
// Capability token for a server started with --ws-auth capability-token
// (works on loopback; measured). REQUIRED: an unauthenticated resident server
// would be drivable by any local process, so refuse to be part of that setup.
const tokenFile = opts["token-file"] ?? process.env.CODEX_BRIDGE_TOKEN_FILE;
if (!tokenFile) {
  usage("a capability token is required: pass --token-file or set CODEX_BRIDGE_TOKEN_FILE (see the codex-bridge skill's launch recipe)");
}
const token = fs.readFileSync(tokenFile, "utf8").trim();
if (!token) usage(`token file ${tokenFile} is empty`);

const progress = (event: string, detail: Record<string, unknown>): void => {
  console.error(JSON.stringify({ event, ...detail }));
};

// --- Connection and JSON-RPC plumbing ----------------------------------------

// Node's built-in WebSocket (undici) supports the non-standard `headers` option.
const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` } } as never);
let nextId = 1;
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  method: string;
}
const pending = new Map<number, PendingRequest>();
let threadId: string | undefined = opts.thread;
let activeTurnId: string | null = null;
let startRequested = false;
let finalAnswer: string | null = null;
let lastAgentMessage: string | null = null;
let usageInfo: unknown = null;
let settled = false;
let resolveTurn!: (params: TurnCompletedParams) => void;
const turnDone = new Promise<TurnCompletedParams>((r) => (resolveTurn = r));

function fail(message: string, code = 1): never {
  if (!settled) {
    settled = true;
    console.error(`codex-turn: ${message}`);
  }
  process.exit(code);
}

ws.onerror = () => {
  if (settled) return;
  fail(
    `cannot reach app-server at ${url} (not running, or it rejected the handshake).\n` +
      `- If http://127.0.0.1:${port}/readyz succeeds, the server is up but the token does not match\n` +
      `  (it probably belongs to another session; use a different port).\n` +
      `- Otherwise start it inside the Claude sandbox first (run_in_background Bash):\n` +
      `  codex app-server --listen ${url} --ws-auth capability-token --ws-token-file <token-file>`,
  );
};
ws.onclose = () => {
  if (!settled) fail("app-server connection closed before the turn completed");
};

const send = (msg: object): void => ws.send(JSON.stringify(msg));
function request<T>(method: string, params: unknown): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, method });
    send({ jsonrpc: "2.0", id, method, params });
  });
}
/** request() with a deadline — for control-plane calls that must answer promptly. */
function controlRequest<T>(method: string, params: unknown, timeoutMs = CONTROL_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    request<T>(method, params),
    new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new Error(`${method}: no response after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Schema-valid denials per server->client request method (fail closed).
// These should never fire with approvalPolicy "never", but if they do, deny.
const DENIALS: Record<string, object> = {
  "item/commandExecution/requestApproval": { decision: "decline" },
  "item/fileChange/requestApproval": { decision: "decline" },
  execCommandApproval: { decision: "abort" },
  applyPatchApproval: { decision: "abort" },
};

function handleServerRequest(msg: IncomingMessage): void {
  progress("server-request-denied", { method: msg.method });
  const denial = DENIALS[msg.method!];
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

// Turn-scoped events can arrive in the same TCP chunk as the turn/start
// response, i.e. before the awaited response assigns activeTurnId. Buffer them
// until our turn is identified, then replay through the same handler.
const earlyEvents: { method: string; params: NotificationParams }[] = [];
function handleTurnEvent(method: string, params: NotificationParams): void {
  if (method === "item/completed") {
    if (params.turnId !== undefined && params.turnId !== activeTurnId) return;
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
  } else if (method === "turn/completed") {
    // Only accept the completion of the turn we started; anything else
    // (concurrent drivers, child turns) is not ours.
    if (params.turn?.id !== activeTurnId) return;
    resolveTurn(params);
  }
}
function turnIdentified(): void {
  for (const e of earlyEvents) handleTurnEvent(e.method, e.params);
  earlyEvents.length = 0;
}

ws.onmessage = (raw: MessageEvent) => {
  const msg = JSON.parse(String(raw.data)) as IncomingMessage;
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
  const params: NotificationParams = msg.params ?? {};
  // Ignore all thread/turn-scoped events until our own thread is identified,
  // and events for other threads afterwards (child threads spawned by
  // subagents, unrelated threads on a shared server).
  if (threadId === undefined) return;
  if (params.threadId !== undefined && params.threadId !== threadId) return;
  switch (msg.method) {
    case "item/completed":
    case "turn/completed":
      if (activeTurnId === null) earlyEvents.push({ method: msg.method, params });
      else handleTurnEvent(msg.method, params);
      break;
    case "thread/tokenUsage/updated":
      usageInfo = params.tokenUsage ?? params ?? null;
      break;
    case "error":
      progress("error", { detail: params });
      break;
    default:
      break;
  }
};

// Best effort: when CC cancels this task, interrupt the resident turn so the
// app-server does not keep spending tokens / mutating files. If the turn/start
// response has not arrived yet, wait briefly for the turn ID first.
function onSignal(signal: string): void {
  if (settled) process.exit(130);
  settled = true;
  const finish = (): never => {
    console.error(`codex-turn: ${signal}: turn interrupted`);
    process.exit(130);
  };
  const interrupt = (): void => {
    request("turn/interrupt", { threadId, turnId: activeTurnId }).then(finish, finish);
    setTimeout(finish, 3000);
  };
  if (threadId && activeTurnId) {
    interrupt();
  } else if (startRequested) {
    const deadline = Date.now() + 3000;
    const poll = setInterval(() => {
      if (threadId && activeTurnId) {
        clearInterval(poll);
        interrupt();
      } else if (Date.now() > deadline) {
        clearInterval(poll);
        finish();
      }
    }, 100);
  } else {
    finish();
  }
}
process.on("SIGINT", () => onSignal("SIGINT"));
process.on("SIGTERM", () => onSignal("SIGTERM"));

await new Promise((resolve) => (ws.onopen = resolve));

await controlRequest("initialize", {
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
}).catch((e: Error) => fail(String(e.message ?? e)));
send({ jsonrpc: "2.0", method: "initialized", params: {} });

// --- Containment preflight -------------------------------------------------
// command/exec runs in the server's own context (no thread, no model, no
// tokens). A server inside the Claude sandbox cannot write $HOME or /tmp
// (only sandbox-designated subtrees like /tmp/claude*); a server inside *this*
// session's sandbox can write the target cwd. Anything else means we are
// talking to the wrong server: abort before starting any thread.
{
  const probeName = `.codex-cc-bridge-probe-${process.pid}-${Math.floor(Math.random() * 1e9)}`;
  const probeWrite = (dir: string, label: string): string =>
    `${label}=BLOCKED; if touch "${dir}/${probeName}" 2>/dev/null; then ${label}=WRITABLE; rm -f "${dir}/${probeName}"; fi; `;
  const script =
    probeWrite("$HOME", "home") +
    probeWrite("/tmp", "tmp") +
    probeWrite(".", "cwdw") +
    `echo "$home $tmp $cwdw"`;
  const probe = await controlRequest<CommandExecResponse>(
    "command/exec",
    {
      command: ["/bin/sh", "-c", script],
      cwd,
      // Without this, command/exec applies the user's configured codex sandbox,
      // which dies on nested Seatbelt inside the Claude sandbox (exit 71).
      sandboxPolicy: PINNED_TURN_SANDBOX_POLICY,
      timeoutMs: PROBE_TIMEOUT_MS - 5000,
    },
    PROBE_TIMEOUT_MS,
  ).catch((e: Error) => fail(`containment probe failed (refusing to run a turn): ${e.message ?? e}`));
  if (probe.exitCode !== 0) {
    fail(
      `containment probe did not run cleanly (exit ${probe.exitCode}, stderr: ${String(probe.stderr ?? "").trim()}). Refusing to run a turn.`,
    );
  }
  const [home, tmp, cwdw] = String(probe.stdout ?? "").trim().split(/\s+/);
  if (home !== "BLOCKED" || tmp !== "BLOCKED") {
    fail(
      `REFUSING TO RUN: the app-server at ${url} can write ${home !== "BLOCKED" ? "$HOME" : "/tmp"}, ` +
        "so it is NOT confined by the Claude sandbox.\n" +
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
  progress("containment", { home: "BLOCKED", tmp: "BLOCKED", cwd: "WRITABLE" });
}
// ---------------------------------------------------------------------------

if (threadId) {
  const r = await controlRequest<ThreadResponse>("thread/resume", {
    threadId,
    cwd,
    sandbox: PINNED_THREAD_SANDBOX,
    approvalPolicy: PINNED_APPROVAL_POLICY,
  }).catch((e: Error) => fail(String(e.message ?? e)));
  threadId = r.thread?.id ?? threadId;
} else {
  const r = await controlRequest<ThreadResponse>("thread/start", {
    cwd,
    sandbox: PINNED_THREAD_SANDBOX,
    approvalPolicy: PINNED_APPROVAL_POLICY,
    ephemeral: false,
    ...(opts.model ? { model: opts.model } : {}),
  }).catch((e: Error) => fail(String(e.message ?? e)));
  threadId = r.thread?.id;
}
if (!threadId) fail("app-server returned no thread id");
progress("thread", { threadId });

startRequested = true;
if (reviewTarget) {
  const r = await controlRequest<ReviewStartResponse>("review/start", {
    threadId,
    target: reviewTarget,
    delivery: "inline",
  }).catch((e: Error) => fail(String(e.message ?? e)));
  if (!r.turn?.id) fail("app-server returned no turn id for review/start");
  activeTurnId = r.turn.id;
  if (r.reviewThreadId) threadId = r.reviewThreadId;
} else {
  const params: Record<string, unknown> = {
    threadId,
    input: [{ type: "text", text: prompt }],
    sandboxPolicy: PINNED_TURN_SANDBOX_POLICY,
    approvalPolicy: PINNED_APPROVAL_POLICY,
  };
  if (outputSchema !== undefined) params.outputSchema = outputSchema;
  if (opts.model) params.model = opts.model;
  if (opts.effort) params.effort = opts.effort;
  const r = await controlRequest<TurnStartResponse>("turn/start", params).catch((e: Error) =>
    fail(String(e.message ?? e)),
  );
  if (!r.turn?.id) fail("app-server returned no turn id for turn/start");
  activeTurnId = r.turn.id;
}
turnIdentified();

const completed = await turnDone;
settled = true;
const turn: Turn = completed.turn ?? {};
let finalMessage: string | null = finalAnswer ?? lastAgentMessage;
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
