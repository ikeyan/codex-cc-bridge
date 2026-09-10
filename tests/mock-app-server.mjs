// Mock codex app-server and driver harness shared by the driver tests (example-based in
// codex-turn.test.mjs, property-based in codex-turn.property.test.mjs).
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const DRIVER = fileURLToPath(new URL("../scripts/codex-turn.mts", import.meta.url));
export const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// The harness always runs on node; CODEX_TURN_DRIVER_RUNTIME selects which
// runtime executes the driver under test (node | deno | bun).
export const DRIVER_CMD = (() => {
  const rt = process.env.CODEX_TURN_DRIVER_RUNTIME ?? "node";
  if (rt === "deno") {
    return ["deno", "run", "--quiet", "--allow-env", "--allow-read", "--allow-net", DRIVER];
  }
  if (rt === "bun") return ["bun", DRIVER];
  return [process.execPath, DRIVER];
})();
export const spawnDriver = (args, env) =>
  spawn(DRIVER_CMD[0], [...DRIVER_CMD.slice(1), ...args], { env: { ...process.env, ...env } });

// A session dir is what `codex-bridge.mts init` + `ready` leave behind: token + port.
// Fresh dir per mock server so tests never share a port file.
export function makeSession(port, { token = "sekrit-token-123\n", portText } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "codex-turn-test-"));
  writeFileSync(join(dir, "token"), token, { mode: 0o600 });
  if (port !== undefined || portText !== undefined) {
    writeFileSync(join(dir, "port"), portText ?? `${port}\n`);
  }
  return dir;
}

// Minimal RFC6455 text-frame server good enough for JSON-RPC lines in tests.
export function startMockServer(onMessage) {
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
export function appServerBehaviour(
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

export function runDriver(args, { port, stdin, env, session } = {}) {
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

export const findRequest = (recorded, method) => recorded.find((m) => m.method === method);
