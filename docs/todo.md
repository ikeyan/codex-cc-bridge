# 未実装 TODO

実装済みの設計・不変条件の説明は [`wiki/`](../wiki/_index.md)、外部依存の実測事実は canon
(`ikeyan/canon` の `facts/codex/claude-sandbox-integration`) が正。ここには**まだ無いもの**だけを置く。

## Stop 前レビュー gate hook

セッションの Stop 時に Codex レビューを 1 回走らせる hook。初版では見送った。

- 位置づけ: 任意機能。無くても封じ込め不変条件 (`wiki/security/containment-invariant.md`) には影響しない。
- 実装の見込み: 数行。`review/start` を叩く driver 呼び出し 1 本 + `hooks` 設定。
  独自のレビュー実装は持たない (`wiki/architecture/delegation-boundary.md`)。
- 未着手の理由: 「Stop のたびにレビューを走らせる」運用が本当に欲しいかが未検証で、
  hook 設定・plugin.json・失敗時の挙動という可動部品が確実に増えるため。
