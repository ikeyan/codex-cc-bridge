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
   driver はさらに turn 前に封じ込めプローブ (`command/exec` で $HOME・/tmp 直下 書込不可 & 対象 cwd 書込可) を
   自動実行し、sandbox 外の server や別セッションの server には fail-closed で接続を拒否する。
2. thread/turn の sandbox は driver が `danger-full-access` に固定している (変更不可)。
   これで Codex のコマンド実行は Claude sandbox の部分集合に閉じる
   (read-only/workspace-write は Claude sandbox 内では入れ子 Seatbelt で死ぬ)。
3. **`dangerouslyDisableSandbox: true` と絶対に併用しない**。sandbox 外で app-server や
   driver を動かすと Codex が完全無制限になる。
4. **egress は防げず、上界は sandbox の read スコープ**: Codex は自分でファイルを読み
   コマンドを実行できるので、送られうるものはプロンプトの中身ではなく
   **Claude sandbox が Codex に読ませる範囲**で決まる。既定の read はコンピュータ全体
   (`~/.ssh/`・`~/.codex/auth.json` を含む)。
   **「何が送られるか」の範囲提示はしない** — 出せるのは下界だけで、提示に無いものは
   送られないという誤った安心を与えるため (`wiki/security/egress-is-not-contained.md`)。
   絞りたい場合に効くのは `~/.claude/settings.json` 側の read 制限であって、turn ごとの操作ではない。
5. **codex は自分が sandbox 内にいることを知らない**ので、driver が thread 開始時に
   `developerInstructions` でそれを伝え、`cc-cli-sandbox` skill のファイルパスを参照させている
   (自動。手で足す必要はない)。turn 中に「/tmp に書けない」「外部ホストに繋がらない」を
   codex がコードの不具合として報告してきたら、それは sandbox なので却下してよい。

## 前提 (`~/.claude/settings.json`)

- `sandbox.enabled`: `true`, `sandbox.failIfUnavailable`: `true` — sandbox 有効が全体の前提。
- `sandbox.network.allowLocalBinding`: `true` — app-server の localhost listen 用 (macOS)。
- `sandbox.filesystem.allowWrite`: `["~/.codex"]`
- `sandbox.network.allowedDomains`: `["api.openai.com","auth.openai.com","chatgpt.com","*.chatgpt.com"]`
- 認証確認: `codex login status` (未ログインなら ユーザーに `! codex login` を案内)。

## 起動レシピ (セッションで最初に 1 回)

機械的な部分は `${CLAUDE_PLUGIN_ROOT}/scripts/codex-bridge.mts` に入っている。ここで手で組むのは
**CC にしかできない 1 手 (background task としての起動) だけ**。

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-bridge.mts" init`
   → stdout に **TOKEN_FILE のパス**。stderr に次に流すコマンドが出る。
   **このパスはセッション中ずっと使うので覚えておく。**
2. 1 の stderr が出したコマンドを、そのまま **`run_in_background` の Bash** で実行する:
   `codex app-server --listen "ws://127.0.0.1:0" --ws-auth capability-token --ws-token-file <TOKEN_FILE>`
   - **`&` を付けて普通の Bash で起動してはいけない**。task として追跡されず `TaskStop` が効かなくなる。
   - ポートは 0 (OS が空きを選ぶ)。固定ポートは他セッションの server と衝突する。
   - unix socket / `app-server daemon` / `proxy` は sandbox 内で bind できないので使えない。
3. `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-bridge.mts" ready <2 の出力ファイル>`
   → 起動待ち・ポート抽出・`/readyz` 確認をまとめてやり、stdout に **PORT** を出す。
   失敗すれば理由付きで exit≠0 するので、待ち時間を自分で見積もらない。
   **PORT も TOKEN_FILE と同じくセッション中ずっと使う。**
4. 以降の turn には必ず `--port <PORT> --token-file <TOKEN_FILE>` を付ける
   (driver に既定ポートは無く、未指定なら起動を拒否する)。
5. server は 2 の background task として生き続ける。止めたくなったら **`TaskStop`** に
   その task id を渡す。セッションを閉じるときは task がユーザーに見えているので、止めるかどうかは
   ユーザーが決める。
