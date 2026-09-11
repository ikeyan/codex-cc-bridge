// Property-based check of the driver's event demultiplexing and abort logic: random event
// sequences generated from the grammar in wiki/architecture/turn-event-demultiplexing.md
// (own turn: `S (C|I|E)* D`; review: `S C (C|I|E)* D`, where the first C may precede S on the
// wire), mixed
// with noise from other threads/turns, with one trigger (SIGTERM or 401) at a random
// position. The invariants below are what the example-based tests pin one cell at a time.
//
// Runs the driver under node only: the logic is runtime-independent and the matrix in
// codex-turn.test.mjs already covers portability. Each run spawns a driver process, so the
// run count is kept modest; on failure fast-check prints the seed and the shrunk scenario.
import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  appServerBehaviour,
  makeSession,
  spawnDriver,
  startMockServer,
} from "./mock-app-server.mjs";

const NODE_ONLY = (process.env.CODEX_TURN_DRIVER_RUNTIME ?? "node") === "node";
const GAP_MS = 20; // between events the mock sends; well inside every wait bound

const OWN_THREAD = "thread-1";
const OWN_TURN = "turn-1";
const CHILD_TURN = "child-turn";

/** One event of the stream the mock plays after the start response. */
const eventArb = fc.constantFrom(
  "I", // item/completed for our turn (an agent message)
  "E", // a non-401 error for our turn
  "C", // another subagent turn announced on our thread (turn/started with a fresh id)
  "noise:unknown-turn-401", // a 401 naming a turn we never learn of: must be held, never ours
  "noise:other-thread-item",
  "noise:other-thread-completed",
  "noise:own-thread-other-turn-item",
  "noise:other-thread-started",
);

const scenarioArb = fc.record({
  review: fc.boolean(),
  // Only meaningful for a review: the child's turn/started shares the TCP chunk with the
  // review/start response, i.e. arrives before it.
  childBeforeStart: fc.boolean(),
  body: fc.array(eventArb, { maxLength: 6 }),
  trigger: fc.record({
    kind: fc.constantFrom("none", "sigterm", "401"),
    pos: fc.nat({ max: 8 }),
  }),
});

const childId = (i) => `child-${i}`;
function eventMessage(kind, i) {
  switch (kind) {
    case "C":
      return {
        method: "turn/started",
        params: { threadId: OWN_THREAD, turn: { id: childId(i), status: "inProgress", items: [] } },
      };
    case "I":
      return {
        method: "item/completed",
        params: {
          threadId: OWN_THREAD,
          turnId: OWN_TURN,
          item: { type: "agentMessage", text: `msg-${i}`, phase: "commentary" },
        },
      };
    case "E":
      return {
        method: "error",
        params: {
          threadId: OWN_THREAD,
          turnId: OWN_TURN,
          error: {
            message: "transient",
            codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 500 } },
          },
        },
      };
    case "noise:other-thread-item":
      return {
        method: "item/completed",
        params: {
          threadId: "other-thread",
          turnId: "other-turn",
          item: { type: "agentMessage", text: "WRONG", phase: "final_answer" },
        },
      };
    case "noise:other-thread-completed":
      return {
        method: "turn/completed",
        params: {
          threadId: "other-thread",
          turn: { id: "other-turn", status: "completed", items: [] },
        },
      };
    case "noise:own-thread-other-turn-item":
      return {
        method: "item/completed",
        params: {
          threadId: OWN_THREAD,
          turnId: "other-turn",
          item: { type: "agentMessage", text: "WRONG2", phase: "final_answer" },
        },
      };
    case "noise:unknown-turn-401":
      return {
        method: "error",
        params: {
          threadId: OWN_THREAD,
          turnId: `stranger-${i}`,
          willRetry: true,
          error: { message: "Unauthorized", codexErrorInfo: "unauthorized" },
        },
      };
    case "noise:other-thread-started":
      return {
        method: "turn/started",
        params: {
          threadId: "other-thread",
          turn: { id: "other-child", status: "inProgress", items: [] },
        },
      };
  }
  throw new Error(`unknown event ${kind}`);
}
const childStarted = {
  method: "turn/started",
  params: { threadId: OWN_THREAD, turn: { id: CHILD_TURN, status: "inProgress", items: [] } },
};
const completed = {
  method: "turn/completed",
  params: {
    threadId: OWN_THREAD,
    turn: { id: OWN_TURN, status: "completed", error: null, items: [] },
  },
};
const unauthorized = {
  method: "error",
  params: {
    threadId: OWN_THREAD,
    turnId: OWN_TURN,
    error: {
      message: "auth",
      codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 401 } },
    },
  },
};

