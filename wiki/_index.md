---
name: codex-cc-bridge
desc: codex-cc-bridge のコードより上位の説明 — なぜこれだけ薄いのか (architecture)、扱う対象の語彙 (domain)、壊してはいけない不変条件 (security).
tags: []
sources: []
created: 2026-09-06T07:10:31Z
updated: 2026-09-06T07:16:45Z
---

# codex-cc-bridge

[[architecture/_index|architecture/]]: この橋がなぜ driver 1 本しか持たないのか — CC と codex への委譲の境界、常駐 app-server と接続方式、共有 server 上で自分の turn を同定する仕掛け.

[[domain/_index|domain/]]: この橋が扱う対象そのものの語彙 — app-server API のうち使う面と誤りやすい点、参照で渡す turn 入力、server と thread とポートの寿命.

[[security/_index|security/]]: 封じ込め不変条件とその守り方 — なぜ danger-full-access が唯一安全なのか、プローブが証明する範囲、token の扱い、そして封じ込められない egress.

***

`scripts/codex-turn.mts` を読めば分かることは書かない。ここに置くのは**コードを追うだけでは分からないこと**
— なぜその層が存在しないのか、なぜ最も危険に見える設定が唯一安全なのか、何が保証されていて何が保証されていないのか。

住み分け:

- **wiki/ (ここ)**: このリポジトリの設計・語彙・不変条件。恒久的な説明。
- **`docs/`**: 未実装の TODO のみ。実装済みの設計メモは git 履歴と wiki に委ねる。
- **canon (`ikeyan/canon`)**: 外部依存 (codex CLI・app-server・Claude Code sandbox) の実測事実。
  とくに `facts/codex/claude-sandbox-integration`。ここの記述が外部の挙動に依存するときは canon を引く。

初めて読むなら [[architecture/delegation-boundary]] → [[security/containment-invariant]] →
[[security/why-danger-full-access]] の順。
