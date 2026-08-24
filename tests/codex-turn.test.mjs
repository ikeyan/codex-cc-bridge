// Pins the security invariants of scripts/codex-turn.mjs against a mock app-server:
//   - a containment probe (command/exec) runs BEFORE any thread is started;
//     HOME writable or cwd non-writable aborts the run
//   - thread/start & thread/resume always carry sandbox "danger-full-access" + approvalPolicy "never"
//   - turn/start always carries sandboxPolicy {type:"dangerFullAccess"} + approvalPolicy "never"
//   - unknown flags are rejected before any connection is made
//   - server->client requests are denied with schema-valid shapes
//   - events from unrelated threads/turns are ignored
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DRIVER = fileURLToPath(new URL("../scripts/codex-turn.mjs", import.meta.url));
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// Minimal RFC6455 text-frame server good enough for JSON-RPC lines in tests.
function startMockServer(onMessage) {
  const sockets = new Set();
  const authHeaders = [];
  const server = net.createServer((socket) => {
    sockets.add(socket);
    let handshaken = false;
    let buf = Buffer.alloc(0);
    const sendJson = (obj) => {
      const payload = Buffer.from(JSON.stringify(obj), "utf8");
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
        if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
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
function appServerBehaviour(recorded, { probeStdout = "BLOCKED WRITABLE", onTurnStart, beforeInit } = {}) {
  return (msg, send) => {
    if (msg.method) recorded.push(msg);
    if (msg.id === undefined) return; // notifications
    if (msg.method === "initialize") {
      if (beforeInit) beforeInit(send);
      send({ jsonrpc: "2.0", id: msg.id, result: { userAgent: "mock" } });
    } else if (msg.method === "command/exec") {
      send({ jsonrpc: "2.0", id: msg.id, result: { exitCode: 0, stdout: probeStdout + "\n", stderr: "" } });
    } else if (msg.method === "thread/start" || msg.method === "thread/resume") {
      send({ jsonrpc: "2.0", id: msg.id, result: { thread: { id: "thread-1" } } });
    } else if (msg.method === "turn/start" || msg.method === "review/start") {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: { reviewThreadId: "thread-1", turn: { id: "turn-1", status: "inProgress" } },
      });
      if (onTurnStart) {
        onTurnStart(send);
        return;
      }
      send({
        jsonrpc: "2.0",
        method: "item/completed",
        params: { threadId: "thread-1", item: { type: "agentMessage", text: "MOCK_DONE", phase: "final_answer" } },
      });
      send({
        jsonrpc: "2.0",
        method: "turn/completed",
        params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed", error: null, items: [] } },
      });
    } else {
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
    }
  };
}

function runDriver(args, { port, stdin } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [DRIVER, ...args], {
      env: { ...process.env, ...(port ? { CODEX_BRIDGE_PORT: String(port) } : {}) },
    });
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
  // The probe must not trip codex's own Seatbelt (nested sandbox dies in the
  // Claude sandbox); it must run in the server's inherited context.
  assert.deepEqual(probe.params.sandboxPolicy, { type: "dangerFullAccess" });
});

test("containment: HOME writable => refuse before any thread exists", async () => {
  const recorded = [];
  const server = await startMockServer(appServerBehaviour(recorded, { probeStdout: "WRITABLE WRITABLE" }));
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "hi" });
  server.close();
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /NOT confined/);
  assert.equal(findRequest(recorded, "thread/start"), undefined);
  assert.equal(findRequest(recorded, "turn/start"), undefined);
});

test("containment: cwd not writable => refuse (wrong session's server)", async () => {
  const recorded = [];
  const server = await startMockServer(appServerBehaviour(recorded, { probeStdout: "BLOCKED BLOCKED" }));
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "hi" });
  server.close();
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /cannot write/);
  assert.equal(findRequest(recorded, "thread/start"), undefined);
});

test("resume: thread/resume also carries pinned sandbox values", async () => {
  const recorded = [];
  const server = await startMockServer(appServerBehaviour(recorded));
  const r = await runDriver(["--cwd", "/tmp", "--thread", "thread-1"], { port: server.port, stdin: "again" });
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
  const target = { type: "baseBranch", branch: "main" };
  const r = await runDriver(["--cwd", "/tmp", "--review-target", JSON.stringify(target)], {
    port: server.port,
  });
  server.close();
  assert.equal(r.code, 0, r.stderr);

  assert.equal(findRequest(recorded, "thread/start").params.sandbox, "danger-full-access");
  const review = findRequest(recorded, "review/start");
  assert.deepEqual(review.params.target, target);
  assert.equal(review.params.threadId, "thread-1");
  assert.equal(findRequest(recorded, "turn/start"), undefined);
});

test("unknown flags are rejected before connecting (no sandbox injection path)", async () => {
  let connected = false;
  const server = await startMockServer(() => {
    connected = true;
  });
  for (const args of [
    ["--sandbox", "read-only"],
    ["--sandbox-policy", '{"type":"readOnly"}'],
    ["--approval-policy", "untrusted"],
  ]) {
    const r = await runDriver(args, { port: server.port, stdin: "x" });
    assert.equal(r.code, 2, `expected rejection for ${args[0]}`);
    assert.match(r.stderr, /unknown flag/);
  }
  server.close();
  assert.equal(connected, false);
});

