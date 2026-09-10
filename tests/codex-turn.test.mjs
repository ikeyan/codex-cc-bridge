// Pins the security invariants of scripts/codex-turn.mts against a mock app-server:
//   - the endpoint is always ws://127.0.0.1:<port> read from the session dir (--session);
//     no flag takes a host, URL, port or token path
//   - a containment probe (command/exec) runs BEFORE any thread is started;
//     $HOME or /tmp writable, or cwd non-writable, aborts the run
//   - thread/start & thread/resume always carry sandbox "danger-full-access" + approvalPolicy "never"
//   - turn/start always carries sandboxPolicy {type:"dangerFullAccess"} + approvalPolicy "never"
//   - unknown flags are rejected before any connection is made
//   - server->client requests are denied with schema-valid shapes
//   - events from unrelated threads/turns are ignored; control-plane RPCs are bounded
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DRIVER = fileURLToPath(new URL("../scripts/codex-turn.mts", import.meta.url));
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// The harness always runs on node; CODEX_TURN_DRIVER_RUNTIME selects which
// runtime executes the driver under test (node | deno | bun).
const DRIVER_CMD = (() => {
  const rt = process.env.CODEX_TURN_DRIVER_RUNTIME ?? "node";
  if (rt === "deno") {
    return ["deno", "run", "--quiet", "--allow-env", "--allow-read", "--allow-net", DRIVER];
  }
  if (rt === "bun") return ["bun", DRIVER];
  return [process.execPath, DRIVER];
})();
const spawnDriver = (args, env) =>
  spawn(DRIVER_CMD[0], [...DRIVER_CMD.slice(1), ...args], { env: { ...process.env, ...env } });

// A session dir is what `codex-bridge.mts init` + `ready` leave behind: token + port.
// Fresh dir per mock server so tests never share a port file.
function makeSession(port, { token = "sekrit-token-123\n", portText } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "codex-turn-test-"));
  writeFileSync(join(dir, "token"), token, { mode: 0o600 });
  if (port !== undefined || portText !== undefined) {
    writeFileSync(join(dir, "port"), portText ?? `${port}\n`);
  }
  return dir;
}

