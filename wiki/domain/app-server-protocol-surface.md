---
name: domain/app-server-protocol-surface
title: 使っている app-server API の面
desc: driver が触る v2 JSON-RPC の部分集合と、その中で誤りやすい点 — sandbox 指定が thread と turn の 2 階層にあること、command/exec がモデルを介さないこと、review/start に prompt の口が無いこと.
tags: []
sources: []
created: 2026-09-06T07:10:31Z
updated: 2026-09-06T07:10:31Z
---

# 使っている app-server API の面

権威あるスキーマは `codex app-server generate-json-schema` の出力。
[`scripts/codex-turn.mts`](../../scripts/codex-turn.mts) 冒頭の `interface` 群はその**部分集合の
手写し**であって、仕様ではない。食い違ったらスキーマが正。

使っているのは、`initialize` / `initialized`、`command/exec`、`thread/start` / `thread/resume`、
`turn/start`、`review/start`、`turn/interrupt`、通知として `item/completed` / `turn/completed` /
`thread/tokenUsage/updated` / `error`、それに server→client 要求 (approval 系) だけ。

## sandbox 指定は 2 階層ある (最頻の踏み抜きどころ)

- thread レベル: `thread/start` / `thread/resume` の `sandbox` — 値は文字列 `"danger-full-access"`。
- turn レベル: `turn/start` の `sandboxPolicy` — 値はオブジェクト `{type:"dangerFullAccess"}`。

**turn レベルが thread レベルを上書きできる。**したがって thread だけ固定しても fail-closed に
ならず、driver は両方を定数 (`PINNED_THREAD_SANDBOX` / `PINNED_TURN_SANDBOX_POLICY`) で固定している。
綴りが階層ごとに違う (kebab-case とオブジェクト) のも取り違えやすい。
なぜ `danger-full-access` なのかは [[security/why-danger-full-access]]。

## `command/exec` はモデルを介さない

thread も turn も作らず、モデルにも渡らず、トークンも消費せずに、**server 自身の実行コンテキストで**
コマンドを走らせる RPC。[[security/containment-probe|封じ込めプローブ]]はこの性質の上に立っている。

ただし `sandboxPolicy` を省くと**ユーザーの codex 設定にある sandbox が適用される**。Claude sandbox
内ではそれが入れ子 Seatbelt になって exit 71 で死ぬため、プローブ自身も turn と同じ policy を
明示的に渡す必要がある。

## `review/start` には prompt の口が無い

パラメータは `{threadId, target, delivery}` だけ (target は `uncommittedChanges` / `baseBranch` /
`commit` / `custom`)。driver は `delivery: "inline"` 固定で、このときレビューは**呼び出した thread
の上で走り**、応答の `reviewThreadId` はその threadId と同一、通知もすべてその threadId で届く
(`detached` は `thread/start` で作った thread には拒否される。canon:
`facts/codex/review-start-inline-same-thread`)。driver は `reviewThreadId` が自分の thread と
違えば fail-closed で落とす — 別 thread の通知は
[[architecture/turn-event-demultiplexing|thread フィルタ]]で捨てられるので、追い掛けても永久に待つだけになる。
内部ではレビュー本体は subagent の子 thread で走り、親 threadId で別 turnId の `turn/started` が 1 回届く。
`turn/completed` を turnId で絞る 2 段目のフィルタが効くので driver には影響しないが、実効設定の記録は
子 rollout にある ([[domain/verifying-the-effective-model]])。

**どの調整項目がレビューに効くかは、それが thread の設定か turn の設定かで決まる。**

| 項目 | どこにあるか | レビューで |
| --- | --- | --- |
| `model` | `thread/start` にも `turn/start` にもある | **効く** — driver は thread に載せる |
| `effort` | `turn/start` だけ | 効かない — driver が拒否する |
| `outputSchema` / prompt | `turn/start` だけ | 効かない — driver が拒否する |

driver が「効かないもの」を黙って無視せず**渡された時点で拒否**するのは、指定したつもりの
スキーマや effort が効いていないことに気付けないため。

なお `thread/start` の `model` は**検証されない**: 実在しない名前もそのまま応答に echo される。
応答の `model` が証明するのは「受け付けられた」ことまでで、実在するかどうかは turn を回すまで分からない
([[domain/verifying-the-effective-model]])。

## server→client 要求は fail-closed で拒否する

`approvalPolicy: "never"` を固定しているので approval 要求は本来来ない。それでも来た場合に備え、
`DENIALS` がメソッドごとに**スキーマとして妥当な拒否**を返す (`item/*/requestApproval` は
`{decision:"decline"}`、旧 `execCommandApproval`/`applyPatchApproval` は `{decision:"abort"}`)。
未知のメソッドには JSON-RPC error を返す。拒否の形をメソッドごとに分けているのは、
形が違うと server 側が要求を再送したりハングしたりし得るため。

## 通知の絞り込み

`initialize` の `optOutNotificationMethods` で delta 系 (agentMessage・reasoning・command output の
逐次更新) を切っている。driver が要るのは 1 turn の結果と粗い進捗だけで、delta は stderr を
埋め尽くすだけだから。