test("review tuning flags that cannot be applied are rejected", async () => {
  let connected = false;
  const server = await startMockServer(() => {
    connected = true;
  });
  const target = JSON.stringify({ type: "uncommittedChanges" });
  for (const extra of [
    ["--model", "gpt-5"],
    ["--effort", "high"],
    ["--schema", "/dev/null"],
    ["--prompt", "hi"],
  ]) {
    const r = await runDriver(["--review-target", target, ...extra], { port: server.port });
    assert.equal(r.code, 2, `expected rejection for --review-target with ${extra[0]}`);
  }
  server.close();
  assert.equal(connected, false);
});

test("events from unrelated threads and turns are ignored", async () => {
  const recorded = [];
  const server = await startMockServer(
    appServerBehaviour(recorded, {
      onTurnStart: (send) => {
        // Noise from another thread and another turn on the same thread.
        send({
          jsonrpc: "2.0",
          method: "item/completed",
          params: { threadId: "other-thread", item: { type: "agentMessage", text: "WRONG", phase: "final_answer" } },
        });
        send({
          jsonrpc: "2.0",
          method: "turn/completed",
          params: { threadId: "other-thread", turn: { id: "other-turn", status: "completed", items: [] } },
        });
        send({
          jsonrpc: "2.0",
          method: "turn/completed",
          params: { threadId: "thread-1", turn: { id: "child-turn", status: "completed", items: [] } },
        });
        // The real completion.
        send({
          jsonrpc: "2.0",
          method: "item/completed",
          params: { threadId: "thread-1", item: { type: "agentMessage", text: "RIGHT", phase: "final_answer" } },
        });
        send({
          jsonrpc: "2.0",
          method: "turn/completed",
          params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed", error: null, items: [] } },
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
          params: { threadId: "other-thread", turn: { id: "other-turn", status: "completed", items: [] } },
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
  // The real turn must still have been started and completed.
  assert.ok(findRequest(recorded, "turn/start"));
});

test("--review-target - reads the target JSON from stdin unexpanded", async () => {
  const recorded = [];
  const server = await startMockServer(appServerBehaviour(recorded));
  const target = { type: "custom", instructions: "check `$(rm -rf)` handling, don't expand" };
  const r = await runDriver(["--cwd", "/tmp", "--review-target", "-"], {
    port: server.port,
    stdin: JSON.stringify(target),
  });
  server.close();
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(findRequest(recorded, "review/start").params.target, target);
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
            params: { threadId: "thread-1", item: { type: "agentMessage", text } },
          });
        }
        send({
          jsonrpc: "2.0",
          method: "turn/completed",
          params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed", error: null, items: [] } },
        });
      },
    }),
  );
  const r = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "x" });
  server.close();
  assert.equal(r.code, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).finalMessage, "actual answer");
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
    child = spawn(process.execPath, [DRIVER, "--cwd", "/tmp"], {
      env: { ...process.env, CODEX_BRIDGE_PORT: String(server.port) },
    });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stderr }));
    child.stdin.write("long task");
    child.stdin.end();
  });
  const r = await result;
  server.close();
  assert.equal(r.code, 130, r.stderr);
  const interrupt = findRequest(recorded, "turn/interrupt");
  assert.deepEqual(interrupt.params, { threadId: "thread-1", turnId: "turn-1" });
});

test("--token-file attaches Authorization: Bearer to the handshake", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "codex-turn-test-"));
  const tokenPath = join(dir, "token");
  writeFileSync(tokenPath, "sekrit-token-123\n", { mode: 0o600 });

  const recorded = [];
  const server = await startMockServer(appServerBehaviour(recorded));
  const withToken = await runDriver(["--cwd", "/tmp", "--token-file", tokenPath], {
    port: server.port,
    stdin: "x",
  });
  const withoutToken = await runDriver(["--cwd", "/tmp"], { port: server.port, stdin: "x" });
  server.close();
  assert.equal(withToken.code, 0, withToken.stderr);
  assert.equal(withoutToken.code, 0, withoutToken.stderr);
  assert.deepEqual(server.authHeaders, ["Bearer sekrit-token-123", null]);
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
        params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed", error: null, items: [] } },
      });
      return;
    }
    if (msg.id === undefined) return;
    if (msg.method === "initialize") {
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
    } else if (msg.method === "command/exec") {
      send({ jsonrpc: "2.0", id: msg.id, result: { exitCode: 0, stdout: "BLOCKED WRITABLE\n", stderr: "" } });
    } else if (msg.method === "thread/start") {
      send({ jsonrpc: "2.0", id: msg.id, result: { thread: { id: "thread-1" } } });
    } else if (msg.method === "turn/start") {
      send({ jsonrpc: "2.0", id: msg.id, result: { turn: { id: "turn-1" } } });
      send({ jsonrpc: "2.0", id: 901, method: "item/commandExecution/requestApproval", params: {} });
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
