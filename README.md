# codex-cc-bridge

[![CI](https://github.com/ikeyan/codex-cc-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/ikeyan/codex-cc-bridge/actions/workflows/ci.yml)

Claude Code から OpenAI Codex を使うための、薄いプラグイン。

既存の `openai/codex-plugin-cc` が自前で持つランタイム・ジョブ・状態・転送の各層を、
Claude Code のネイティブ機能 (Background Task・完了通知・Monitor・TaskStop) と
`codex app-server` のネイティブ機能 (thread/turn RPC・outputSchema・review/start) に寄せて
実装量を減らす。同時に Codex の実行権限を **Claude Code のサンドボックスの部分集合**に
閉じ込めることを correctness 要件とする。

- 仕様・実装状況・セキュリティモデル: [docs/spec.md](docs/spec.md) (唯一のソース)
- 実装計画と spike の決着: [docs/plan.md](docs/plan.md)
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
[docs/spec.md](docs/spec.md) の「Claude Code 側の必要設定」を参照。

## 構成

- `scripts/codex-turn.mts` — 常駐 app-server (Claude sandbox 内, capability token 認証) に対し
  1 turn / 1 review を駆動する極小 ws クライアント。sandbox は danger-full-access 固定 (fail-closed)。
- `commands/codex-task.md`, `commands/codex-review.md` — slash commands。
- `skills/codex-bridge/SKILL.md` — 起動レシピ・材料束・セキュリティ不変条件。
- `tests/codex-turn.test.mjs` — 不変条件を pin。検証一式は `npm test`
  (driver を node/deno/bun で回すテスト行列 + `deno check` + `tsc`)。
