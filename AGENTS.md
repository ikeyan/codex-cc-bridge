# このリポジトリでの作業規則

現状は設計リポジトリ。唯一のソースは `docs/spec.md`。

- 外部依存 (codex CLI / app-server / Claude Code sandbox) の挙動に依存する記述は、記憶で断定せず
  一次情報か実測で裏を取る。確定済みの事実は `ikeyan/canon` の `facts/codex/` を引く/追記する。
- 実装を始めたら spec の「実装状況 / 検証」節を更新し、実行済みの設計メモは git 履歴に委ねて整理する。
- コミット末尾に Co-Authored-By と Claude-Session の trailer を付ける。
