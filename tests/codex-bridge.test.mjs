// Pins the launch helper scripts/codex-bridge.mts:
//   - init creates a private session dir (0700) with a 0600 random token and prints the dir;
//     the launch hint it prints is shell-quoted
//   - ready parses the app-server banner, waits for /readyz with a bounded fetch, validates
//     the port, and publishes it as <dir>/port only after readiness; a dir is bound once
//   - failures (server exited, no banner, readyz never answers) exit non-zero with a reason
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HELPER = fileURLToPath(new URL("../scripts/codex-bridge.mts", import.meta.url));

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HELPER, ...args], {
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end();
  });
}

const scratch = () => mkdtempSync(join(tmpdir(), "codex-bridge-test-"));

/** An HTTP server whose /readyz answers 200 (or hangs forever when `hang`). */
function readyzServer({ hang = false } = {}) {
  const server = http.createServer((req, res) => {
    if (hang) return;
    if (req.url === "/readyz") res.writeHead(200).end("ok");
    else res.writeHead(404).end();
  });
  return new Promise((resolve) =>
    server.listen(
      0,
      "127.0.0.1",
      () => resolve({ port: server.address().port, close: () => server.close() }),
    )
  );
}

test("init: private dir, 0600 hex token, dir on stdout, quoted launch hint on stderr", async () => {
  const tmp = scratch();
  const r = await run(["init"], { TMPDIR: tmp });
  assert.equal(r.code, 0, r.stderr);
  const dir = r.stdout.trim();
  assert.ok(dir.startsWith(tmp), dir);
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  const tokenFile = join(dir, "token");
  assert.equal(statSync(tokenFile).mode & 0o777, 0o600);
  assert.match(readFileSync(tokenFile, "utf8"), /^[0-9a-f]{64}$/);
  assert.equal(existsSync(join(dir, "port")), false, "port is published by ready, not init");
  assert.ok(
    r.stderr.includes(`--ws-token-file '${tokenFile}'`),
    `launch hint must single-quote the token path:\n${r.stderr}`,
  );
  assert.ok(r.stderr.includes(`ready '${dir}'`), r.stderr);
});

test("init: the launch hint stays a valid shell word when the path has a quote", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "codex-bridge-it's-"));
  const r = await run(["init"], { TMPDIR: tmp });
  assert.equal(r.code, 0, r.stderr);
  const dir = r.stdout.trim();
  // 'it'\''s' is how a single quote is spelled inside single quotes.
  assert.ok(r.stderr.includes(`--ws-token-file '${dir.replace(/'/g, `'\\''`)}/token'`), r.stderr);
});

test("ready: publishes the banner port after /readyz answers, and prints it", async () => {
  const srv = await readyzServer();
  const dir = (await run(["init"], { TMPDIR: scratch() })).stdout.trim();
  const out = join(scratch(), "task.output");
  writeFileSync(out, `some startup noise\nlistening on: ws://127.0.0.1:${srv.port}\n`);
  const r = await run(["ready", dir, out]);
  srv.close();
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout.trim(), String(srv.port));
  assert.equal(readFileSync(join(dir, "port"), "utf8").trim(), String(srv.port));
});

test("ready: a dir can be bound only once (fresh init per server launch)", async () => {
  const srv = await readyzServer();
  const dir = (await run(["init"], { TMPDIR: scratch() })).stdout.trim();
  const out = join(scratch(), "task.output");
  writeFileSync(out, `listening on: ws://127.0.0.1:${srv.port}\n`);
  assert.equal((await run(["ready", dir, out])).code, 0);
  const again = await run(["ready", dir, out]);
  srv.close();
  assert.equal(again.code, 1);
  assert.match(again.stderr, /already bound/);
});

test("ready: tolerates the output file appearing late", async () => {
  const srv = await readyzServer();
  const dir = (await run(["init"], { TMPDIR: scratch() })).stdout.trim();
  const out = join(scratch(), "task.output");
  setTimeout(() => writeFileSync(out, `listening on: ws://127.0.0.1:${srv.port}\n`), 600);
  const r = await run(["ready", dir, out]);
  srv.close();
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout.trim(), String(srv.port));
});

test("ready: server exited before listening => exit 1 with its output", async () => {
  const dir = (await run(["init"], { TMPDIR: scratch() })).stdout.trim();
  const out = join(scratch(), "task.output");
  writeFileSync(out, "error: could not open sqlite state\n\n[exited with code 1]\n");
  const r = await run(["ready", dir, out]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /exited before it started listening/);
  assert.match(r.stderr, /sqlite/);
  assert.equal(existsSync(join(dir, "port")), false);
});

test("ready: no banner within the deadline => exit 1, no port published", async () => {
  const dir = (await run(["init"], { TMPDIR: scratch() })).stdout.trim();
  const out = join(scratch(), "task.output");
  writeFileSync(out, "still starting\n");
  const r = await run(["ready", dir, out], { CODEX_BRIDGE_READY_TIMEOUT_MS: "800" });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no "listening on:" line/);
  assert.equal(existsSync(join(dir, "port")), false);
});

test("ready: /readyz that never answers is bounded (no hanging fetch)", async () => {
  const srv = await readyzServer({ hang: true });
  const dir = (await run(["init"], { TMPDIR: scratch() })).stdout.trim();
  const out = join(scratch(), "task.output");
  writeFileSync(out, `listening on: ws://127.0.0.1:${srv.port}\n`);
  const started = Date.now();
  const r = await run(["ready", dir, out], { CODEX_BRIDGE_READY_TIMEOUT_MS: "1500" });
  srv.close();
  assert.equal(r.code, 1);
  assert.match(r.stderr, /never answered/);
  assert.ok(Date.now() - started < 6000, "must give up close to the deadline");
  assert.equal(existsSync(join(dir, "port")), false);
});

test("ready: port that nothing listens on => never answered, not a crash", async () => {
  // Grab a free port and release it so the fetch is refused.
  const probe = net.createServer();
  const port = await new Promise((res) =>
    probe.listen(0, "127.0.0.1", () => {
      const p = probe.address().port;
      probe.close(() => res(p));
    })
  );
  const dir = (await run(["init"], { TMPDIR: scratch() })).stdout.trim();
  const out = join(scratch(), "task.output");
  writeFileSync(out, `listening on: ws://127.0.0.1:${port}\n`);
  const r = await run(["ready", dir, out], { CODEX_BRIDGE_READY_TIMEOUT_MS: "800" });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /never answered/);
});

test("usage errors exit 2", async () => {
  assert.equal((await run([])).code, 2);
  assert.equal((await run(["bogus"])).code, 2);
  assert.equal((await run(["init", "extra"])).code, 2);
  assert.equal((await run(["ready", "/only-one-arg"])).code, 2);
  const notADir = await run(["ready", join(scratch(), "missing"), join(scratch(), "out")]);
  assert.equal(notADir.code, 2);
  assert.match(notADir.stderr, /not a session dir/);
});
