---
description: Run a Codex code review (native review/start) against local git state
argument-hint: '[--base <branch>] [--commit <sha>] [--instructions <text>] [--model <m>] (default: uncommitted changes)'
allowed-tools: Read, Write, Glob, Grep, Bash(node:*), Bash(codex:*), Bash(git:*)
---

Run a Codex review through the resident app-server's native `review/start`. Load the
`codex-bridge` skill if not already loaded; its launch recipe and security invariants apply verbatim.

Raw slash-command arguments:
`$ARGUMENTS`

This command is review-only: run the review and return Codex's findings verbatim.
Do not fix anything.

Steps:

1. **Server**: if this session has no running app-server yet, follow the skill's launch recipe
   (起動レシピ) exactly as written there; do not improvise the steps here.
2. **Pick the review mode** from the arguments:
   - `--base <branch>` → `--review base --target-file FILE`, FILE holding the branch name
   - `--commit <sha>` → `--review commit --target-file FILE`, FILE holding the sha
   - `--instructions <text>` → `--review custom < FILE`, FILE holding the text
   - none of the above → `--review uncommitted` (no file, no stdin)
   `--model <m>` may also be passed through: it is a thread-level setting, so it applies to
   the review. `--effort` is turn-level and cannot be used with a review.
3. **Do not present an egress scope.** Codex reads files and runs commands on its own, so
   the review target bounds what it is asked to look at, not what can reach OpenAI — that
   upper bound is the Claude sandbox's read scope (invariant 4 in the skill). Showing
   `git diff --stat` as "what will be sent" would imply that everything else stays local,
   which is false. If the working tree holds secrets, the answer is to fix the sandbox read
   configuration or not to run Codex here, not to narrow the target.
4. **Run the review as a background task** (reviews regularly take >10 minutes). Write the
   branch name / sha / instructions to a temp file with the Write tool — never put the value
   on the command line: a branch name may contain `$(...)` or a quote, and no quoting
   discipline survives that. The driver has no flag that takes the value directly.

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-turn.mts" --session <DIR> --review base --target-file /path/to/branch.txt
   node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-turn.mts" --session <DIR> --review custom < /path/to/instructions.txt
   node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-turn.mts" --session <DIR> --review uncommitted
   ```

   (`<DIR>` is the session dir printed by `codex-bridge.mts init` in the skill's launch recipe.)

5. **Report**: relay `finalMessage` (the review findings) to the user unchanged, plus the
   `threadId` for follow-up questions via `/codex-task --thread <id>`.

Never pass any sandbox-related flag to the driver (it has none; unknown flags fail).
Never run the driver or the app-server with `dangerouslyDisableSandbox`.
