---
name: security
desc: 封じ込め不変条件とその守り方 — なぜ danger-full-access が唯一安全なのか、プローブが証明する範囲、token の扱い、そして封じ込められない egress.
tags: []
sources: []
created: 2026-09-06T07:16:13Z
updated: 2026-09-06T08:41:08Z
---

# security

[[_index|..]]

[[security/capability-token|capability-token]]: 常駐 server を token 認証で守る構成、token ファイルを消さず中身も読まない運用の理由、そして同等のアクセス制御をより多い部品で得るために却下した代替案.

[[security/containment-invariant|containment-invariant]]: 3 条件が同時に成り立つときだけ Codex の副作用が Claude sandbox に閉じる。各条件をどこが守っているか、どれがコードで守れない弱い環かを示す.

[[security/containment-probe|containment-probe]]: turn を起こす前に command/exec で $HOME・/tmp・cwd の書込可否を測って誤接続を fail-closed で弾く仕掛けと、その保証の範囲.

[[security/egress-is-not-contained|egress-is-not-contained]]: 送られうるものの上界は Claude sandbox が Codex に読ませる範囲であってプロンプトの中身ではない。だから「何が送られるか」の範囲提示は下界を上界に見せる誤りになる.

[[security/why-danger-full-access|why-danger-full-access]]: codex の read-only/workspace-write は codex 自身が Seatbelt を張るモードで Claude sandbox 内では入れ子不可で死に、danger-full-access は「codex が何も張らない」の意味なので継承した Claude sandbox がそのまま効く.

***

**変更前に必ず読む節。**[[security/containment-invariant]] の 3 条件は同時に成り立ってはじめて意味を持ち、1 つでも欠けると保証は無くなる。とくに `danger-full-access` を「安全側に」変えようとする改変は、この設計を壊す最短経路になる ([[security/why-danger-full-access]])。
