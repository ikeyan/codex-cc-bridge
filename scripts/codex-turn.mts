#!/usr/bin/env node
// codex-cc-bridge turn driver: drive exactly one turn (or one native review)
// against a resident `codex app-server --listen ws://127.0.0.1:PORT` that was
// started INSIDE the Claude Code sandbox with capability-token auth.
//
// TypeScript with erasable types only: Node >= 23.6 runs this file directly
// (type stripping), no build step.
//
// SECURITY INVARIANTS (do not weaken; pinned by tests/codex-turn.test.mjs):
//   - The endpoint is always ws://127.0.0.1:<port>, port and capability token both
//     read from the session dir (--session / CODEX_BRIDGE_SESSION) that the launch
//     helper wrote. No flag takes a host, URL, port or token path, so the token
//     cannot be sent anywhere but loopback, and there is no unauthenticated mode.
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
// dangerouslyDisableSandbox. See wiki/security/ and ikeyan/canon facts/codex/.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";

const PINNED_THREAD_SANDBOX = "danger-full-access";
const PINNED_TURN_SANDBOX_POLICY = Object.freeze({ type: "dangerFullAccess" });
const PINNED_APPROVAL_POLICY = "never";
const PROBE_TIMEOUT_MS = 15_000;

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
  /** Model the server actually resolved for the thread (echoes `model` when we send one). */
  model?: string;
  reasoningEffort?: string | null;
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
    "usage: codex-turn.mts --session DIR [--cwd DIR] [--thread ID] [--schema FILE]\n" +
      "                      [--model M] [--effort E] < prompt.txt\n" +
      "       codex-turn.mts --session DIR --review uncommitted|base|commit|custom\n" +
      "                      [--target-file FILE] [--cwd DIR] [--thread ID] [--model M]\n" +
      "  base/commit take the branch name / sha from FILE (plain text, one line);\n" +
      "  custom takes its instructions on stdin. Neither ever passes through a shell.\n" +
      "DIR is the session dir from `codex-bridge.mts init` (token) + `ready` (port); it can\n" +
      "also come from CODEX_BRIDGE_SESSION. The app-server it points at must be running inside\n" +
      "the Claude sandbox (see the codex-bridge skill's launch recipe).",
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
        session: { type: "string" },
        review: { type: "string" },
        "target-file": { type: "string" },
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
// The session dir is the only way to name a server: no default port on purpose. The
// launch recipe starts the server on port 0 and `ready` publishes the port the OS
// assigned into the dir, so a fixed default would silently aim at whatever stale server
// happens to hold it. Reading the token from the same dir means there is no argv path
// that could point the token at a non-loopback host, and no unauthenticated mode.
const sessionDir = opts.session ?? process.env.CODEX_BRIDGE_SESSION;
if (!sessionDir) {
  usage(
    "no session: pass --session DIR (or set CODEX_BRIDGE_SESSION) — the dir printed by `codex-bridge.mts init` in the codex-bridge skill's launch recipe",
  );
}
function readSessionFile(name: string, missingHint: string): string {
  try {
    return fs.readFileSync(path.join(sessionDir!, name), "utf8").trim();
  } catch (e) {
    usage(`session ${sessionDir}: cannot read ${name} (${(e as Error).message}). ${missingHint}`);
  }
}
const token = readSessionFile("token", "Is this the dir printed by `codex-bridge.mts init`?");
if (!token) usage(`session ${sessionDir}: token file is empty`);
const portText = readSessionFile(
  "port",
  "Run `codex-bridge.mts ready DIR <app-server task output file>` first; it publishes the port here.",
);
if (!/^[0-9]{1,5}$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
  usage(
    `session ${sessionDir}: port file must hold a TCP port (1-65535), got ${
      JSON.stringify(portText)
    }`,
  );
}
const port = Number(portText);
const url = `ws://127.0.0.1:${port}`;
// --- Review target ------------------------------------------------------------
// The mode is a flag; the value (branch name, sha, instructions) never is. Branch names
// may legally contain `$(...)` or a single quote (measured), so no quoting discipline in
// the agent's command line is safe; a file written by the Write tool, or stdin, is.
const REVIEW_MODES = ["uncommitted", "base", "commit", "custom"] as const;
type ReviewMode = typeof REVIEW_MODES[number];
const reviewMode = opts.review as ReviewMode | undefined;
if (reviewMode !== undefined && !REVIEW_MODES.includes(reviewMode)) {
  usage(`--review must be one of ${REVIEW_MODES.join("|")}, got ${JSON.stringify(reviewMode)}`);
}
// review/start itself carries only {threadId, target, delivery}, so an outputSchema and
// a per-turn effort have nowhere to go (and stdin is the target, not a prompt).
// `model` is different: it is a thread-level setting, and the review runs on the thread
// we start, so it does apply.
if (reviewMode !== undefined && (opts.schema || opts.effort)) {
  usage(
    "--review cannot be combined with --schema or --effort (review/start has no slot for them; --model is fine, it rides on the thread)",
  );
}
const needsTargetFile = reviewMode === "base" || reviewMode === "commit";
if (needsTargetFile && !opts["target-file"]) {
  usage(
    `--review ${reviewMode} needs --target-file FILE holding the ${
      reviewMode === "base" ? "branch name" : "commit sha"
    }`,
  );
}
if (!needsTargetFile && opts["target-file"]) {
  usage(
    `--target-file only applies to --review base|commit (got --review ${reviewMode ?? "<none>"})`,
  );
}
/** One non-empty line of plain text from FILE (trailing newline tolerated). */
function readTargetLine(file: string, what: string): string {
  const text = fs.readFileSync(file, "utf8");
  const line = text.trim();
  if (!line || line.includes("\n")) {
    usage(`${file} must hold exactly one non-empty line (the ${what})`);
  }
  return line;
}
const stdinText = (): string => fs.readFileSync(0, "utf8");
let reviewTarget: Record<string, string> | null = null;
if (reviewMode === "uncommitted") reviewTarget = { type: "uncommittedChanges" };
else if (reviewMode === "base") {
  reviewTarget = {
    type: "baseBranch",
    branch: readTargetLine(opts["target-file"]!, "branch name"),
  };
} else if (reviewMode === "commit") {
  reviewTarget = { type: "commit", sha: readTargetLine(opts["target-file"]!, "commit sha") };
} else if (reviewMode === "custom") {
  const instructions = stdinText();
  if (!instructions.trim()) usage("--review custom: empty instructions (stdin)");
  reviewTarget = { type: "custom", instructions };
}
// The prompt always comes on stdin: callers Write it to a file and redirect, so its
// text never passes through a shell (see the skill). No --prompt flag on purpose.
const prompt = reviewTarget ? undefined : stdinText();
if (prompt !== undefined && !prompt.trim()) usage("empty prompt (stdin)");
const outputSchema: unknown = opts.schema
  ? JSON.parse(fs.readFileSync(opts.schema, "utf8"))
  : undefined;