/** Play one scenario against the driver; return everything the invariants look at. */
async function play(scenario) {
  const { review, childBeforeStart, body, trigger } = scenario;
  // The stream after the start response: [C] body [D]; the trigger is spliced in at `pos`.
  const stream = [];
  if (review && !childBeforeStart) stream.push(childStarted);
  stream.push(...body.map((k, i) => eventMessage(k, i)));
  if (trigger.kind === "none") stream.push(completed);
  const at = Math.min(trigger.pos, stream.length);

  const recorded = [];
  let child;
  const server = await startMockServer(
    appServerBehaviour(recorded, {
      beforeTurnStartResponse: (send) => {
        if (review && childBeforeStart) send({ jsonrpc: "2.0", ...childStarted });
      },
      onTurnStart: (send) => {
        let i = 0;
        const step = () => {
          if (i === at) {
            if (trigger.kind === "sigterm") child.kill("SIGTERM");
            if (trigger.kind === "401") send({ jsonrpc: "2.0", ...unauthorized });
          }
          if (i < stream.length) {
            send({ jsonrpc: "2.0", ...stream[i] });
            i++;
            setTimeout(step, GAP_MS);
          }
        };
        setTimeout(step, GAP_MS);
      },
    }),
  );
  const args = ["--session", makeSession(server.port), "--cwd", "/tmp"];
  if (review) args.push("--review", "uncommitted");
  const result = new Promise((resolve) => {
    child = spawnDriver(args, {});
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (!review) child.stdin.write("prompt");
    child.stdin.end();
  });
  const t0 = Date.now();
  const r = await result;
  const elapsed = Date.now() - t0;
  server.close();
  const interrupts = recorded.filter((m) => m.method === "turn/interrupt").map((m) => m.params);
  // Children the driver demonstrably saw before it decided to abort: its own progress lines.
  const abortLine = r.stderr.search(/codex-turn: (SIGTERM: turn interrupted|codex got 401)/);
  const seenBeforeAbort = [
    ...r.stderr.slice(0, abortLine < 0 ? undefined : abortLine).matchAll(
      /"event":"child","turnId":"([^"]+)"/g,
    ),
  ].map((m) => m[1]);
  return { ...r, elapsed, interrupts, stream, seenBeforeAbort };
}

const count = (text, re) => (text.match(re) ?? []).length;

test(
  "driver lifecycle invariants hold on grammar-generated event streams",
  { skip: !NODE_ONLY },
  async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const { review, trigger } = scenario;
        const r = await play(scenario);
        const { stream } = r;
        const ctx = JSON.stringify({ scenario, code: r.code, stderr: r.stderr, stdout: r.stdout });
        // A 401 naming an unknown turn must never end the run (it is held, never ours).
        if (trigger.kind === "none") assert.doesNotMatch(r.stderr, /401 Unauthorized/, ctx);

        // (a) Exactly one ending, reported once.
        const endings = [
          r.stdout.trim().length > 0,
          count(r.stderr, /codex-turn: SIGTERM: turn interrupted/) > 0,
          count(r.stderr, /401 Unauthorized/) > 0,
        ].filter(Boolean).length;
        assert.equal(endings, 1, `exactly one ending\n${ctx}`);
        assert.ok(count(r.stderr, /codex-turn: SIGTERM: turn interrupted/) <= 1, ctx);
        assert.ok(count(r.stderr, /401 Unauthorized/) <= 1, ctx);

        // (b) Exit code and interrupt targets follow the trigger; the review child, which the
        // grammar says always announces itself, is interrupted first.
        // Children on our thread, in wire order (the review child is not in `stream` when it
        // rode ahead of the start response, so add it explicitly).
        const reviewChild = review ? [CHILD_TURN] : [];
        const streamChildren = stream
          .filter((m) => m.method === "turn/started" && m.params.threadId === OWN_THREAD)
          .map((m) => m.params.turn.id);
        const allChildren = [...new Set([...reviewChild, ...streamChildren])];
        // Required interrupt targets: the review child (waited for by grammar) and every
        // child the driver reported seeing before it announced the abort. Children it
        // learned of later may or may not make it into the interrupt: allowed, not required.
        const required = new Set([...reviewChild, ...r.seenBeforeAbort]);
        const allowed = new Set(allChildren);
        if (trigger.kind === "none") {
          assert.equal(r.code, 0, ctx);
          assert.deepEqual(r.interrupts, [], ctx);
          const out = JSON.parse(r.stdout);
          assert.equal(out.threadId, OWN_THREAD, ctx);
          assert.equal(out.turnId, OWN_TURN, ctx);
          assert.equal(out.reviewTurnId, allChildren[0] ?? null, ctx);
          assert.deepEqual(out.childTurnIds, allChildren, ctx);
          assert.equal(out.turnStatus, "completed", ctx);
          assert.doesNotMatch(String(out.finalMessage), /WRONG/, ctx);
        } else {
          assert.equal(r.code, trigger.kind === "sigterm" ? 130 : 1, ctx);
          const targets = r.interrupts.map((p) => p.turnId);
          assert.equal(targets.at(-1), OWN_TURN, `own turn is interrupted last\n${ctx}`);
          assert.equal(new Set(targets).size, targets.length, `no duplicate interrupts\n${ctx}`);
          for (const id of required) assert.ok(targets.includes(id), `missing ${id}\n${ctx}`);
          for (const id of targets.slice(0, -1)) {
            assert.ok(allowed.has(id), `unexpected ${id}\n${ctx}`);
          }
          for (const p of r.interrupts) assert.equal(p.threadId, OWN_THREAD, ctx);
          assert.doesNotMatch(r.stderr, /not acknowledged/, ctx);
          assert.equal(r.stdout, "", `no result JSON on an abort\n${ctx}`);
        }

        // (c) Never waits on a guess: every wait ended on an event the mock actually sent.
        assert.ok(r.elapsed < 2500, `took ${r.elapsed}ms\n${ctx}`);
      }),
      { numRuns: Number(process.env.CODEX_BRIDGE_PROPERTY_RUNS ?? 60), verbose: 1 },
    );
  },
);
