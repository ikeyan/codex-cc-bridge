# 実装セッションへの引き継ぎ (spec 外の情報)

> 2026-08-24 更新: §3 の spike は全て完了 (結果は `docs/plan.md` と canon に反映)。
> 実装は初版済み — 現状は `docs/spec.md` の「実装状況」節が正。本文書は履歴として残す。

`docs/spec.md` に無い、実装を始めるのに必要な具体情報。spec が「何を作るか」、これは「どこを見て、
どう始めるか」。

## 0. 進め方 (このリポジトリで有効なプラグイン)

`.claude/settings.json` で `superpowers@claude-plugins-official` と `ikeyan-skills@ikeyan` を有効化済み。
初回セッションでプラグイン marketplace の信頼プロンプトが出たら承認する。

- spec は確定済みなので brainstorming は不要。**superpowers:writing-plans → subagent-driven-development**
  で実装するのが素直。ただし spec の「未解決事項」#1/#2 は設計判断が要るので、まず **spike で潰してから**
  plan を書く (下記 §3)。
- コミット末尾に trailer を付ける規律 (このリポジトリの過去コミット参照): `Co-Authored-By: Claude ...`
  と `Claude-Session: <そのセッションの URL>`。セッション URL はセッションごとに違うので使い回さない。

## 1. 既存実装 (置き換え対象) の読みどころ

`openai/codex-plugin-cc`。ローカル cache: `~/.claude/plugins/cache/openai-codex/codex/<version>/scripts/`
(検証時は `1.0.6`。**バージョンでパスが変わる**ので `ls ~/.claude/plugins/cache/openai-codex/codex/`
で確認する)。要点だけ:

- `lib/app-server.mjs` — `spawn("codex", ["app-server"], { shell:false, env: ... })` で app-server を起動し
  JSON-RPC を張る。`request(method, params)` / `notify(method, params)`。`initialize` → `initialized`。
  **`shell:false` なので alias/PATH 迂回は効かない** (呼び出し形を変えるならここ)。
- `lib/codex.mjs` — **ここが sandbox 値を決める中核**。
  - `buildThreadParams(cwd, opts)` → `{ cwd, model, approvalPolicy: opts.approvalPolicy ?? "never",
    sandbox: opts.sandbox ?? "read-only", serviceName, ephemeral: opts.ephemeral ?? true }`
  - `buildResumeParams(...)` も同様に `sandbox ?? "read-only"`。
  - RPC 呼び出し: `client.request("thread/start", buildThreadParams(...))`, `"turn/start"`, `"thread/resume"`。
    イベント: `thread/started` / `turn/started` / `thread/name/updated`。
  - review/task は `runAppServerTurn(root, { sandbox: "read-only" | "workspace-write", approvalPolicy:"never",
    outputSchema, onProgress, ... })` を呼ぶ (`codex-companion.mjs` の review/adversarial-review/task)。
  - **この plugin の欠陥 = 我々の設計変更点**: `sandbox` に `read-only`/`workspace-write` を明示送信するので、
    Claude sandbox 内では入れ子 Seatbelt で死ぬ。新設計では **`danger-full-access` を固定送信**する。
- `lib/git.mjs` — `collectReviewContext(cwd, target)`。working-tree/branch スコープ、staged/unstaged/untracked、
  `maxInlineFiles`/`maxInlineDiffBytes`/`MAX_UNTRACKED_BYTES(=24KB)` の上限で stat 化。**意図は残す価値あり、
  ただし薄くする**対象。
- `lib/app-server-broker.mjs` / `broker-lifecycle.mjs` / `job-control.mjs` / `tracked-jobs.mjs` / `state.mjs`
  — **捨てる層** (CC Background Task/通知/TaskStop/Monitor に置換)。読むのは「何を CC に肩代わりさせるか」の確認用。
- `scripts/session-lifecycle-hook.mjs` / `stop-review-gate-hook.mjs` / `../hooks/hooks.json` — Stop gate 等。
  hook は **Claude sandbox の外**で走る点に注意 (そこから起動する経路まで danger 化すると境界が崩れる)。
- `codex-companion.mjs` setup — auth 検出は `account/read` RPC。新設計では `codex login`(status)/`codex doctor` で代替。

## 2. codex 側の確定仕様 (実測済み。憶測で上書きしない)

一次情報は `ikeyan/canon` の `facts/codex/claude-sandbox-integration.md`。要点:

