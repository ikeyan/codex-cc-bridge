---
name: security/containment-probe
title: 封じ込めプローブ — 何を証明し、何を証明しないか
desc: turn を起こす前に command/exec で $HOME・/tmp・cwd の書込可否を測って誤接続を fail-closed で弾く仕掛けと、その保証の範囲.
tags: []
sources: []
created: 2026-09-06T07:10:31Z
updated: 2026-09-06T07:10:31Z
---

# 封じ込めプローブ — 何を証明し、何を証明しないか

thread を作る前に、driver は [[domain/app-server-protocol-surface|`command/exec`]] で
server 自身に 3 箇所への書込を試させ、結果で続行可否を決める
([`scripts/codex-turn.mts`](../../scripts/codex-turn.mts) の "Containment preflight" ブロック)。

| 測る場所 | 期待 | 意味 |
| --- | --- | --- |
| `$HOME` 直下 | BLOCKED | 何らかの sandbox の中にいる |
| `/tmp` 直下 | BLOCKED | 同上 |
| 対象 `cwd` | WRITABLE | それが**この**セッションの sandbox である |

いずれかが期待と違えば、turn を起こさずに中断する。

## 設計上の要点

- **なぜ turn の前か**: thread も turn も作る前に落とせば、トークン消費もファイル変更もゼロで
  止まる。誤接続に気付くのが turn の途中では遅い。
- **なぜ `/tmp` 直下か**: Claude sandbox は `/tmp` 直下への書込は拒否する一方、
  `/tmp/claude*` のような指定サブツリーには書かせる。だから「sandbox の中か」を判定する
  プローブは、許可されたサブツリーではなく**直下**を突く必要がある。
- **`/tmp` 直下 BLOCKED は macOS (Seatbelt) での実測に立っている**: Linux の Claude sandbox
  (bubblewrap) で `/tmp` 直下がどう扱われるかは未測。もし書けるなら、正しく sandbox 内にいる server も
  「NOT confined」で拒否される (fail-closed 側に倒れるので実害は起動不能に留まる)。Linux で使うときは
  先に測って canon に置き、必要ならこの判定を見直す。
- **なぜ `sandboxPolicy` を明示するか**: 省くとユーザー設定の codex sandbox が `command/exec` に
  適用され、Claude sandbox 内では入れ子 Seatbelt で exit 71 になる。プローブ自体が理由もなく
  「失敗」してしまうため、turn と同じ policy を明示的に渡す。
- **なぜ書込を実際に試すか**: 起動時の sandbox は driver からは観測できない
  ([[architecture/resident-app-server|封じ込めを決めるのは server の起動場所]])。
  申告ではなく実測でしか判定できない。

## 保証の範囲

**証明すること** — 誤接続の検出。sandbox 外で起動された server (HOME/tmp が書ける)、
別セッションの sandbox にいる server (cwd に書けない) を、どちらも turn 前に弾く。

**証明しないこと** — 能動的な攻撃者への防御ではない (server が正直に応答する前提に立っている)。
sandbox 自体の完全性を検査するものでもない。そして測っているのは **write の可否だけ**なので、
read スコープについては何も言わない — 既定の read はコンピュータ全体なので、プローブが 3 つとも
期待どおりでも [[security/egress-is-not-contained|egress の上界は縮んでいない]]。
