---
name: security/why-danger-full-access
title: なぜ最も危険に見える設定が唯一安全なのか
desc: codex の read-only/workspace-write は codex 自身が Seatbelt を張るモードで Claude sandbox 内では入れ子不可で死に、danger-full-access は「codex が何も張らない」の意味なので継承した Claude sandbox がそのまま効く.
tags: []
sources: []
created: 2026-09-06T07:10:31Z
updated: 2026-09-06T07:10:31Z
---

# なぜ最も危険に見える設定が唯一安全なのか

driver は sandbox を `danger-full-access` に**固定**している。名前だけ見ると封じ込めを捨てて
いるように読めるが、逆である。この点を誤解したまま「安全側に倒そう」として
`read-only` に変える改変が、この設計を壊す最短経路になる。

## codex の sandbox 値が実際に意味すること

codex の `sandbox` は「codex 自身が Seatbelt (macOS) を張るかどうか」の指定である。

- `read-only` / `workspace-write`: **codex が自分で Seatbelt を張る**。Claude sandbox の中では
  入れ子にできず `sandbox-exec: sandbox_apply: Operation not permitted` (exit 71) で全ツール実行が死ぬ。
  仮に Claude sandbox の外で動かせば起動はするが、そのとき効くのは codex 自身の裁量で決まる範囲で、
  Claude sandbox より広い読みを許してしまう。
- `danger-full-access`: **codex は何も張らない**。張らないので、app-server が
  [[architecture/resident-app-server|起動時に継承した Claude sandbox]] がそのまま効き続ける。

つまり `danger-full-access` は「無制限」ではなく「**codex が上書きしない**」の意味であり、
Claude sandbox 内で動かす限り、これが「⊆ Claude sandbox」を構成的に満たす唯一の経路である。

## 結論として避けるべき変更

- 「危険そうだから `read-only` に落とす」— sandbox 内では即死し、sandbox 外では封じ込めが緩む。
  どちらに転んでも悪化する。
- 「`~/.codex/config.toml` で締める」— **明示指定が config を上書きする**ため効かない。
  実測では config が `danger-full-access` でも明示 `--sandbox read-only` が勝つ。
  したがって呼び出し側 (driver) が固定するしかない。

実測の出典は canon: `facts/codex/claude-sandbox-integration`。thread と turn の 2 階層とも
固定する必要がある理由は [[domain/app-server-protocol-surface]]。