// Minimal RFC6455 text-frame server good enough for JSON-RPC lines in tests.
function startMockServer(onMessage) {
  const sockets = new Set();
  const authHeaders = [];
  const server = net.createServer((socket) => {
    sockets.add(socket);
    let handshaken = false;
    let buf = Buffer.alloc(0);
    const sendJson = (obj) => {
      // { __raw } sends the text verbatim (to test frames that are not JSON).
      const payload = Buffer.from(
        typeof obj?.__raw === "string" ? obj.__raw : JSON.stringify(obj),
        "utf8",
      );
      let header;
      if (payload.length < 126) {
        header = Buffer.from([0x81, payload.length]);
      } else {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(payload.length, 2);
      }
      socket.write(Buffer.concat([header, payload]));
    };
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!handshaken) {
        const end = buf.indexOf("\r\n\r\n");
        if (end < 0) return;
        const head = buf.slice(0, end).toString("utf8");
        buf = buf.slice(end + 4);
        const key = /Sec-WebSocket-Key: (.+)/i.exec(head)?.[1]?.trim();
        authHeaders.push(/^Authorization: (.+)$/im.exec(head)?.[1]?.trim() ?? null);
        const accept = crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
        socket.write(
          "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
            `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
        );
        handshaken = true;
      }
      while (buf.length >= 2) {
        const opcode = buf[0] & 0x0f;
        const masked = (buf[1] & 0x80) !== 0;
        let len = buf[1] & 0x7f;
        let off = 2;
        if (len === 126) {
          if (buf.length < 4) return;
          len = buf.readUInt16BE(2);
          off = 4;
        } else if (len === 127) {
          if (buf.length < 10) return;
          len = Number(buf.readBigUInt64BE(2));
          off = 10;
        }
        const maskLen = masked ? 4 : 0;
        if (buf.length < off + maskLen + len) return;
        const mask = masked ? buf.slice(off, off + 4) : null;
        const payload = buf.slice(off + maskLen, off + maskLen + len);
        if (mask) { for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4]; }
        buf = buf.slice(off + maskLen + len);
        if (opcode === 8) {
          socket.end();
          return;
        }
        if (opcode === 1) onMessage(JSON.parse(payload.toString("utf8")), sendJson);
      }
    });
    socket.on("error", () => {});
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: server.address().port,
        authHeaders,
        close: () => {
          for (const s of sockets) s.destroy();
          server.close();
        },
      });
    });
  });
}

// Standard mock behaviour: answer initialize/probe/thread/turn, record requests,
// then complete the turn with one agentMessage.
function appServerBehaviour(
  recorded,
  {
    probeStdout = "BLOCKED BLOCKED WRITABLE",
    onTurnStart,
    beforeInit,
    beforeTurnStartResponse,
    turnStartResult,
  } = {},
) {
  return (msg, send) => {
    if (msg.method) recorded.push(msg);
    if (msg.id === undefined) return; // notifications
    if (msg.method === "initialize") {
      if (beforeInit) beforeInit(send);
      send({ jsonrpc: "2.0", id: msg.id, result: { userAgent: "mock" } });
    } else if (msg.method === "command/exec") {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: { exitCode: 0, stdout: probeStdout + "\n", stderr: "" },
      });
    } else if (msg.method === "thread/start" || msg.method === "thread/resume") {
      send({ jsonrpc: "2.0", id: msg.id, result: { thread: { id: "thread-1" } } });
    } else if (msg.method === "turn/start" || msg.method === "review/start") {
      // Notifications the server may emit before its own response reaches the client.
      if (beforeTurnStartResponse) beforeTurnStartResponse(send);
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: turnStartResult ??
          { reviewThreadId: "thread-1", turn: { id: "turn-1", status: "inProgress" } },
      });
      if (turnStartResult) return;
      if (onTurnStart) {
        onTurnStart(send);
        return;
      }
      send({
        jsonrpc: "2.0",
        method: "item/completed",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          item: { type: "agentMessage", text: "MOCK_DONE", phase: "final_answer" },
        },
      });
      send({
        jsonrpc: "2.0",
        method: "turn/completed",
        params: {
          threadId: "thread-1",
          turn: { id: "turn-1", status: "completed", error: null, items: [] },
        },
      });
    } else {
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
    }
  };
}

function runDriver(args, { port, stdin, env, session } = {}) {
  // session: explicit dir | undefined (make one for `port`) | null (pass none at all)
  const dir = session === undefined ? makeSession(port) : session;
  const fullArgs = dir ? ["--session", dir, ...args] : args;
  return new Promise((resolve) => {
    // spawnDriver inherits process.env; blank the var a developer may have set.
    const child = spawnDriver(fullArgs, { CODEX_BRIDGE_SESSION: "", ...env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (stdin !== undefined) child.stdin.write(stdin);
    child.stdin.end();
  });
}

const findRequest = (recorded, method) => recorded.find((m) => m.method === method);

test("turn: sandbox pinned to danger-full-access at thread AND turn level", async () => {
  const recorded = [];
  const server = await startMockServer(appServerBehaviour(recorded));
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "hello" });
  server.close();
  assert.equal(r.code, 0, r.stderr);

  const threadStart = findRequest(recorded, "thread/start");
  assert.equal(threadStart.params.sandbox, "danger-full-access");
  assert.equal(threadStart.params.approvalPolicy, "never");

  const turnStart = findRequest(recorded, "turn/start");
  assert.deepEqual(turnStart.params.sandboxPolicy, { type: "dangerFullAccess" });
  assert.equal(turnStart.params.approvalPolicy, "never");
  assert.deepEqual(turnStart.params.input, [{ type: "text", text: "hello" }]);

  const out = JSON.parse(r.stdout);
  assert.equal(out.finalMessage, "MOCK_DONE");
  assert.equal(out.threadId, "thread-1");
  assert.equal(out.turnId, "turn-1");
  assert.equal(out.reviewTurnId, null);
  assert.equal(out.turnStatus, "completed");
});

test("containment probe runs before thread/start and uses command/exec", async () => {
  const recorded = [];
  const server = await startMockServer(appServerBehaviour(recorded));
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "hi" });
  server.close();
  assert.equal(r.code, 0, r.stderr);
  const methods = recorded.filter((m) => m.id !== undefined).map((m) => m.method);
  const probeIdx = methods.indexOf("command/exec");
  const threadIdx = methods.indexOf("thread/start");
  assert.ok(probeIdx >= 0, "probe must run");
  assert.ok(probeIdx < threadIdx, "probe must run before thread/start");
  const probe = findRequest(recorded, "command/exec");
  assert.equal(probe.params.cwd, "/tmp");
  assert.match(probe.params.command.join(" "), /touch "\$HOME\//);
  assert.match(probe.params.command.join(" "), /touch "\/tmp\//);
  // The probe must not trip codex's own Seatbelt (nested sandbox dies in the
  // Claude sandbox); it must run in the server's inherited context.
  assert.deepEqual(probe.params.sandboxPolicy, { type: "dangerFullAccess" });
});

test("containment: HOME or /tmp writable => refuse before any thread exists", async () => {
  for (const probeStdout of ["WRITABLE BLOCKED WRITABLE", "BLOCKED WRITABLE WRITABLE"]) {
    const recorded = [];
    const server = await startMockServer(appServerBehaviour(recorded, { probeStdout }));
    const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "hi" });
    server.close();
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /NOT confined/);
    assert.equal(findRequest(recorded, "thread/start"), undefined, probeStdout);
    assert.equal(findRequest(recorded, "turn/start"), undefined, probeStdout);
  }
});

test("containment: cwd not writable => refuse (wrong session's server)", async () => {
  const recorded = [];
  const server = await startMockServer(
    appServerBehaviour(recorded, { probeStdout: "BLOCKED BLOCKED BLOCKED" }),
  );
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "hi" });
  server.close();
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /cannot write/);
  assert.equal(findRequest(recorded, "thread/start"), undefined);
});

test("containment: probe output that is not three known words => refuse, not misdiagnose", async () => {
  for (const probeStdout of ["", "garbage", "BLOCKED BLOCKED", "BLOCKED BLOCKED MAYBE"]) {
    const recorded = [];
    const server = await startMockServer(appServerBehaviour(recorded, { probeStdout }));
    const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "hi" });
    server.close();
    assert.notEqual(r.code, 0, JSON.stringify(probeStdout));
    assert.match(r.stderr, /probe output/, JSON.stringify(probeStdout));
    assert.doesNotMatch(r.stderr, /NOT confined/, JSON.stringify(probeStdout));
    assert.equal(findRequest(recorded, "thread/start"), undefined, JSON.stringify(probeStdout));
  }
});

test("a non-numeric control timeout override is rejected, not turned into NaN", async () => {
  let connected = false;
  const server = await startMockServer(() => {
    connected = true;
  });
  const r = await runDriver(["--cwd", "/tmp"], {
    port: server.port,
    stdin: "x",
    env: { CODEX_BRIDGE_CONTROL_TIMEOUT_MS: "soon" },
  });
  server.close();
  assert.equal(r.code, 2);
  assert.match(r.stderr, /CODEX_BRIDGE_CONTROL_TIMEOUT_MS/);
  assert.equal(connected, false);
});

test("resume: a thread held by another client fails with an actionable hint", async () => {
  const recorded = [];
  const server = await startMockServer((msg, send) => {
    if (msg.method) recorded.push(msg);
    if (msg.id === undefined) return;
    if (msg.method === "thread/resume") {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32600, message: "thread thread-7 already has an active writer" },
      });
    } else appServerBehaviour(recorded)(msg, send);
  });
  const r = await runDriver(["--cwd", "/tmp", "--thread", "thread-7"], {
    port: server.port,
    stdin: "again",
  });
  server.close();
  assert.equal(r.code, 1);
  assert.match(r.stderr, /another codex client/);
  assert.match(r.stderr, /start a new thread/);
  assert.equal(findRequest(recorded, "turn/start"), undefined);
});

test("resume: thread/resume also carries pinned sandbox values", async () => {
  const recorded = [];
  const server = await startMockServer(appServerBehaviour(recorded));
  const r = await runDriver(["--cwd", "/tmp", "--thread", "thread-1"], {
    port: server.port,
    stdin: "again",
  });
  server.close();
  assert.equal(r.code, 0, r.stderr);

  const resume = findRequest(recorded, "thread/resume");
  assert.equal(resume.params.threadId, "thread-1");
  assert.equal(resume.params.sandbox, "danger-full-access");
  assert.equal(resume.params.approvalPolicy, "never");
  assert.equal(findRequest(recorded, "thread/start"), undefined);
});

test("review: review/start carries target verbatim on a danger-pinned thread", async () => {
  const recorded = [];
  const server = await startMockServer(appServerBehaviour(recorded));
  const r = await runDriver(["--cwd", "/tmp", "--review", "uncommitted"], { port: server.port });
  server.close();
  assert.equal(r.code, 0, r.stderr);

  assert.equal(findRequest(recorded, "thread/start").params.sandbox, "danger-full-access");
  const review = findRequest(recorded, "review/start");
  assert.deepEqual(review.params.target, { type: "uncommittedChanges" });
  assert.equal(review.params.delivery, "inline");
  assert.equal(review.params.threadId, "thread-1");
  assert.equal(findRequest(recorded, "turn/start"), undefined);
});

test("review: a reviewThreadId other than our thread fails closed instead of hanging", async () => {
  // delivery "inline" runs the review on the thread we started (measured), so every event
  // arrives on that threadId. A different reviewThreadId would mean events we have no
  // buffer for; refuse rather than wait forever.
  const recorded = [];
  const server = await startMockServer((msg, send) => {
    if (msg.id === undefined) return;
    if (msg.method === "review/start") {
      recorded.push(msg); // the fallthrough below records the rest itself
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: { reviewThreadId: "review-thread", turn: { id: "turn-1" } },
      });
      // The moved review's child announces itself on the moved thread.
      setTimeout(
        () =>
          send({
            jsonrpc: "2.0",
            method: "turn/started",
            params: { threadId: "review-thread", turn: { id: "child-turn", status: "inProgress" } },
          }),
        100,
      );
      return;
    }
    appServerBehaviour(recorded)(msg, send);
  });
  const t0 = Date.now();
  const r = await runDriver(
    ["--cwd", "/tmp", "--review", "uncommitted"],
    { port: server.port },
  );
  server.close();
  assert.equal(r.code, 1);
  assert.match(r.stderr, /review-thread/);
  // The server had already accepted the review: it is interrupted where it went, child
  // first (interrupting the parent alone does not stop the child), not left running.
  assert.deepEqual(
    recorded.filter((m) => m.method === "turn/interrupt").map((m) => m.params),
    [
      { threadId: "review-thread", turnId: "child-turn" },
      { threadId: "review-thread", turnId: "turn-1" },
    ],
  );
  assert.ok(Date.now() - t0 < 1500, "child known: no waiting");
});

test("a frame that is not JSON aborts (with interrupt) instead of crashing", async () => {
  const recorded = [];
  const server = await startMockServer(
    appServerBehaviour(recorded, {
      onTurnStart: (send) => send.raw?.("this is not json") ?? send({ __raw: "this is not json" }),
    }),
  );
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "x" });
  server.close();
  assert.equal(r.code, 1);
  assert.match(r.stderr, /not JSON/);
  assert.deepEqual(findRequest(recorded, "turn/interrupt").params, {
    threadId: "thread-1",
    turnId: "turn-1",
  });
});

test("unreadable --target-file and unparsable --schema are usage errors, not stack traces", async () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-turn-bad-"));
  const badSchema = join(dir, "schema.json");
  writeFileSync(badSchema, "{ not json");
  const missing = join(dir, "missing.txt");
  const cases = [
    [["--review", "base", "--target-file", missing], /--target-file .*ENOENT/],
    [["--schema", badSchema], /--schema .*JSON/],
  ];
  for (const [args, re] of cases) {
    const r = await runDriver(["--cwd", "/tmp", ...args], { stdin: "x", session: makeSession(1) });
    assert.equal(r.code, 2, args.join(" "));
    assert.match(r.stderr, re, args.join(" "));
    assert.doesNotMatch(r.stderr, /\n\s+at /, "no stack trace");
  }
});

test("thread/start tells codex it is inside the Claude sandbox", async () => {
  const recorded = [];
  const server = await startMockServer(appServerBehaviour(recorded));
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "hi" });
  server.close();
  assert.equal(r.code, 0, r.stderr);
  const instructions = findRequest(recorded, "thread/start").params.developerInstructions;
  assert.match(instructions, /Claude Code CLI's OS sandbox/);
  assert.match(instructions, /\$TMPDIR/);
});

test("the sandbox brief points at the skill file when one is found", async () => {
  const notes = join(mkdtempSync(join(tmpdir(), "codex-turn-skill-")), "SKILL.md");
  writeFileSync(notes, "# cc-cli-sandbox\n");
  const recorded = [];
  const server = await startMockServer(appServerBehaviour(recorded));
  const r = await runDriver(["--cwd", "/tmp"], {
    port: server.port,
    stdin: "hi",
    env: { CODEX_BRIDGE_SANDBOX_SKILL: notes },
  });
  server.close();
  assert.equal(r.code, 0, r.stderr);
  assert.ok(
    findRequest(recorded, "thread/start").params.developerInstructions.includes(notes),
    "expected the resolved skill path to be referenced",
  );
});

test("unknown flags are rejected before connecting (no sandbox injection path)", async () => {
  let connected = false;
  const server = await startMockServer(() => {
    connected = true;
  });
  for (
    const args of [
      ["--sandbox", "read-only"],
      ["--sandbox-policy", '{"type":"readOnly"}'],
      ["--approval-policy", "untrusted"],
      // Retired endpoint/token/prompt flags: the session dir is the only route.
      ["--port", "1"],
      ["--token-file", "/dev/null"],
      ["--url", "ws://127.0.0.1:1"],
      ["--prompt", "hi"],
    ]
  ) {
    const r = await runDriver(args, { port: server.port, stdin: "x" });
    assert.equal(r.code, 2, `expected rejection for ${args[0]}`);
    assert.match(r.stderr, /Unknown option/i);
  }
  server.close();
  assert.equal(connected, false);
});

test("no session is rejected before connecting (there is no default endpoint)", async () => {
  let connected = false;
  const server = await startMockServer(() => {
    connected = true;
  });
  const r = await runDriver(["--cwd", "/tmp"], { stdin: "x", session: null });
  server.close();
  assert.equal(r.code, 2);
  assert.match(r.stderr, /no session/);
  assert.equal(connected, false);
});

test("session without a port file (ready not run) is rejected with a hint", async () => {
  const dir = makeSession(undefined);
  const r = await runDriver(["--cwd", "/tmp"], { stdin: "x", session: dir });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /ready/);
});

test("malformed port files are rejected before connecting", async () => {
  for (const portText of ["", "abc", "0", "65536", "80 extra", "ws://127.0.0.1:41100"]) {
    const dir = makeSession(undefined, { portText });
    const r = await runDriver(["--cwd", "/tmp"], { stdin: "x", session: dir });
    assert.equal(r.code, 2, JSON.stringify(portText));
    assert.match(r.stderr, /port/, JSON.stringify(portText));
  }
});

test("empty token file is rejected before connecting", async () => {
  let connected = false;
  const server = await startMockServer(() => {
    connected = true;
  });
  const dir = makeSession(server.port, { token: "\n" });
  const r = await runDriver(["--cwd", "/tmp"], { stdin: "x", session: dir });
  server.close();
  assert.equal(r.code, 2);
  assert.match(r.stderr, /token/);
  assert.equal(connected, false);
});

test("CODEX_BRIDGE_SESSION env is an alternative to --session", async () => {
  const recorded = [];
  const server = await startMockServer(appServerBehaviour(recorded));
  const dir = makeSession(server.port);
  const r = await runDriver(["--cwd", "/tmp"], {
    stdin: "hi",
    session: null,
    env: { CODEX_BRIDGE_SESSION: dir },
  });
  server.close();
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(server.authHeaders, ["Bearer sekrit-token-123"]);
});

test("review tuning flags that cannot be applied are rejected", async () => {
  let connected = false;
  const server = await startMockServer(() => {
    connected = true;
  });
  // review/start carries only {threadId, target, delivery}: an outputSchema and a per-turn
  // effort have nowhere to go. --model is NOT here; it is thread-level (below).
  for (const extra of [["--effort", "high"], ["--schema", "/dev/null"]]) {
    const r = await runDriver(["--review", "uncommitted", ...extra], { port: server.port });
    assert.equal(r.code, 2, `expected rejection for --review with ${extra[0]}`);
  }
  server.close();
  assert.equal(connected, false);
});

test("review: --model rides on thread/start (review/start has no model slot)", async () => {
  const recorded = [];
  const server = await startMockServer(appServerBehaviour(recorded));
  const r = await runDriver([
    "--cwd",
    "/tmp",
    "--model",
    "gpt-5.4-mini",
    "--review",
    "uncommitted",
  ], { port: server.port });
  server.close();
  assert.equal(r.code, 0, r.stderr);

  assert.equal(findRequest(recorded, "thread/start").params.model, "gpt-5.4-mini");
  assert.equal(findRequest(recorded, "review/start").params.model, undefined);
});

test("resume carries --model too (ThreadResumeParams accepts it)", async () => {
  const recorded = [];
  const server = await startMockServer(appServerBehaviour(recorded));
  const r = await runDriver([
    "--cwd",
    "/tmp",
    "--thread",
    "thread-9",
    "--model",
    "gpt-5.4-mini",
  ], { port: server.port, stdin: "hi" });
  server.close();
  assert.equal(r.code, 0, r.stderr);
  assert.equal(findRequest(recorded, "thread/resume").params.model, "gpt-5.4-mini");
});

test("events from unrelated threads and turns are ignored", async () => {
  const recorded = [];
  const server = await startMockServer(
    appServerBehaviour(recorded, {
      onTurnStart: (send) => {
        // Noise: another thread, another turn on the same thread, an item from
        // another turn on the same thread.
        send({
          jsonrpc: "2.0",
          method: "item/completed",
          params: {
            threadId: "other-thread",
            item: { type: "agentMessage", text: "WRONG", phase: "final_answer" },
          },
        });
        send({
          jsonrpc: "2.0",
          method: "item/completed",
          params: {
            threadId: "thread-1",
            turnId: "other-turn",
            item: { type: "agentMessage", text: "WRONG2", phase: "final_answer" },
          },
        });
        send({
          jsonrpc: "2.0",
          method: "turn/completed",
          params: {
            threadId: "other-thread",
            turn: { id: "other-turn", status: "completed", items: [] },
          },
        });
        send({
          jsonrpc: "2.0",
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "child-turn", status: "completed", items: [] },
          },
        });
        // The real completion.
        send({
          jsonrpc: "2.0",
          method: "item/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: { type: "agentMessage", text: "RIGHT", phase: "final_answer" },
          },
        });
        send({
          jsonrpc: "2.0",
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null, items: [] },
          },
        });
      },
    }),
  );
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "x" });
  server.close();
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.finalMessage, "RIGHT");
});

test("completions arriving before our turn is identified are ignored", async () => {
  const recorded = [];
  const server = await startMockServer(
    appServerBehaviour(recorded, {
      // Noise from a concurrent driver's turn, delivered while this driver is
      // still initializing (no thread, no turn of its own yet).
      beforeInit: (send) => {
        send({
          jsonrpc: "2.0",
          method: "turn/completed",
          params: {
            threadId: "other-thread",
            turn: { id: "other-turn", status: "completed", items: [] },
          },
        });
        send({
          jsonrpc: "2.0",
          method: "turn/completed",
          params: { turn: { id: "no-thread-turn", status: "completed", items: [] } },
        });
      },
    }),
  );
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "x" });
  server.close();
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.finalMessage, "MOCK_DONE");
  assert.ok(findRequest(recorded, "turn/start"));
});

test("review: base/commit take their value from --target-file verbatim (no shell)", async () => {
  // A branch name git accepts but no shell quoting discipline survives.
  const branch = "topic/$(id)/it's";
  const cases = [
    ["base", `${branch}\n`, { type: "baseBranch", branch }],
    ["commit", "0123abcd\n", { type: "commit", sha: "0123abcd" }],
    // Only the line terminator comes off: leading/trailing Unicode whitespace is part of
    // the name git accepts, and trimming it would silently review another branch.
    ["base", "\u00a0main \r\n", { type: "baseBranch", branch: "\u00a0main " }],
  ];
  for (const [mode, fileText, expected] of cases) {
    const recorded = [];
    const server = await startMockServer(appServerBehaviour(recorded));
    const file = join(mkdtempSync(join(tmpdir(), "codex-turn-target-")), "target.txt");
    writeFileSync(file, fileText);
    const r = await runDriver(["--cwd", "/tmp", "--review", mode, "--target-file", file], {
      port: server.port,
    });
    server.close();
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(findRequest(recorded, "review/start").params.target, expected);
  }
});

test("review: custom takes its instructions from stdin unexpanded", async () => {
  const recorded = [];
  const server = await startMockServer(appServerBehaviour(recorded));
  const instructions = "check `$(rm -rf)` handling, don't expand\n";
  const r = await runDriver(["--cwd", "/tmp", "--review", "custom"], {
    port: server.port,
    stdin: instructions,
  });
  server.close();
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(findRequest(recorded, "review/start").params.target, {
    type: "custom",
    instructions,
  });
});

test("review: mode/target-file mismatches and bad files are rejected before connecting", async () => {
  let connected = false;
  const server = await startMockServer(() => {
    connected = true;
  });
  const dir = mkdtempSync(join(tmpdir(), "codex-turn-target-"));
  const empty = join(dir, "empty.txt");
  writeFileSync(empty, "\n");
  const twoLines = join(dir, "two.txt");
  writeFileSync(twoLines, "main\nrelease\n");
  const ok = join(dir, "ok.txt");
  writeFileSync(ok, "main\n");
  const cases = [
    [["--review", "nonsense"], /must be one of/],
    [["--review", "base"], /needs --target-file/],
    [["--review", "commit"], /needs --target-file/],
    [["--review", "uncommitted", "--target-file", ok], /only applies/],
    [["--review", "custom", "--target-file", ok], /only applies/],
    [["--target-file", ok], /only applies/],
    [["--review", "base", "--target-file", empty], /one non-empty line/],
    [["--review", "base", "--target-file", twoLines], /one non-empty line/],
    [["--review", "custom"], /empty instructions/],
  ];
  for (const [args, re] of cases) {
    const r = await runDriver(["--cwd", "/tmp", ...args], { port: server.port, stdin: "" });
    assert.equal(r.code, 2, args.join(" "));
    assert.match(r.stderr, re, args.join(" "));
  }
  server.close();
  assert.equal(connected, false);
});

test("latest agent message wins when no final_answer phase is present", async () => {
  const recorded = [];
  const server = await startMockServer(
    appServerBehaviour(recorded, {
      onTurnStart: (send) => {
        for (const text of ["preamble", "actual answer"]) {
          send({
            jsonrpc: "2.0",
            method: "item/completed",
            params: {
              threadId: "thread-1",
              turnId: "turn-1",
              item: { type: "agentMessage", text },
            },
          });
        }
        send({
          jsonrpc: "2.0",
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null, items: [] },
          },
        });
      },
    }),
  );
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "x" });
  server.close();
  assert.equal(r.code, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).finalMessage, "actual answer");
});

test("SIGTERM during a review interrupts the subagent child turn as well as ours", async () => {
  const recorded = [];
  let child;
  const server = await startMockServer(
    appServerBehaviour(recorded, {
      onTurnStart: (send) => {
        // What a real review emits on our thread: a turn/started for the child turn.
        send({
          jsonrpc: "2.0",
          method: "turn/started",
          params: { threadId: "thread-1", turn: { id: "child-turn", status: "inProgress" } },
        });
        setTimeout(() => child.kill("SIGTERM"), 150);
      },
    }),
  );
  const result = new Promise((resolve) => {
    child = spawnDriver(
      ["--session", makeSession(server.port), "--cwd", "/tmp", "--review", "uncommitted"],
      {},
    );
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stderr }));
    child.stdin.end();
  });
  const t0 = Date.now();
  const r = await result;
  server.close();
  assert.equal(r.code, 130, r.stderr);
  assert.doesNotMatch(r.stderr, /not acknowledged/);
  assert.ok(Date.now() - t0 < 1500, "known child: no waiting");
  const interrupts = recorded.filter((m) => m.method === "turn/interrupt").map((m) => m.params);
  assert.deepEqual(interrupts, [
    { threadId: "thread-1", turnId: "child-turn" },
    { threadId: "thread-1", turnId: "turn-1" },
  ]);
});

test("SIGTERM before the review child's turn/started arrives still waits for and interrupts it", async () => {
  const recorded = [];
  let child;
  const server = await startMockServer(
    appServerBehaviour(recorded, {
      onTurnStart: (send) => {
        // The child's turn/started trails the review/start response by a moment (measured);
        // the cancel lands inside that window.
        setTimeout(() => child.kill("SIGTERM"), 100);
        setTimeout(
          () =>
            send({
              jsonrpc: "2.0",
              method: "turn/started",
              params: { threadId: "thread-1", turn: { id: "child-turn", status: "inProgress" } },
            }),
          400,
        );
      },
    }),
  );
  const result = new Promise((resolve) => {
    child = spawnDriver(
      ["--session", makeSession(server.port), "--cwd", "/tmp", "--review", "uncommitted"],
      {},
    );
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stderr }));
    child.stdin.end();
  });
  const r = await result;
  server.close();
  assert.equal(r.code, 130, r.stderr);
  assert.deepEqual(
    recorded.filter((m) => m.method === "turn/interrupt").map((m) => m.params.turnId),
    ["child-turn", "turn-1"],
  );
});

test("connection dropping while the interrupt is pending is reported, with the abort's exit code", async () => {
  const recorded = [];
  let child;
  const server = await startMockServer((msg, send) => {
    if (msg.method) recorded.push(msg);
    if (msg.id === undefined) return;
    if (msg.method === "turn/interrupt") {
      server.close(); // never acknowledged: the socket goes away instead
      return;
    }
    appServerBehaviour(recorded, {
      onTurnStart: () => setTimeout(() => child.kill("SIGTERM"), 100),
    })(msg, send);
  });
  const result = new Promise((resolve) => {
    child = spawnDriver(["--session", makeSession(server.port), "--cwd", "/tmp"], {});
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stderr }));
    child.stdin.write("x");
    child.stdin.end();
  });
  const t0 = Date.now();
  const r = await result;
  assert.equal(r.code, 130, r.stderr);
  assert.match(r.stderr, /SIGTERM: turn interrupted/);
  // The close must reject the pending interrupt at once (not via the 3 s timeout).
  assert.match(
    r.stderr,
    /turn\/interrupt was not acknowledged \(turn\/interrupt: connection closed\)/,
  );
  assert.ok(Date.now() - t0 < 1500, "must not wait for the interrupt timeout");
});

test("SIGTERM during a turn sends turn/interrupt before exiting", async () => {
  const recorded = [];
  let child;
  const server = await startMockServer(
    appServerBehaviour(recorded, {
      onTurnStart: () => {
        // Turn never completes; cancel the driver instead.
        setTimeout(() => child.kill("SIGTERM"), 100);
      },
    }),
  );
  const result = new Promise((resolve) => {
    child = spawnDriver(["--session", makeSession(server.port), "--cwd", "/tmp"], {});
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stderr }));
    child.stdin.write("long task");
    child.stdin.end();
  });
  const t0 = Date.now();
  const r = await result;
  server.close();
  assert.equal(r.code, 130, r.stderr);
  assert.doesNotMatch(r.stderr, /not acknowledged/);
  assert.ok(Date.now() - t0 < 1500, "a plain turn must not wait for a review child");
  const interrupt = findRequest(recorded, "turn/interrupt");
  assert.deepEqual(interrupt.params, { threadId: "thread-1", turnId: "turn-1" });
});

test("SIGTERM racing the turn/start response still interrupts the turn", async () => {
  const recorded = [];
  let child;
  const server = await startMockServer((msg, send) => {
    if (msg.method) recorded.push(msg);
    if (msg.id === undefined) return;
    if (msg.method === "initialize") send({ jsonrpc: "2.0", id: msg.id, result: {} });
    else if (msg.method === "command/exec") {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: { exitCode: 0, stdout: "BLOCKED BLOCKED WRITABLE\n", stderr: "" },
      });
    } else if (msg.method === "thread/start") {
      send({ jsonrpc: "2.0", id: msg.id, result: { thread: { id: "thread-1" } } });
    } else if (msg.method === "turn/start") {
      // The server accepted the turn but the response is slow: kill the driver
      // first, answer afterwards.
      setTimeout(() => child.kill("SIGTERM"), 50);
      setTimeout(
        () => send({ jsonrpc: "2.0", id: msg.id, result: { turn: { id: "turn-1" } } }),
        400,
      );
    } else {
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
    }
  });
  const result = new Promise((resolve) => {
    child = spawnDriver(["--session", makeSession(server.port), "--cwd", "/tmp"], {});
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stderr }));
    child.stdin.write("long task");
    child.stdin.end();
  });
  const t0 = Date.now();
  const r = await result;
  server.close();
  assert.equal(r.code, 130, r.stderr);
  assert.doesNotMatch(r.stderr, /not acknowledged/);
  assert.ok(Date.now() - t0 < 1500, "must proceed as soon as the start response arrives");
  const interrupt = findRequest(recorded, "turn/interrupt");
  assert.deepEqual(interrupt.params, { threadId: "thread-1", turnId: "turn-1" });
});

test("a 401 during a review interrupts the child turn as well as ours", async () => {
  const recorded = [];
  const server = await startMockServer(
    appServerBehaviour(recorded, {
      onTurnStart: (send) => {
        send({
          jsonrpc: "2.0",
          method: "turn/started",
          params: { threadId: "thread-1", turn: { id: "child-turn", status: "inProgress" } },
        });
        send({
          jsonrpc: "2.0",
          method: "error",
          params: {
            threadId: "thread-1",
            turnId: "child-turn",
            willRetry: true,
            error: { codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 401 } } },
          },
        });
      },
    }),
  );
  const r = await runDriver(["--cwd", "/tmp", "--review", "uncommitted"], { port: server.port });
  server.close();
  assert.equal(r.code, 1);
  assert.match(r.stderr, /401 Unauthorized/);
  assert.deepEqual(
    recorded.filter((m) => m.method === "turn/interrupt").map((m) => m.params.turnId),
    ["child-turn", "turn-1"],
  );
});

test("a review child turn/started arriving before the review/start response is not lost", async () => {
  const recorded = [];
  let child;
  const server = await startMockServer(
    appServerBehaviour(recorded, {
      beforeTurnStartResponse: (send) => {
        send({
          jsonrpc: "2.0",
          method: "turn/started",
          params: { threadId: "thread-1", turn: { id: "child-turn", status: "inProgress" } },
        });
      },
      onTurnStart: () => setTimeout(() => child.kill("SIGTERM"), 150),
    }),
  );
  const result = new Promise((resolve) => {
    child = spawnDriver(
      ["--session", makeSession(server.port), "--cwd", "/tmp", "--review", "uncommitted"],
      {},
    );
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stderr }));
    child.stdin.end();
  });
  const r = await result;
  server.close();
  assert.equal(r.code, 130, r.stderr);
  assert.deepEqual(
    recorded.filter((m) => m.method === "turn/interrupt").map((m) => m.params.turnId),
    ["child-turn", "turn-1"],
  );
});

test("review result carries the child turn id for turn-context", async () => {
  const recorded = [];
  const server = await startMockServer(
    appServerBehaviour(recorded, {
      onTurnStart: (send) => {
        send({
          jsonrpc: "2.0",
          method: "turn/started",
          params: { threadId: "thread-1", turn: { id: "child-turn", status: "inProgress" } },
        });
        send({
          jsonrpc: "2.0",
          method: "turn/completed",
          params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed", items: [] } },
        });
      },
    }),
  );
  const r = await runDriver(["--cwd", "/tmp", "--review", "uncommitted"], { port: server.port });
  server.close();
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.turnId, "turn-1");
  assert.equal(out.reviewTurnId, "child-turn");
});

test("the 401 explanation survives a turn/completed racing the interrupt response", async () => {
  const recorded = [];
  const server = await startMockServer((msg, send) => {
    if (msg.method) recorded.push(msg);
    if (msg.id === undefined) return;
    if (msg.method === "turn/interrupt") {
      // Real servers emit the interrupted turn's completion; make it land before the
      // interrupt response so the main path settles first.
      send({
        jsonrpc: "2.0",
        method: "turn/completed",
        params: { threadId: "thread-1", turn: { id: "turn-1", status: "interrupted", items: [] } },
      });
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
      return;
    }
    appServerBehaviour(recorded, {
      onTurnStart: (s) =>
        s({
          jsonrpc: "2.0",
          method: "error",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            error: { codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 401 } } },
          },
        }),
    })(msg, send);
  });
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "x" });
  server.close();
  assert.equal(r.code, 1);
  assert.match(r.stderr, /401 Unauthorized/);
});

test("a 401 arriving before the turn/start response still interrupts the turn", async () => {
  const recorded = [];
  const server = await startMockServer(
    appServerBehaviour(recorded, {
      beforeTurnStartResponse: (send) =>
        send({
          jsonrpc: "2.0",
          method: "error",
          params: {
            threadId: "thread-1",
            error: { codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 401 } } },
          },
        }),
      onTurnStart: () => {},
    }),
  );
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "x" });
  server.close();
  assert.equal(r.code, 1);
  assert.match(r.stderr, /401 Unauthorized/);
  assert.deepEqual(findRequest(recorded, "turn/interrupt").params, {
    threadId: "thread-1",
    turnId: "turn-1",
  });
});

test("repeated 401s while the turn/start response is pending still end in an interrupt", async () => {
  const recorded = [];
  const err = {
    jsonrpc: "2.0",
    method: "error",
    params: {
      threadId: "thread-1",
      error: { codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 401 } } },
    },
  };
  const server = await startMockServer((msg, send) => {
    if (msg.method) recorded.push(msg);
    if (msg.id === undefined) return;
    if (msg.method === "turn/start") {
      // The server keeps retrying (several 401s) and only then answers turn/start.
      send(err);
      setTimeout(() => send(err), 100);
      setTimeout(() => send(err), 200);
      setTimeout(
        () => send({ jsonrpc: "2.0", id: msg.id, result: { turn: { id: "turn-1" } } }),
        400,
      );
      return;
    }
    appServerBehaviour(recorded)(msg, send);
  });
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "x" });
  server.close();
  assert.equal(r.code, 1);
  assert.equal((r.stderr.match(/401 Unauthorized/g) ?? []).length, 1, "reason printed once");
  assert.deepEqual(findRequest(recorded, "turn/interrupt").params, {
    threadId: "thread-1",
    turnId: "turn-1",
  });
});

test("a 401 for a turn that is not ours is ignored", async () => {
  const recorded = [];
  const server = await startMockServer(
    appServerBehaviour(recorded, {
      onTurnStart: (send) => {
        send({
          jsonrpc: "2.0",
          method: "error",
          params: {
            threadId: "thread-1",
            turnId: "unrelated-turn",
            error: { codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 401 } } },
          },
        });
        send({
          jsonrpc: "2.0",
          method: "item/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: { type: "agentMessage", text: "FINE", phase: "final_answer" },
          },
        });
        send({
          jsonrpc: "2.0",
          method: "turn/completed",
          params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed", items: [] } },
        });
      },
    }),
  );
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "x" });
  server.close();
  assert.equal(r.code, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).finalMessage, "FINE");
  assert.equal(findRequest(recorded, "turn/interrupt"), undefined);
  assert.doesNotMatch(r.stderr, /401 Unauthorized/);
});

test("a 401 before the review child announces itself still waits for and interrupts the child", async () => {
  const recorded = [];
  const server = await startMockServer(
    appServerBehaviour(recorded, {
      onTurnStart: (send) => {
        send({
          jsonrpc: "2.0",
          method: "error",
          params: {
            threadId: "thread-1",
            turnId: "child-turn", // the child's own 401, before its turn/started
            error: { codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 401 } } },
          },
        });
        setTimeout(
          () =>
            send({
              jsonrpc: "2.0",
              method: "turn/started",
              params: { threadId: "thread-1", turn: { id: "child-turn", status: "inProgress" } },
            }),
          300,
        );
      },
    }),
  );
  const r = await runDriver(["--cwd", "/tmp", "--review", "uncommitted"], { port: server.port });
  server.close();
  assert.equal(r.code, 1);
  assert.match(r.stderr, /401 Unauthorized/);
  assert.deepEqual(
    recorded.filter((m) => m.method === "turn/interrupt").map((m) => m.params.turnId),
    ["child-turn", "turn-1"],
  );
});

test("SIGTERM during preflight stops the run before any thread or turn is created", async () => {
  const recorded = [];
  let child;
  const server = await startMockServer((msg, send) => {
    if (msg.method) recorded.push(msg);
    if (msg.id === undefined) return;
    if (msg.method === "command/exec") {
      // Slow containment probe; the cancel lands while it is pending.
      setTimeout(() => child.kill("SIGTERM"), 50);
      setTimeout(
        () =>
          send({
            jsonrpc: "2.0",
            id: msg.id,
            result: { exitCode: 0, stdout: "BLOCKED BLOCKED WRITABLE\n", stderr: "" },
          }),
        400,
      );
      return;
    }
    appServerBehaviour(recorded)(msg, send);
  });
  const result = new Promise((resolve) => {
    child = spawnDriver(["--session", makeSession(server.port), "--cwd", "/tmp"], {});
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stderr }));
    child.stdin.write("x");
    child.stdin.end();
  });
  const t0 = Date.now();
  const r = await result;
  server.close();
  assert.equal(r.code, 130, r.stderr);
  assert.ok(Date.now() - t0 < 1500, "preflight must be cut short, not waited out");
  assert.match(r.stderr, /nothing to interrupt/);
  assert.equal(findRequest(recorded, "thread/start"), undefined, "must not go on to start");
  assert.equal(findRequest(recorded, "turn/interrupt"), undefined);
});

test("SIGTERM while turn/start is unanswered gives the response a short deadline, then reports", async () => {
  const recorded = [];
  let child;
  const server = await startMockServer((msg, send) => {
    if (msg.method) recorded.push(msg);
    if (msg.id === undefined) return;
    if (msg.method === "turn/start") {
      setTimeout(() => child.kill("SIGTERM"), 50);
      return; // never answered
    }
    appServerBehaviour(recorded)(msg, send);
  });
  const result = new Promise((resolve) => {
    child = spawnDriver(["--session", makeSession(server.port), "--cwd", "/tmp"], {});
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stderr }));
    child.stdin.write("x");
    child.stdin.end();
  });
  const started = Date.now();
  const r = await result;
  server.close();
  assert.equal(r.code, 130, r.stderr);
  // The start request keeps its own 30 s timeout, but a cancel must not wait that long:
  // the decision gets a short deadline and the uncertainty is reported.
  assert.ok(Date.now() - started < 8000, "cancel must not wait for the control-plane timeout");
  assert.match(r.stderr, /turn\/start response/);
  assert.match(r.stderr, /may still be running/);
  assert.equal(findRequest(recorded, "turn/interrupt"), undefined);
});

test("a 401 from OpenAI mid-turn interrupts and fails instead of waiting forever", async () => {
  const recorded = [];
  const server = await startMockServer(
    appServerBehaviour(recorded, {
      onTurnStart: (send) => {
        // What the app-server emits when it cannot read auth.json: retrying error events,
        // never a turn/completed.
        send({
          jsonrpc: "2.0",
          method: "error",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            willRetry: true,
            error: {
              message: "Reconnecting... 1/5",
              codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 401 } },
            },
          },
        });
      },
    }),
  );
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "x" });
  server.close();
  assert.equal(r.code, 1);
  assert.match(r.stderr, /401 Unauthorized/);
  assert.match(r.stderr, /auth\.json/);
  assert.deepEqual(findRequest(recorded, "turn/interrupt").params, {
    threadId: "thread-1",
    turnId: "turn-1",
  });
});

test("a start response without a turn id fails instead of hanging", async () => {
  const recorded = [];
  const server = await startMockServer(
    appServerBehaviour(recorded, { turnStartResult: { turn: {} } }),
  );
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "x" });
  server.close();
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no turn id/);
});

test("stalled control-plane RPCs time out instead of hanging", async () => {
  const server = await startMockServer(() => {
    // Handshake completes but nothing is ever answered.
  });
  const r = await runDriver(["--cwd", "/tmp"], {
    port: server.port,
    stdin: "x",
    env: { CODEX_BRIDGE_CONTROL_TIMEOUT_MS: "500" },
  });
  server.close();
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no response after/);
});

test("the session token is attached as Authorization: Bearer on the handshake", async () => {
  const recorded = [];
  const server = await startMockServer(appServerBehaviour(recorded));
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "x" });
  server.close();
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(server.authHeaders, ["Bearer sekrit-token-123"]);
});

test("server->client requests get schema-valid denials (fail closed)", async () => {
  const denials = {};
  const server = await startMockServer((msg, send) => {
    if (msg.id !== undefined && msg.result !== undefined && msg.id >= 900) {
      denials[msg.id] = { result: msg.result };
      return;
    }
    if (msg.id !== undefined && msg.error !== undefined && msg.id >= 900) {
      denials[msg.id] = { error: msg.error };
      // all three answered -> finish the turn
      send({
        jsonrpc: "2.0",
        method: "turn/completed",
        params: {
          threadId: "thread-1",
          turn: { id: "turn-1", status: "completed", error: null, items: [] },
        },
      });
      return;
    }
    if (msg.id === undefined) return;
    if (msg.method === "initialize") {
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
    } else if (msg.method === "command/exec") {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: { exitCode: 0, stdout: "BLOCKED BLOCKED WRITABLE\n", stderr: "" },
      });
    } else if (msg.method === "thread/start") {
      send({ jsonrpc: "2.0", id: msg.id, result: { thread: { id: "thread-1" } } });
    } else if (msg.method === "turn/start") {
      send({ jsonrpc: "2.0", id: msg.id, result: { turn: { id: "turn-1" } } });
      send({
        jsonrpc: "2.0",
        id: 901,
        method: "item/commandExecution/requestApproval",
        params: {},
      });
      send({ jsonrpc: "2.0", id: 902, method: "execCommandApproval", params: {} });
      send({ jsonrpc: "2.0", id: 903, method: "item/tool/requestUserInput", params: {} });
    }
  });
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "x" });
  server.close();
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(denials[901], { result: { decision: "decline" } });
  assert.deepEqual(denials[902], { result: { decision: "abort" } });
  assert.equal(denials[903].error.code, -32000);
});

// --- Cells of the state x trigger table that only a timing assertion can pin -------------

const reviewAbortScenario = async ({ onTurnStart }) => {
  const recorded = [];
  let child;
  const server = await startMockServer(
    appServerBehaviour(recorded, {
      onTurnStart: (send) => onTurnStart(send, () => child.kill("SIGTERM")),
    }),
  );
  const result = new Promise((resolve) => {
    child = spawnDriver([
      "--session",
      makeSession(server.port),
      "--cwd",
      "/tmp",
      "--review",
      "uncommitted",
    ], {});
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stderr }));
    child.stdin.end();
  });
  const t0 = Date.now();
  const r = await result;
  server.close();
  return {
    ...r,
    elapsed: Date.now() - t0,
    interrupts: recorded.filter((m) => m.method === "turn/interrupt").map((m) => m.params.turnId),
  };
};

test("review with no child ever announced: the child wait is the short bound, then our turn is interrupted", async () => {
  const r = await reviewAbortScenario({ onTurnStart: (_send, kill) => setTimeout(kill, 100) });
  assert.equal(r.code, 130, r.stderr);
  assert.deepEqual(r.interrupts, ["turn-1"]);
  assert.ok(r.elapsed >= 3000 && r.elapsed < 6000, `child bound is 3 s, took ${r.elapsed}ms`);
});

test("review whose turn completes before a child appears: the child wait ends with the turn", async () => {
  const r = await reviewAbortScenario({
    onTurnStart: (send, kill) => {
      setTimeout(kill, 100);
      setTimeout(
        () =>
          send({
            jsonrpc: "2.0",
            method: "turn/completed",
            params: {
              threadId: "thread-1",
              turn: { id: "turn-1", status: "completed", items: [] },
            },
          }),
        200,
      );
    },
  });
  assert.equal(r.code, 130, r.stderr);
  assert.deepEqual(r.interrupts, ["turn-1"]);
  assert.ok(r.elapsed < 1500, `turnDone must cut the child wait, took ${r.elapsed}ms`);
});

test("turn/interrupt that is never answered times out as an exception, reported, exit code kept", async () => {
  const recorded = [];
  let child;
  const server = await startMockServer((msg, send) => {
    if (msg.method) recorded.push(msg);
    if (msg.id === undefined) return;
    if (msg.method === "turn/interrupt") return; // swallowed, connection stays up
    appServerBehaviour(recorded, {
      onTurnStart: () => setTimeout(() => child.kill("SIGTERM"), 100),
    })(msg, send);
  });
  const result = new Promise((resolve) => {
    child = spawnDriver(["--session", makeSession(server.port), "--cwd", "/tmp"], {});
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stderr }));
    child.stdin.write("x");
    child.stdin.end();
  });
  const t0 = Date.now();
  const r = await result;
  server.close();
  const elapsed = Date.now() - t0;
  assert.equal(r.code, 130, r.stderr);
  assert.match(r.stderr, /not acknowledged \(turn\/interrupt: no response after 3000ms\)/);
  assert.ok(elapsed >= 3000 && elapsed < 6000, `took ${elapsed}ms`);
});

test("every control-plane request is bounded, not just initialize", async () => {
  for (const stalled of ["thread/start", "turn/start"]) {
    const recorded = [];
    const server = await startMockServer((msg, send) => {
      if (msg.method) recorded.push(msg);
      if (msg.id === undefined || msg.method === stalled) return;
      appServerBehaviour(recorded)(msg, send);
    });
    const t0 = Date.now();
    const r = await runDriver(["--cwd", "/tmp"], {
      port: server.port,
      stdin: "x",
      env: { CODEX_BRIDGE_CONTROL_TIMEOUT_MS: "500" },
    });
    server.close();
    assert.equal(r.code, 1, stalled);
    assert.ok(r.stderr.includes(`${stalled}: no response after 500ms`), `${stalled}: ${r.stderr}`);
    assert.ok(Date.now() - t0 < 3000, `${stalled}: took too long`);
  }
});

/** A TCP listener that accepts connections but never completes the WebSocket upgrade. */
function silentTcpServer() {
  const sockets = new Set();
  const { promise: connected, resolve: onConnected } = Promise.withResolvers();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    onConnected();
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({
        port: server.address().port,
        connected,
        close: () => {
          for (const s of sockets) s.destroy();
          server.close();
        },
      }))
  );
}

test("a handshake that never completes is bounded by the control timeout", async () => {
  const server = await silentTcpServer();
  const t0 = Date.now();
  const r = await runDriver(["--cwd", "/tmp"], {
    port: server.port,
    stdin: "x",
    env: { CODEX_BRIDGE_CONTROL_TIMEOUT_MS: "500" },
  });
  server.close();
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no WebSocket handshake/);
  assert.ok(Date.now() - t0 < 3000);
});

test("SIGTERM during the handshake exits promptly with nothing to interrupt", async () => {
  const server = await silentTcpServer();
  let child;
  const result = new Promise((resolve) => {
    child = spawnDriver(["--session", makeSession(server.port), "--cwd", "/tmp"], {});
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stderr }));
    child.stdin.write("x");
    child.stdin.end();
    // Signal only once the driver has connected: by then its handlers are installed on every
    // runtime (deno starts slower than a fixed delay would assume).
    server.connected.then(() => setTimeout(() => child.kill("SIGTERM"), 50));
  });
  const t0 = Date.now();
  const r = await result;
  server.close();
  assert.equal(r.code, 130, r.stderr);
  assert.match(r.stderr, /nothing to interrupt/);
  assert.ok(Date.now() - t0 < 1500);
});