// Control-plane RPCs (initialize/thread/turn-start) must answer promptly; only
// waiting for turn *completion* is unbounded. Env override exists for tests; a
// value that is not a positive number would become setTimeout(NaN) = fire at once.
const controlTimeoutEnv = process.env.CODEX_BRIDGE_CONTROL_TIMEOUT_MS;
const CONTROL_TIMEOUT_MS = controlTimeoutEnv === undefined || controlTimeoutEnv === ""
  ? 30_000
  : Number(controlTimeoutEnv);
if (!(Number.isFinite(CONTROL_TIMEOUT_MS) && CONTROL_TIMEOUT_MS > 0)) {
  usage(
    `CODEX_BRIDGE_CONTROL_TIMEOUT_MS must be a positive number of ms, got ${controlTimeoutEnv}`,
  );
}

// --- Telling codex where it is ---------------------------------------------
// codex has no idea it is inside the Claude Code sandbox: it reads a failed write to
// /tmp or a blocked host as a bug in the code under test and burns steps on it (observed).
// Point it at the verified constraints instead of restating them here — the file is the
// source, this is a reference to it (see wiki/domain/turn-input-references.md).
const SANDBOX_SKILL_REL = ["skills", "cc-cli-sandbox", "SKILL.md"];
/** Locate the cc-cli-sandbox skill in the user's plugin tree, if it is installed. */
function findSandboxSkill(): string | undefined {
  const override = process.env.CODEX_BRIDGE_SANDBOX_SKILL;
  if (override) return fs.existsSync(override) ? override : undefined;
  // $HOME rather than os.homedir(): the latter needs deno's --allow-sys, and this driver
  // has to run unchanged on node, deno and bun.
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) return undefined;
  // Plugins live at ~/.claude/plugins/<kind>/<marketplace>/<plugin>/<revision>/, so the
  // skill sits within a few levels; walk that far and no further.
  let level = [path.join(home, ".claude", "plugins")];
  for (let depth = 0; depth < 5 && level.length > 0; depth++) {
    const next: string[] = [];
    for (const dir of level) {
      const candidate = path.join(dir, ...SANDBOX_SKILL_REL);
      if (fs.existsSync(candidate)) return candidate;
      try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.isDirectory() && !e.name.startsWith(".")) next.push(path.join(dir, e.name));
        }
      } catch { /* unreadable: skip */ }
    }
    level = next;
  }
  return undefined;
}
const sandboxSkill = findSandboxSkill();
const DEVELOPER_INSTRUCTIONS = [
  "You are running inside the Claude Code CLI's OS sandbox. You did not configure it and",
  "cannot change it. Writes are confined (the working directory and $TMPDIR are writable;",
  "$HOME and /tmp directly are not) and network egress is limited to an allowlist.",
  'So: a write that fails with "Read-only file system" or "Operation not permitted", or an',
  "outbound request that fails to connect, is almost always this sandbox rather than a defect",
  "in the code you are looking at. Put scratch files under $TMPDIR and carry on; do not try to",
  "disable or work around the sandbox, and do not report it as a finding.",
  ...(sandboxSkill
    ? [
      `The verified constraints and failure signatures are in ${sandboxSkill} — read that file`,
      "when a command fails in one of those ways.",
    ]
    : []),
].join("\n");

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
// review/start runs the review in a subagent child turn; its id arrives as a turn/started on
// OUR thread with a turn id other than ours. Interrupting only our (parent) turn leaves that
// child running (measured), so remember it for turn/interrupt.
let childTurnId: string | null = null;
/** Send turn/interrupt for every turn we own: the review child first (interrupting only the
 * parent does not reach it, measured), then our own. Resolves when all have been answered. */
