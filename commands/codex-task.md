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

1. **Server**: if this session has no running app-server yet, follow the skill's launch recipe
   (起動レシピ) exactly as written there; do not improvise the steps here.
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
   node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-turn.mts" --session <DIR> [--thread <id>] [--model <m>] [--schema <file>] < /path/to/prompt.txt
   ```

   (`<DIR>` is the session dir printed by `codex-bridge.mts init` in the skill's launch recipe.)

4. **Report**: when the task completes, relay `finalMessage` to the user, and mention the
   `threadId` so the conversation can be continued with `--thread`.

Never pass any sandbox-related flag to the driver (it has none; unknown flags fail).
Never run the driver or the app-server with `dangerouslyDisableSandbox`.
