---
description: Delegate a task or question to Codex (one turn on the resident app-server)
argument-hint: '[--thread <id>] [--model <m>] [--schema <file>] <task description>'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(curl:*), Bash(codex:*), Bash(echo:*), Bash(git:*)
---

Delegate one turn to Codex via the codex-bridge skill. Load the `codex-bridge` skill
(`${CLAUDE_PLUGIN_ROOT}/skills/codex-bridge/SKILL.md` — or via the Skill tool) if not already loaded;
its launch recipe and security invariants apply verbatim.

Raw slash-command arguments:
`$ARGUMENTS`

Steps:

1. **Server**: follow the skill's launch recipe (readyz check on the configured port, else
   start the app-server as a background task, re-check readyz).
2. **Material bundle**: compose the prompt from the user's task description plus any
   materials you curate (file excerpts, diffs, spec fragments). Before sending, tell the
   user in one short line what is being sent to OpenAI (scope, not full content).
   If the arguments contain `--thread <id>`, pass it through to continue that thread.
3. **Run the turn** as a background task (unless it is trivially small). Feed the prompt
   via a QUOTED heredoc — never `echo "<prompt>"`, which shell-expands `$(...)`, backticks
   and quotes inside the material bundle:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-turn.mjs" --cwd "$PWD" --token-file <TOKEN_FILE> [--thread <id>] [--model <m>] [--schema <file>] <<'CODEX_PROMPT'
   <prompt including materials, pasted verbatim>
   CODEX_PROMPT
   ```

   (`<TOKEN_FILE>` is the capability-token file from the skill's launch recipe.)

4. **Report**: when the task completes, relay `finalMessage` to the user, and mention the
   `threadId` so the conversation can be continued with `--thread`.

Never pass any sandbox-related flag to the driver (it has none; unknown flags fail).
Never run the driver or the app-server with `dangerouslyDisableSandbox`.
