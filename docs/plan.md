# codex-cc-bridge 実装計画

> spec: `docs/spec.md` / 引き継ぎ: `docs/handoff.md` / 実測台帳: `ikeyan/canon` `facts/codex/claude-sandbox-integration.md`
> 状態: spike 完了 (2026-08-24, codex-cli 0.149.0)。本計画は spike の決着を反映済み。

## spike の決着 (spec「未解決事項」への回答)

1. **常駐 app-server の寿命と封じ込め**: `run_in_background` の Bash で
   `codex app-server --listen ws://127.0.0.1:PORT` を Claude sandbox 内に起動する。
   - unix socket は sandbox 内で bind 全滅 (EPERM)。**`app-server daemon` / `proxy` も同理由で不可** (棄却)。
   - loopback TCP は listen/connect とも可。`/readyz` `/healthz` で別プロセスから健全性チェック可。
   - セッション内は生存。セッションを跨ぐ常駐は不可 → **「セッション開始時に readyz 確認 →
     無ければ background Bash で起動」を skill の起動レシピとして固定**。
   - 封じ込め実測: danger thread のコマンドは `$HOME` 直下 BLOCKED / `$TMPDIR` OK / repo OK。
2. **turn の駆動方式**: **自前の極小 WebSocket JSON-RPC クライアント** (node 組み込み `WebSocket`、
   依存ゼロ、~150 行)。proxy 案は 1 で棄却済み。
3. **出力スキーマ**: `turn/start` に `outputSchema` がネイティブに存在し機能する (実測)。
4. **並行の上限**: 1 app-server 上で複数接続 × 複数 thread の同時 turn が成立 (実測)。
   律速は **CC 側の fan-out (並行サブエージェント数)** に寄せ、driver 側に制限は持たない。
5. **副次ホスト**: 放置 (非致命 ERROR のみ)。
- 追加収穫: `review/start` が RPC にネイティブ存在 (target = uncommittedChanges / baseBranch{branch} /
  commit{sha} / custom{instructions}, delivery = inline/detached)。**diff 収集の自前実装は原則不要**。
- 注意: `turn/start` は `sandboxPolicy` で **turn 単位でも sandbox を上書きできる** →
  fail-closed は thread (`sandbox`) と turn (`sandboxPolicy`) の**両方**で danger を固定する。

## 成果物 (このリポジトリ = plugin ソース)

```
.claude-plugin/plugin.json        # name: codex-cc-bridge
scripts/codex-turn.mts            # 唯一の実装らしい実装: 1 ターン駆動の極小 ws クライアント
commands/codex-task.md            # /codex-task  — 材料束 + プロンプトで 1 turn (background)
commands/codex-review.md          # /codex-review — review/start ネイティブレビュー (background)
skills/codex-bridge/SKILL.md      # 起動レシピ・材料束・egress 提示・セキュリティ不変条件
tests/codex-turn.test.mjs         # mock ws server で sandbox 固定を pin (node --test)
docs/spec.md                      # 実装状況を追記
```

hook (Stop 前レビュー gate) は spec で任意 → 初版では見送り、後続タスク。

## `scripts/codex-turn.mts` の契約

- 入力: prompt は **stdin** (材料束の入口) または `--prompt`。
  フラグ: `--cwd DIR` / `--thread ID` (resume) / `--schema FILE` / `--model M` / `--effort E` /
  `--port N` (既定 41100, env `CODEX_BRIDGE_PORT`) / `--review-target JSON` (review モード)。
- **fail-closed**:
  - `thread/start`・`thread/resume` に `sandbox: "danger-full-access"`, `approvalPolicy: "never"` を固定。
  - `turn/start` に `sandboxPolicy: {type:"dangerFullAccess"}` を固定。
  - 未知フラグは即エラー (sandbox 系の注入経路を残さない)。
  - サーバー→クライアント要求 (approval 等) はすべて deny。
- 出力: stdout に結果 JSON `{ threadId, finalMessage, turnStatus }` のみ。
  進捗 (item/completed 等) は stderr に 1 行 1 イベント (CC の Monitor で流せる)。
- 接続失敗時は「app-server が起動していない。起動レシピ (skill) を見よ」と明示して exit≠0。

## 手順

1. driver 実装 + mock テスト (sandbox 固定 pin、未知フラグ拒否、resume 経路)。
2. 実機 E2E: 常駐 app-server に対し task turn / schema turn / review turn を各 1 回。
3. plugin 化 (plugin.json, commands, skill)。
4. spec の「実装状況」更新、handoff の完了項目更新。

## セキュリティ不変条件 (変更禁止)

spec §セキュリティ・モデルの 3 条件をコードとテストで pin する:
sandbox 内起動 / 全 thread・turn danger 固定 / `dangerouslyDisableSandbox` と併用しない。
egress は防げないため、commands は送信内容の範囲提示 (レビュー対象の要約) を必ず行う。
