---
description: Delegate a task or question to Codex (one turn on the resident app-server)
argument-hint: '[--thread <id>] [--model <m>] [--schema <file>] <task description>'
allowed-tools: Read, Write, Glob, Grep, Bash(node:*), Bash(codex:*), Bash(git:*)
---

Delegate one turn to Codex via the codex-bridge skill. Load the `codex-bridge` skill
(`${CLAUDE_PLUGIN_ROOT}/skills/codex-bridge/SKILL.md` — or via the Skill tool) if not already loaded;
its launch recipe and security invariants apply verbatim.

Raw slash-command arguments:
`$ARGUMENTS`

Steps:

1. **Server**: follow the skill's launch recipe — `codex-bridge.mts init` for the token file,
   then start the app-server as a `run_in_background` Bash task (never with `&`), then
   `codex-bridge.mts ready <that task's output file>` for the port. Every driver call needs
   `--port <PORT> --token-file <TOKEN_FILE>`; there is no default port.
2. **Compose the prompt from references, not contents**: state the intent and constraints,
   and point at the target with repo-relative paths, globs, branch names, shas, or commands
   to run. Codex reads files and runs commands itself, so do NOT paste file contents,
   diffs, or excerpts. Inline text only for what Codex cannot reach (your own reasoning,
   another session's output, something you read on the web).
   Do not present a "what will be sent to OpenAI" scope: it is a lower bound, not a bound
   (see invariant 4 in the skill).
   If the arguments contain `--thread <id>`, pass it through to continue that thread.
3. **Run the turn** as a background task (unless it is trivially small). Write the prompt
   to a temp file with the Write tool, then feed it via stdin redirection — never
   `echo "<prompt>"` or a heredoc: echo shell-expands `$(...)`, backticks and quotes, and a
   heredoc breaks if the text contains its delimiter line:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-turn.mts" --cwd "$PWD" --port <PORT> --token-file <TOKEN_FILE> [--thread <id>] [--model <m>] [--schema <file>] < /path/to/prompt.txt
   ```

   (`<TOKEN_FILE>` is the capability-token file from the skill's launch recipe.)

4. **Report**: when the task completes, relay `finalMessage` to the user, and mention the
   `threadId` so the conversation can be continued with `--thread`.

Never pass any sandbox-related flag to the driver (it has none; unknown flags fail).
Never run the driver or the app-server with `dangerouslyDisableSandbox`.
