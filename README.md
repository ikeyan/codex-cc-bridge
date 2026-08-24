# codex-cc-bridge

Claude Code から OpenAI Codex を使うための、薄いプラグイン。

既存の `openai/codex-plugin-cc` が自前で持つランタイム・ジョブ・状態・転送の各層を、
Claude Code のネイティブ機能 (Background Task・完了通知・Monitor・TaskStop) と
`codex app-server` のネイティブ機能 (thread/turn RPC・outputSchema・review/start) に寄せて
実装量を減らす。同時に Codex の実行権限を **Claude Code のサンドボックスの部分集合**に
閉じ込めることを correctness 要件とする。

- 仕様・実装状況・セキュリティモデル: [docs/spec.md](docs/spec.md) (唯一のソース)
- 実装計画と spike の決着: [docs/plan.md](docs/plan.md)
- 実測台帳: `ikeyan/canon` の `facts/codex/claude-sandbox-integration.md`

## 構成

- `scripts/codex-turn.mts` — 常駐 app-server (Claude sandbox 内, capability token 認証) に対し
  1 turn / 1 review を駆動する極小 ws クライアント。sandbox は danger-full-access 固定 (fail-closed)。
- `commands/codex-task.md`, `commands/codex-review.md` — slash commands。
- `skills/codex-bridge/SKILL.md` — 起動レシピ・材料束・セキュリティ不変条件。
- `tests/codex-turn.test.mjs` — 不変条件を pin (`node --test tests/codex-turn.test.mjs`)。
