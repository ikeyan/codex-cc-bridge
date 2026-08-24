# このリポジトリでの作業規則

唯一のソースは `docs/spec.md`。実装を変えたら「実装状況 / 検証」節を更新する。

- 開発目標は**機能を保って複雑さを減らす**こと。代替案の採否は「同等機能を何個の可動部品で
  得るか」で比較する (「broker っぽいから却下」のような構造的理由付けはしない)。
- 外部依存 (codex CLI / app-server / Claude Code sandbox) の挙動に依存する記述は、記憶で断定せず
  一次情報か実測で裏を取る。確定済みの事実は `ikeyan/canon` の `facts/codex/` を引く/追記する。
- スクリプトは node 組み込みを優先 (引数解析は `node:util` の `parseArgs`)、型付き .mts
  (erasable types のみ、Node >= 23.6 の type stripping で直接実行) で書く。依存ゼロを維持。
- テスト: `node --test tests/codex-turn.test.mjs`
- 実行済みの設計メモは git 履歴に委ねて整理する。
- コミット末尾に Co-Authored-By と Claude-Session の trailer を付ける
  (セッション URL はセッションごとに違うので使い回さない)。
