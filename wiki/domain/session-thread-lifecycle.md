---
name: domain/session-thread-lifecycle
title: セッション・thread・ポートの寿命
desc: app-server はセッションで揮発し thread は codex 側に永続するという寿命の非対称と、そこから出てくるポート衝突の見分け方.
tags: []
sources: []
created: 2026-09-06T07:10:31Z
updated: 2026-09-06T07:10:31Z
---

# セッション・thread・ポートの寿命

**server は揮発し、thread は永続する。**この非対称が、起動レシピを毎セッション踏む理由と、
threadId を結果に載せて返す理由の両方を説明する。

| もの | 寿命 | 実体 |
| --- | --- | --- |
| app-server プロセス | CC セッションと同じ (sandbox プロセスの寿命) | 起動レシピで毎セッション立て直す |
| thread | 永続 | codex 側の `~/.codex` の sqlite state |
| driver プロセス | 1 turn | `scripts/codex-turn.mts` |

## セッションを跨げないもの・跨げるもの

app-server はセッション終了で死ぬので、セッション跨ぎの常駐は存在しない。毎セッションの頭で
`/readyz` を確認し、居なければ起動する ([[architecture/resident-app-server]])。

一方 thread は codex 側に残るので、**threadId さえ持ち回れば別セッションからでも `--thread` で
継続できる**。だから driver は結果 JSON に必ず `threadId` を載せ、commands はそれをユーザーに
提示する。`review/start` を使った場合はレビュー専用 thread に差し替わるので、返るのは
`reviewThreadId` の方 (追加質問は `/codex-task --thread <id>` でそこに続ける)。

## server の寿命は background task の寿命

app-server は**必ず `run_in_background` の Bash として立てる** (起動レシピ)。こうすると CC の
background task になり、寿命はそれに従う。

- 途中で止めたいときは **`TaskStop`** で回収できる (sandbox 内から実際に終了することを実測済み)。
- セッションを閉じるときは、ユーザーに task として見えているので**止めるかどうかはユーザーが決める**。

**`&` で立ててはいけない。**Bash 呼び出しの中で `cmd &` にするとプロセスは生き残るのに task と
しては追跡されないため、`TaskStop` の handle が無く、以後セッション内から止める手段が無くなる
(`kill` はシグナルが sandbox インスタンスを跨がないので失敗する)。canon:
`facts/claude-code/detached-bash-process-escapes-task-control`。

## 取り違えの見分け方

ポートを取り違えて他人の server に当たったときの症状は 1 つ:

- `/readyz` は通る (server は健在) のに、driver が handshake で弾かれる
  → token が違う = 別セッションの server。自分のポートを確認し直す。

token まで一致してしまった場合 (同じ token ファイルを使い回した等) はここをすり抜けるが、
その先で [[security/containment-probe|封じ込めプローブ]]の cwd 判定が捕まえる
(他セッションの sandbox は自分の作業ディレクトリに書けない)。
