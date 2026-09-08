#!/usr/bin/env node
// codex-cc-bridge launch helpers: the mechanical half of the skill's launch recipe.
//
// The recipe has exactly one step that only Claude Code can do — starting the
// app-server as a `run_in_background` Bash task, so the harness owns its
// lifetime and TaskStop can reclaim it. Everything around that step is
// deterministic, so it lives here instead of as shell one-liners in SKILL.md:
// prose cannot be tested, and a mistyped regex or mktemp mode fails silently.
//
//   codex-bridge.mts init         -> create the 0600 capability-token file, print its path
//   codex-bridge.mts ready FILE   -> wait until the app-server in the background task whose
//                                    output is FILE is listening and /readyz answers,
//                                    then print the port it was assigned
//
// Between the two, start the server (see `init`'s printed hint).

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";

const READY_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 250;
// The app-server prints its endpoint once it is bound. Port 0 means the OS picks a
// free port, so this banner is the only place the actual number appears.
const LISTENING_RE = /listening on: ws:\/\/127\.0\.0\.1:(\d+)/;

function usage(message?: string): never {
  if (message) console.error(`codex-bridge: ${message}`);
  console.error(
    "usage: codex-bridge.mts init\n" +
      "       codex-bridge.mts ready <background-task-output-file>",
  );
  process.exit(2);
}

/** Capability token for `codex app-server --ws-auth capability-token`. */
function init(): void {
  // 0700 dir + 0600 file: the token is the only thing standing between a local
  // process and a resident server that can run commands.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-bridge-"));
  const tokenFile = path.join(dir, "token");
  fs.writeFileSync(tokenFile, randomBytes(32).toString("hex"), { mode: 0o600 });
  console.log(tokenFile);
  console.error(
    "next: start the app-server as a run_in_background Bash task (never with `&`, or\n" +
      "TaskStop cannot reclaim it), then run `codex-bridge.mts ready <its output file>`:\n" +
      `  codex app-server --listen "ws://127.0.0.1:0" --ws-auth capability-token --ws-token-file ${tokenFile}`,
  );
}

async function readyz(port: string): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/readyz`);
    return r.ok;
  } catch {
    return false;
  }
}

/** Wait for the server to bind and answer, then print the port it got. */
async function ready(outputFile: string): Promise<void> {
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
        console.error(
          `codex-bridge: the app-server exited before it started listening. Its output:\n${text.trim()}`,
        );
        process.exit(1);
      }
    }
    if (port !== undefined && await readyz(port)) {
      console.log(port);
      return;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  console.error(
    port === undefined
      ? `codex-bridge: no "listening on:" line in ${outputFile} after ${
        READY_TIMEOUT_MS / 1000
      }s (is it the app-server task's output file?)`
      : `codex-bridge: port ${port} never answered /readyz within ${READY_TIMEOUT_MS / 1000}s`,
  );
  process.exit(1);
}

const { positionals } = (() => {
  try {
    return parseArgs({ args: process.argv.slice(2), strict: true, allowPositionals: true });
  } catch (e) {
    usage((e as Error).message);
  }
})();

const [command, arg] = positionals;
if (command === "init") {
  if (arg !== undefined) usage("init takes no arguments");
  init();
} else if (command === "ready") {
  if (arg === undefined) usage("ready needs the background task's output file");
  await ready(arg);
} else {
  usage(command === undefined ? "no command" : `unknown command: ${command}`);
}
