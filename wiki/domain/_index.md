---
name: domain
desc: この橋が扱う対象そのものの語彙 — app-server API のうち使う面と誤りやすい点、参照で渡す turn 入力、server と thread とポートの寿命.
tags: []
sources: []
created: 2026-09-06T07:16:13Z
updated: 2026-09-06T10:29:45Z
---

# domain

[[_index|..]]

[[domain/app-server-protocol-surface|app-server-protocol-surface]]: driver が触る v2 JSON-RPC の部分集合と、その中で誤りやすい点 — sandbox 指定が thread と turn の 2 階層にあること、command/exec がモデルを介さないこと、review/start に prompt の口が無いこと.

[[domain/session-thread-lifecycle|session-thread-lifecycle]]: app-server はセッションで揮発し thread は codex 側に永続するという寿命の非対称と、そこから出てくるポート衝突の見分け方.

[[domain/turn-input-references|turn-input-references]]: Codex は自分でファイルを読みコマンドを実行できるので turn の入力はパスと git ref と意図だけを渡し、中身を貼るのは Codex から到達できない情報に限る.

[[domain/verifying-the-effective-model|verifying-the-effective-model]]: thread/start の応答は実在しないモデル名も echo するので受理の証明にしかならず、実際に何で走ったかは rollout の turn_context レコードで確かめる.

***

codex app-server と Claude Code の**両方の都合**が交差する場所の語彙を置く。API の権威は `codex app-server generate-json-schema`、外部依存の実測は canon: `facts/codex/claude-sandbox-integration` が正で、ここはこのリポジトリがそれをどう使っているかだけを書く。
