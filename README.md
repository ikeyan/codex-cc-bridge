# codex-cc-bridge

Claude Code から OpenAI Codex を使うための、薄いプラグイン/ツール群の**設計リポジトリ** (実装前)。

既存の `openai/codex-plugin-cc` が自前で持つランタイム・ジョブ・状態・転送の各層を、いまの
Claude Code のネイティブ機能 (Background Task・完了通知・Monitor・TaskStop) と
`codex app-server` / `codex exec` のネイティブ機能に寄せて実装量を減らす。同時に Codex の実行権限を
**Claude Code のサンドボックスの部分集合**に閉じ込めることを correctness 要件とする。

- 仕様: [docs/spec.md](docs/spec.md)
- 実装引き継ぎ (spec 外の具体情報): [docs/handoff.md](docs/handoff.md)
- app-server を warm な常駐ランタイムとして使い、1 ターン (メッセージ→返信) を CC の Background Task として動かす。
- Codex の thread は必ず `danger-full-access` で開始し、Claude sandbox 内で起動することで
  「Codex の副作用 ⊆ Claude sandbox」を構成的に満たす。

現状はまだ設計段階。実装は仕様の「未解決事項」を確定してから着手する。
