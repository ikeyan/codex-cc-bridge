---
description: Run a Codex code review (native review/start) against local git state
argument-hint: '[--base <branch>] [--commit <sha>] [--instructions <text>] (default: uncommitted changes)'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(curl:*), Bash(codex:*), Bash(git:*)
---

Run a Codex review through the resident app-server's native `review/start`. Load the
`codex-bridge` skill if not already loaded; its launch recipe and security invariants apply verbatim.

Raw slash-command arguments:
`$ARGUMENTS`

This command is review-only: run the review and return Codex's findings verbatim.
Do not fix anything.

Steps:

1. **Server**: follow the skill's launch recipe (readyz check on the configured port, else
   start the app-server as a background task, re-check readyz).
2. **Pick the review target** from the arguments:
   - `--base <branch>` → `{"type":"baseBranch","branch":"<branch>"}`
   - `--commit <sha>` → `{"type":"commit","sha":"<sha>"}`
   - `--instructions <text>` → `{"type":"custom","instructions":"<text>"}`
   - none of the above → `{"type":"uncommittedChanges"}`
3. **Egress disclosure**: before starting, show the user the scope of what will be sent
   to OpenAI (e.g. `git status --short` / `git diff --stat` for the chosen target). If the
   working tree contains obviously sensitive unstaged files, point that out and narrow the
   target instead of sending them.
4. **Run the review as a background task** (reviews regularly take >10 minutes). Feed the
   target JSON via stdin (`--review-target -`) with a QUOTED heredoc so branch names,
   shas, or instructions never get shell-expanded:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-turn.mjs" --cwd "$PWD" --token-file <TOKEN_FILE> --review-target - <<'CODEX_TARGET'
   <target-json>
   CODEX_TARGET
   ```

   (`<TOKEN_FILE>` is the capability-token file from the skill's launch recipe.)

5. **Report**: relay `finalMessage` (the review findings) to the user unchanged, plus the
   `threadId` for follow-up questions via `/codex-task --thread <id>`.

Never pass any sandbox-related flag to the driver (it has none; unknown flags fail).
Never run the driver or the app-server with `dangerouslyDisableSandbox`.