6. token ファイルは**削除せずセッション中保持し、token の中身は読まない** (扱うのはパスのみ。
   `cat` などで内容をコンテキストに入れない)。理由と却下した代替案は
   `wiki/security/capability-token.md` を参照。

## 1 ターンの駆動

prompt は stdin から渡す。**Write ツールで一時ファイルに書き、`<` でリダイレクト**
する — シェルに内容を通さないので、展開 (`$(...)`/バッククォート) も heredoc 終端行の衝突も
起きない。turn は原則 run_in_background の Bash で:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-turn.mts" --cwd "$PWD" --port <PORT> --token-file <TOKEN_FILE> < /path/to/prompt.txt
```

(env でも渡せる: `CODEX_BRIDGE_PORT` / `CODEX_BRIDGE_TOKEN_FILE`。どちらも欠けると driver は
起動を拒否する — 既定ポートは無い。)

- 結果: stdout に JSON `{ threadId, turnStatus, turnError, finalMessage, tokenUsage }`。
- 進捗: stderr に 1 行 1 イベント (コマンド実行・エージェントメッセージ)。Monitor で追える。
- キャンセル: TaskStop (SIGTERM) で driver は `turn/interrupt` を送ってから終了する。
  server 側の turn も止まる (放置トークン消費なし)。
- マルチターン: 結果の `threadId` を `--thread <id>` に渡すと文脈込みで継続する。
- 構造化出力: `--schema <file.json>` (JSON Schema) で最終メッセージを constrained にできる。
- ネイティブレビュー: `--review-target -` で target JSON を stdin (Write したファイルの
  リダイレクト) から渡す。target は `{"type":"uncommittedChanges"}` /
  `{"type":"baseBranch","branch":"main"}` / `{"type":"commit","sha":"..."}` /
  `{"type":"custom","instructions":"..."}`。
- モデル: `--model M` (任意)。thread レベルの設定なので**レビューにも効く**。
  指定した名前が実在するかは app-server が検証せずそのまま返すので、
  進捗の `{"event":"thread",...}` に出る `model` は「受け付けられた」ことの証明でしかない。
  実際にその モデルで走ったかは turn が正常完了したことと
  `~/.codex/sessions/**/rollout-*.jsonl` の `turn_context.model` で確かめる。
- 効力: `--effort E` (任意)。**turn 単位の設定なのでレビューには渡せない** (driver が拒否する)。
  レビューの effort は `~/.codex/config.toml` の `model_reasoning_effort` に従う。
- 並行: 独立したタスクは複数 background task で fan-out してよい
  (1 app-server で複数 thread の並行 turn が可能)。律速は CC 側の並行数。

## turn 入力の組み方 (参照で渡す)

**ファイルの中身をプロンプトに貼らない。**Codex は自分で読み、コマンドを実行できる。
渡すのは「何をしてほしいかの意図と制約」+「対象への参照」だけ:

- リポジトリ相対のパス・ディレクトリ・glob (`--cwd "$PWD"` を渡すので相対で解決する)
- git の参照 — ブランチ名・sha、読ませたい `git diff --stat main...` のようなコマンド

中身を書くのは **Codex から到達できない情報**だけ (Claude 側の文脈での判断、別セッション・
別マシンの出力、web で読んだ内容)。貼っても egress は減らず (不変条件 4)、実物とずれ、
トークンを二重に食う。詳細は `wiki/domain/turn-input-references.md`。

## トラブルシュート

- `no endpoint`: `--port` を渡していない。起動レシピ 3 でポートを読む。
- `cannot reach app-server`: ポートを取り違えているか server が死んでいる。
  起動した background task の出力を読み直してポートを確認する。生きている server の一覧は
  `lsof -nP -iTCP -sTCP:LISTEN | grep codex` (`ps` は他の sandbox のプロセスを見せない)。
  readyz が落ち続けるなら `codex login status` / `codex doctor` を確認。
- `rejected the handshake`: readyz は通るのに弾かれる = その server は別セッションのもの
  (token が違う)。自分のポートを取り違えている。
- 起動直後の `failed to refresh available models` ERROR は非致命 (allowlist 外の副次ホスト)。
- `sandbox_apply: Operation not permitted` が turn 内で出る場合、danger 固定が崩れている。
  driver の改変を疑い、即中断してユーザーに報告する。
