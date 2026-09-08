# codex-cc-bridge

[![CI](https://github.com/ikeyan/codex-cc-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/ikeyan/codex-cc-bridge/actions/workflows/ci.yml)

Claude Code から OpenAI Codex を使うための、薄いプラグイン。

既存の `openai/codex-plugin-cc` が自前で持つランタイム・ジョブ・状態・転送の各層を、
Claude Code のネイティブ機能 (Background Task・完了通知・Monitor・TaskStop) と
`codex app-server` のネイティブ機能 (thread/turn RPC・outputSchema・review/start) に寄せて
実装量を減らす。同時に Codex の実行権限を **Claude Code のサンドボックスの部分集合**に
閉じ込めることを correctness 要件とする。

- 設計・ドメイン・セキュリティモデル: [wiki/](wiki/_index.md) (唯一のソース)
- 未実装 TODO: [docs/todo.md](docs/todo.md)
- 実測台帳: `ikeyan/canon` の `facts/codex/claude-sandbox-integration.md`

## インストール

`ikeyan` marketplace 経由:

```
/plugin marketplace add ikeyan/agent-files
/plugin install codex-cc-bridge@ikeyan
/reload-plugins
```

インストール後は `/codex-task`・`/codex-review` が使える。初回は `codex-bridge` skill の
起動レシピ (capability token 生成 → 常駐 app-server 起動) を踏む。前提となる Claude Code の
`~/.claude/settings.json` (`sandbox.enabled` / `allowLocalBinding` / `~/.codex` 書込許可 ほか) は
[skills/codex-bridge/SKILL.md](skills/codex-bridge/SKILL.md) の「前提」を参照。

## 構成

- `scripts/codex-turn.mts` — 常駐 app-server (Claude sandbox 内, capability token 認証) に対し
  1 turn / 1 review を駆動する極小 ws クライアント。sandbox は danger-full-access 固定 (fail-closed)。
- `scripts/codex-bridge.mts` — 起動レシピの機械的な部分 (セッションディレクトリと token の生成 /
  ポート抽出と readyz 待ち) と、rollout からの `turn_context` 取り出し。
- `commands/codex-task.md`, `commands/codex-review.md` — slash commands。
- `skills/codex-bridge/SKILL.md` — 起動レシピ・turn 入力の組み方・セキュリティ不変条件。
- `wiki/` — コードより上位の説明 (アーキテクチャ・ドメイン・セキュリティ)。plasma-wiki 管理。
- `tests/codex-turn.test.mjs` — 不変条件を pin。検証一式は `npm test`
  (driver を node/deno/bun で回すテスト行列 + `deno check` + `tsc` + `deno fmt/lint`
  + REVIEW.md の上流同期チェック)。
