---
name: domain/verifying-the-effective-model
title: どのモデルで走ったかを自称に頼らず確かめる
desc: thread/start の応答は実在しないモデル名も echo するので受理の証明にしかならず、実際に何で走ったかは rollout の turn_context レコードで確かめる.
tags: []
sources: []
created: 2026-09-06T07:10:31Z
updated: 2026-09-06T07:10:31Z
---

# どのモデルで走ったかを自称に頼らず確かめる

`--model` を渡したとき「本当にそのモデルで走ったのか」を確かめる必要がある。証拠には強さの
違いがある。

## 使ってはいけない: モデルの自称

turn の中でモデル自身に名前を訊けば答えは返るが、モデルは自分の識別子を確度高く知らない。
**自称は証拠にならない。**

## 弱い証拠: `thread/start` の応答

`ThreadStartResponse` は `model` と `reasoningEffort` を返す。これはサーバーが解決した値なので
自称ではない。driver は進捗ストリームの `{"event":"thread", ...}` にこれを出している。

ただし**サーバーは名前を検証しない**。実在しないモデル名を渡しても、そのまま echo して
thread は作られる (実測: `no-such-model-xyz` がそのまま返る)。したがってこの応答が証明するのは
「パラメータが受理された」ことまでで、そのモデルが**存在すること**も、turn がそれで**走ること**も
示さない。

## 強い証拠: rollout の `turn_context`

codex は thread ごとの記録を `~/.codex/sessions/<年>/<月>/<日>/rollout-*.jsonl` に書く。その中の
`turn_context` レコードが、**turn 単位で実際に使われた設定**を持つ:

```json
{"turn_id": "...", "model": "gpt-5.4-mini", "effort": "low",
 "sandbox_policy": {"type": "danger-full-access"}, "approval_policy": "never", "cwd": "..."}
```

判定手順は 2 つ揃ってはじめて成立する。

1. turn が `completed` で終わっていること — 実在しないモデルなら API 呼び出しの側で落ちる。
2. その turn の `turn_context.model` が指定どおりであること。

取り出しは `scripts/codex-bridge.mts turn-context <threadId> [<turnId>]` がやる。rollout の
ファイル名に入る UUID は threadId と一致するとは限らない (canon) ので、先頭レコード
`session_meta.payload.id` で構造的に照合し、複数一致は推測せずエラーにする。driver は結果 JSON に
`turnId` を載せるので、resume で turn が複数ある thread でもその turn の記録だけを引ける。

## ついでに得られるもの

同じ `turn_context` に `sandbox_policy` と `approval_policy` も記録される。つまりこの記録は
[[security/containment-invariant|封じ込め不変条件]]の**事後確認**にも使える —
driver が送ったつもりの `danger-full-access` と `never` が、実際にその turn に適用されたことを
サーバー側の記録で確認できる。
