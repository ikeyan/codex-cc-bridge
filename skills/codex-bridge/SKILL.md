---
name: codex-bridge
description: Run OpenAI Codex turns from Claude Code through a resident app-server contained inside the Claude sandbox. Covers the launch recipe, the one-turn driver, material bundles, and the security invariants.
---

# codex-bridge

Codex を Claude Code から使うための薄い橋。1 セッション 1 常駐 `codex app-server` を
**Claude sandbox 内**で立て、1 ターン = 1 background task として
`${CLAUDE_PLUGIN_ROOT}/scripts/codex-turn.mts` で駆動する。

## セキュリティ不変条件 (絶対に守る)

1. app-server は **Claude sandbox 内** (通常の Bash / run_in_background) で、**capability token
   認証つき**で起動する (起動レシピ参照)。token を知らないローカルプロセスは接続できない。
   driver はさらに turn 前に封じ込めプローブ (`command/exec` で $HOME 書込不可 & 対象 cwd 書込可) を
   自動実行し、sandbox 外の server や別セッションの server には fail-closed で接続を拒否する。
2. thread/turn の sandbox は driver が `danger-full-access` に固定している (変更不可)。
   これで Codex のコマンド実行は Claude sandbox の部分集合に閉じる
   (read-only/workspace-write は Claude sandbox 内では入れ子 Seatbelt で死ぬ)。
3. **`dangerouslyDisableSandbox: true` と絶対に併用しない**。sandbox 外で app-server や
   driver を動かすと Codex が完全無制限になる。
4. **egress は防げない**: プロンプト・diff・ファイル内容は OpenAI に送信される。
   レビューやタスクの前に「何が送られるか」(対象ファイル・diff の範囲) をユーザーに提示する。
   未ステージの WIP や秘密情報を含むときは範囲を絞るか redact する。

## 前提 (`~/.claude/settings.json`)

- `sandbox.filesystem.allowWrite`: `["~/.codex"]`
- `sandbox.network.allowedDomains`: `["api.openai.com","auth.openai.com","chatgpt.com","*.chatgpt.com"]`
- 認証確認: `codex login status` (未ログインなら ユーザーに `! codex login` を案内)。

## 起動レシピ (セッションで最初に 1 回)

ポートは `PORT="${CODEX_BRIDGE_PORT:-41100}"`。driver も同じ既定を使うので、変更するときは
env `CODEX_BRIDGE_PORT` で両方を一括で切り替える。server は **capability token 認証つき**で
立てる (token 無しの接続は handshake で拒否される。loopback でも機能することを実測済み)。

1. token 生成 (0600 の一時ファイル。**パスをこのセッション中ずっと使うので覚えておく**):
   `TOKEN_FILE=$(mktemp "$TMPDIR/codex-bridge-token.XXXXXX") && node -e 'require("fs").writeFileSync(process.argv[1], require("crypto").randomBytes(32).toString("hex"))' "$TOKEN_FILE" && echo "$TOKEN_FILE"`
2. run_in_background の Bash で常駐させる (`<TOKEN_FILE>` は 1 のパス):
   `codex app-server --listen "ws://127.0.0.1:${CODEX_BRIDGE_PORT:-41100}" --ws-auth capability-token --ws-token-file <TOKEN_FILE>`
   (localhost bind のみ。unix socket / `app-server daemon` / `proxy` は sandbox 内で bind
   できないため使えない。)
3. 数秒後に `curl -fsS "http://127.0.0.1:${CODEX_BRIDGE_PORT:-41100}/readyz"` を確認してから turn を投げる。
   turn には必ず `--token-file <TOKEN_FILE>` を付ける。
4. readyz は成功するのに turn が「rejected the handshake」で落ちる場合、そのポートは
   **別セッションの server**。ポートを変えて 1 からやり直す (token が異なるため誤使用は起きない)。
5. app-server はセッション終了で死ぬ。次のセッションでも同じレシピで再起動する。
6. token ファイルは**削除せずセッション中保持し、token の中身は読まない** (扱うのはパスのみ。
   `cat` などで内容をコンテキストに入れない)。理由と却下した代替案は spec の
   「セキュリティ・モデル > 却下した代替案」を参照。

## 1 ターンの駆動

prompt は stdin から渡す (材料束の入口)。**必ず quoted heredoc** で渡す —
`echo "<prompt>"` は材料中の `$(...)`/バッククォート/引用符をシェル展開してしまう。
turn は原則 run_in_background の Bash で:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-turn.mts" --cwd "$PWD" --token-file <TOKEN_FILE> <<'CODEX_PROMPT'
<prompt including materials, verbatim>
CODEX_PROMPT
```

(`--token-file` の代わりに env `CODEX_BRIDGE_TOKEN_FILE` でも渡せる。)

- 結果: stdout に JSON `{ threadId, turnStatus, turnError, finalMessage, tokenUsage }`。
- 進捗: stderr に 1 行 1 イベント (コマンド実行・エージェントメッセージ)。Monitor で追える。
- キャンセル: TaskStop (SIGTERM) で driver は `turn/interrupt` を送ってから終了する。
  server 側の turn も止まる (放置トークン消費なし)。
- マルチターン: 結果の `threadId` を `--thread <id>` に渡すと文脈込みで継続する。
- 構造化出力: `--schema <file.json>` (JSON Schema) で最終メッセージを constrained にできる。
- ネイティブレビュー: `--review-target -` で target JSON を stdin (quoted heredoc) から渡す。
  target は `{"type":"uncommittedChanges"}` / `{"type":"baseBranch","branch":"main"}` /
  `{"type":"commit","sha":"..."}` / `{"type":"custom","instructions":"..."}`。
- モデル/効力: `--model M` / `--effort E` (任意)。
- 並行: 独立したタスクは複数 background task で fan-out してよい
  (1 app-server で複数 thread の並行 turn が可能)。律速は CC 側の並行数。

## 材料束 (turn 入力の組み方)

Claude 転送フォーマットは無い。**Claude が要点を書いた handoff プロンプト**に、必要な材料
(diff 抜粋・ファイル内容・spec 抜粋・トランスクリプト要約) を貼って stdin で渡す。
生の全文ダンプより、curate した束のほうが質・安全とも上。送信前に範囲をユーザーに提示する。

## トラブルシュート

- `cannot reach app-server`: 起動レシピをやり直す。readyz が落ち続けるなら
  `codex login status` / `codex doctor` を確認。
- 起動直後の `failed to refresh available models` ERROR は非致命 (allowlist 外の副次ホスト)。
- `sandbox_apply: Operation not permitted` が turn 内で出る場合、danger 固定が崩れている。
  driver の改変を疑い、即中断してユーザーに報告する。