function interruptAll(): Promise<unknown> {
  const targets = [...(childTurnId ? [childTurnId] : []), activeTurnId];
  return Promise.all(targets.map((turnId) => request("turn/interrupt", { threadId, turnId })));
}
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
      `  (session ${sessionDir} points at another session's server; run the launch recipe again).\n` +
      `- Otherwise the server died: start a new one with the launch recipe (fresh init + ready).`,
  );
};
ws.onclose = () => {
  if (!settled) fail("app-server connection closed before the turn completed");
  else if (aborting) {
    // fail() is muted once settled; say what happened to the interrupt we were waiting on.
    console.error(
      "codex-turn: app-server connection closed before turn/interrupt was acknowledged; the server turn may still be running",
    );
    process.exit(abortCode);
  }
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
function controlRequest<T>(
  method: string,
  params: unknown,
  timeoutMs = CONTROL_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    request<T>(method, params),
    new Promise<never>((_, rej) => {
      timer = setTimeout(
        () => rej(new Error(`${method}: no response after ${timeoutMs}ms`)),
        timeoutMs,
      );
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
  } else if (method === "turn/started") {
    // A turn on our thread that is not ours: the subagent child a review runs in. Kept
    // only so interrupts can reach it and the result can name it (reviewTurnId).
    const id = params.turn?.id;
    if (id !== undefined && id !== activeTurnId) childTurnId = id;
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
    case "turn/started":
      // turn/started included: the review child's can share a TCP chunk with the
      // review/start response, i.e. arrive before activeTurnId is known.
      if (activeTurnId === null) earlyEvents.push({ method: msg.method, params });
      else handleTurnEvent(msg.method, params);
      break;
    case "thread/tokenUsage/updated":
      usageInfo = params.tokenUsage ?? params ?? null;
      break;
    case "error": {
      progress("error", { detail: params });
      // Codex cannot authenticate to OpenAI (auth.json unreadable under a read-restricted
      // sandbox, or logged out): the server retries forever and the turn never completes
      // (measured), so waiting is pointless. Interrupt and say why.
      const status = (params as {
        error?: { codexErrorInfo?: { responseStreamDisconnected?: { httpStatusCode?: number } } };
      })
        .error?.codexErrorInfo?.responseStreamDisconnected?.httpStatusCode;
      if (status === 401) {
        abortTurn(
          "codex got 401 Unauthorized from OpenAI: the app-server cannot use its credentials. " +
            "Check `codex login status` from a sandboxed Bash — if it says Operation not permitted, " +
            "the sandbox denies reading ~/.codex/auth.json (allowRead it); otherwise run `codex login`.",
          1,
        );
      }
      break;
    }
    default:
      break;
  }
};

// Abort the turn from outside its normal completion: CC cancelling this task (SIGTERM /
// SIGINT) or a condition that makes waiting pointless (401 from OpenAI). Interrupt the
// resident turn so the app-server does not keep spending tokens / mutating files. If the
// turn/start response has not arrived yet, wait briefly for the turn ID first. The reason is
// printed up front so nothing that races us (a turn/completed for the interrupted turn,
// which makes the main path print its JSON and settle) can swallow it.
let aborting = false;
let abortCode = 1;
function abortTurn(reason: string, code: number): void {
  // A second trigger while an abort is in flight (the server keeps emitting 401s; a second
  // signal) must not cut the turn-id wait / interrupt grace short: ignore it. After the turn
  // has settled the process is already on its way out (result JSON draining to stdout); an
  // exit() here could truncate that JSON, so ignore the trigger then too.
  if (aborting || settled) return;
  aborting = true;
  abortCode = code;
  settled = true;
  console.error(`codex-turn: ${reason}`);
  const finish = (): never => process.exit(code);
  if (!startRequested) finish();
  // Wait (bounded) until we know what to interrupt: our turn id, and for a review also the
  // child's, which arrives as a turn/started shortly after the review/start response.
  const deadline = Date.now() + 3000;
  const tick = (): void => {
    const known = threadId && activeTurnId && (reviewMode === undefined || childTurnId !== null);
    if (!known && Date.now() < deadline) return;
    clearInterval(poll);
    if (threadId && activeTurnId) {
      interruptAll().then(finish, finish);
      setTimeout(finish, 3000);
    } else finish();
  };
  const poll = setInterval(tick, 50);
  tick();
}
process.on("SIGINT", () => abortTurn("SIGINT: turn interrupted", 130));
process.on("SIGTERM", () => abortTurn("SIGTERM: turn interrupted", 130));

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
  const script = probeWrite("$HOME", "home") +
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
  ).catch((e: Error) =>
    fail(`containment probe failed (refusing to run a turn): ${e.message ?? e}`)
  );
  if (probe.exitCode !== 0) {
    fail(
      `containment probe did not run cleanly (exit ${probe.exitCode}, stderr: ${
        String(probe.stderr ?? "").trim()
      }). Refusing to run a turn.`,
    );
  }
  const fields = String(probe.stdout ?? "").trim().split(/\s+/);
  // Three known words or nothing: anything else is a broken probe, not a verdict.
  if (fields.length !== 3 || !fields.every((f) => f === "BLOCKED" || f === "WRITABLE")) {
    fail(
      `containment probe output not understood (stdout: ${JSON.stringify(probe.stdout)}, ` +
        `stderr: ${JSON.stringify(probe.stderr)}). Refusing to run a turn.`,
    );
  }
  const [home, tmp, cwdw] = fields;
  if (home !== "BLOCKED" || tmp !== "BLOCKED") {
    fail(
      `REFUSING TO RUN: the app-server at ${url} can write ${
        home !== "BLOCKED" ? "$HOME" : "/tmp"
      }, ` +
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

let resolved: ThreadResponse | undefined;
if (threadId) {
  const r = await controlRequest<ThreadResponse>("thread/resume", {
    threadId,
    cwd,
    sandbox: PINNED_THREAD_SANDBOX,
    approvalPolicy: PINNED_APPROVAL_POLICY,
    developerInstructions: DEVELOPER_INSTRUCTIONS,
    ...(opts.model ? { model: opts.model } : {}),
  }).catch((e: Error) => {
    // Another client holds the thread open: measured cause is the ChatGPT app's remote
    // control resuming bridge threads on its own app-server (canon:
    // facts/codex/thread-resume-blocked-by-other-writer-client). Nothing here can
    // release it; say so instead of leaving a bare -32600.
    if (String(e.message).includes("already has an active writer")) {
      fail(
        `thread ${threadId} is held open by another codex client (typically the ChatGPT app's ` +
          "remote control, which can resume non-ephemeral threads). Close it there, or drop " +
          `--thread and start a new thread.\n(${e.message})`,
      );
    }
    fail(String(e.message ?? e));
  });
  threadId = r.thread?.id ?? threadId;
  resolved = r;
} else {
  const r = await controlRequest<ThreadResponse>("thread/start", {
    cwd,
    sandbox: PINNED_THREAD_SANDBOX,
    approvalPolicy: PINNED_APPROVAL_POLICY,
    developerInstructions: DEVELOPER_INSTRUCTIONS,
    ephemeral: false,
    ...(opts.model ? { model: opts.model } : {}),
  }).catch((e: Error) => fail(String(e.message ?? e)));
  threadId = r.thread?.id;
  resolved = r;
}
if (!threadId) fail("app-server returned no thread id");
// Report what the server resolved, not what we asked for: the only in-band evidence of
// which model the thread runs. Note the server echoes an unknown name back unchanged --
// this proves the parameter was accepted, not that the model exists.
progress("thread", {
  threadId,
  model: resolved?.model ?? null,
  effort: resolved?.reasoningEffort ?? null,
});

startRequested = true;
if (reviewTarget) {
  const r = await controlRequest<ReviewStartResponse>("review/start", {
    threadId,
    target: reviewTarget,
    delivery: "inline",
  }).catch((e: Error) => fail(String(e.message ?? e)));
  if (!r.turn?.id) fail("app-server returned no turn id for review/start");
  // With delivery "inline" the review runs on the thread we started, and every event
  // arrives on that threadId (measured; "detached" is rejected for thread/start threads).
  // Events for any other thread are filtered out before the early-event buffer sees them,
  // so a different reviewThreadId could only be waited on forever: refuse instead.
  if (r.reviewThreadId !== undefined && r.reviewThreadId !== threadId) {
    fail(
      `review/start moved the review to thread ${r.reviewThreadId} (ours is ${threadId}); ` +
        "this driver only follows inline reviews on its own thread",
    );
  }
  activeTurnId = r.turn.id;
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
    fail(String(e.message ?? e))
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
      // The turn id lets `codex-bridge.mts turn-context <thread> <turn>` pick this turn's
      // server-side record out of a resumed thread's many.
      turnId: activeTurnId,
      // For a review, the turn_context lives in the subagent child turn; this is the id to
      // give `codex-bridge.mts turn-context <thread> <turn>` (null for a plain turn).
      reviewTurnId: childTurnId,
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
