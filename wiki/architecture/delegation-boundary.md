---
name: architecture/delegation-boundary
title: 委譲の境界 — 自前で持たない層
desc: ジョブ・状態・転送の各層を CC と codex のネイティブ機能へ委譲した結果このリポジトリのコードは driver 1 本しかない。「無い層」は設計であって欠落ではない.
tags: []
sources: []
created: 2026-09-06T07:10:31Z
updated: 2026-09-06T07:10:31Z
---

# 委譲の境界 — 自前で持たない層

このリポジトリを最初に読む人が面食らうのは、**コードがほとんど無いこと**である。実装は
[`scripts/codex-turn.mts`](../../scripts/codex-turn.mts) (1 turn の駆動) と
[`scripts/codex-bridge.mts`](../../scripts/codex-bridge.mts) (起動レシピの機械的な部分) の
2 本だけで、残りは Markdown (skill と slash command) しかない。これは削り残しではなく、
設計の主張そのものである。

## 何をどこへ委譲したか

- **Claude Code へ**: 実行と id (Background Task)、完了通知、結果の受け渡し (結果ファイル)、
  キャンセル (`TaskStop` → SIGTERM)、進捗表示 (Monitor)、並行実行 (並行サブエージェントによる fan-out)。
- **codex app-server へ**: thread の永続と `thread/resume`、構造化出力 (`turn/start` の `outputSchema`)、
  コードレビュー一式 (`review/start` が対象 diff の収集からレビュープロンプトまで持つ)。
- **自前**: 1 turn 分の JSON-RPC を回す ws クライアントと、起動レシピの機械的な部分。
  プロンプトや判断は「コード」ではなく「内容」として
  [`skills/codex-bridge/SKILL.md`](../../skills/codex-bridge/SKILL.md) と
  [`commands/`](../../commands) に置く。

## skill に残すもの / script に出すもの

境界は「**CC (harness) にしかできないか**」で引く。起動レシピのうち skill に残っているのは
`run_in_background` で app-server を立てる 1 手と、`TaskStop` の扱いだけである。token ファイルの
生成、起動待ち、ポート抽出、`/readyz` 確認は決定的な手続きなので `codex-bridge.mts` に出した。

出す理由は行数ではなく**テストできるかどうか**。Markdown に埋まったシェル片は、正規表現を打ち
間違えても `mktemp` の mode を忘れても誰も気付かない。コードにすれば `npm test` が毎回見る。
逆に「何を材料にするか」「どこまで送ってよいか」のような判断は script に出せないので skill に残す。

## 「無い層」の一覧 (探しても見つからないもの)

置き換え元の `openai/codex-plugin-cc` にあってここに無いのは、broker/job endpoint 層、
job-control・tracked-jobs・state、`status`/`result`/`cancel` サブコマンド、
Claude トランスクリプトを thread に変換する transfer 実装、構造化出力のパース/整形、
大きな `setup` スクリプトである。いずれも上の委譲先が同じ機能を持っている。

コードを読んでも「無い物」は見えないので、ここに書いておく。**これらを足したくなったら、
まず CC か codex のネイティブ機能で同じことができないかを確認する。**

## 採否の基準

代替案は「同等の機能と信頼性を何個の可動部品で得るか」で比較する。構造的な理由付け
(「broker っぽいから却下」等) はしない。実際、[[security/capability-token|fd 受け渡し案の却下]]
はアクセス制御が token 方式と**同等**だと認めた上で、可動部品が純増することだけを理由にしている。

可動部品は数だけでなく壊れやすさで重み付ける。上の「skill に残すもの / script に出すもの」が
その適用で、テストで固定された決定的な手続きは軽く、LLM が毎回読んで実行する散文の手順は
実行のたびに誤りうるぶん重い。だからコードを Markdown に置き換えて部品数を減らしても、
この基準では改善にならない (信頼性が落ち、誤りのぶん実行コストも上がる)。