- 入れ子サンドボックス不可。`read-only`/`workspace-write` は Claude sandbox 内で `sandbox_apply: Operation
  not permitted`。**`danger-full-access` だけ Seatbelt を張らず、コマンドは Claude sandbox に閉じる**
  (実測: repo 内/`$TMPDIR` 可、`$HOME` 直下不可)。
- **明示の sandbox 値が `~/.codex/config.toml` を上書きする**。config で danger にしても、明示 read-only を
  送れば read-only が勝つ。→ 挙動は**呼び出し側 (thread/turn の RPC パラメータ) で固定**するしかない。
- `codex exec` ネイティブ: `--output-schema FILE` / `--json` (JSONL イベント) / `-o FILE` (最終メッセージ) /
  `resume [--last]` / `fork` / `review`。prompt は stdin から `<stdin>` ブロックで渡せる → §材料束の入口。
- `codex app-server` サブコマンド: `daemon` / `proxy` / `generate-ts` / `generate-json-schema`。
  `proxy` は「running app-server の control socket に stdio を橋渡し」= 自前 RPC クライアントを薄くできる候補 (§3-2)。
- 起動要件: `~/.codex` の sqlite を書けること。書けないと `failed to initialize ... app-server client`。
- 認証: 現在 ChatGPT ログイン有効 (`kik@nvstl.com`)。`codex login` / `codex doctor` で確認。
- 副次: モデル一覧 refresh が `https://chatgpt.com/backend-api/ps/mcp` を叩き、allowlist 外だと非致命 ERROR。
  動作影響なし。消したければ allowlist に足す。PATH alias 作成失敗の WARNING も無害。

## 3. 最初にやる spike (plan の前に潰す)

### spike 1: 常駐 app-server の寿命と封じ込め (spec 未解決 #1) — 最重要
- `run_in_background` の Bash で Claude sandbox 内に `codex app-server` を立て、**CC のターンをまたいで
  生存するか**、生存中に走らせた turn のコマンドが **Claude sandbox に閉じ続けるか** を実測する。
- 検証コマンド例 (danger thread で `$HOME` 書込が拒否され、repo/`$TMPDIR` は通ることを見る):
  - danger で Seatbelt が張られないことは実測済み:
    `codex sandbox -c sandbox_mode="danger-full-access" -- /bin/sh -c 'touch "$HOME/x" || echo HOME_BLOCKED; touch "$TMPDIR/x" && echo TMP_OK'`
- 生存しない/封じ込めが崩れるなら「セッション開始で起動 + 健全性チェック + 必要時再起動」の運用を定義する。
  codex 純正 `app-server daemon` が使えるかも合わせて見る。

### spike 2: turn の駆動方式 (spec 未解決 #2)
- 自前 JSON-RPC クライアント (initialize → thread/start[sandbox=danger-full-access] → turn/start →
  イベント購読 → 最終メッセージ) と、`codex app-server proxy` 経由のどちらが薄く・壊れにくいか。
- 出力スキーマの口が app-server RPC と `codex exec --output-schema` で同じか差があるか (spec 未解決 #3)。

これらの結果を canon (`facts/codex/`) に追記してから plan に入る。

## 4. Claude Code 側の前提設定 (このマシンでは適用済み)

`~/.claude/settings.json` (ユーザー設定、このマシンでは設定済み。別マシンで実装するなら再現が要る):
- `sandbox.filesystem.allowWrite`: `["~/.codex"]`
- `sandbox.network.allowedDomains`: `["api.openai.com","auth.openai.com","chatgpt.com","*.chatgpt.com"]`
- (任意) `permissions.allow` に `codex ...` 系。**注意**: この allow を Claude 自身に追記させようとすると
  auto mode の classifier に弾かれる (自分の実行権限拡張は拒否される)。**ユーザーが手で足す**。

## 5. セキュリティ不変条件 (実装で必ず守る / 検査で pin)

1. app-server を **Claude sandbox 内**で起動。
2. すべての thread/turn を **`danger-full-access`** で開始 (turn ドライバで固定、外部入力で上書き不可 = fail-closed)。
3. **`dangerouslyDisableSandbox` と併用しない**。
4. egress は防げない: Codex に渡す材料 (diff/ファイル/トランスクリプト) は OpenAI に送られる。
   working-tree レビューは未ステージ WIP も送りうる → 送信前に範囲提示・必要なら redact。

## 6. 参考リンク

- 仕様: `docs/spec.md`
- 実測台帳: `ikeyan/canon` `facts/codex/claude-sandbox-integration.md`
- 置き換え対象: `openai/codex-plugin-cc` (ローカル cache は §1)
