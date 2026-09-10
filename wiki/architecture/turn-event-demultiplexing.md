---
name: architecture/turn-event-demultiplexing
title: 自 turn の同定とイベントの多重化
desc: 共有 app-server から流れる全通知の中から自分の turn だけを拾う 3 段フィルタと、turn id 確定前のイベントを取りこぼさないバッファ、制御 RPC だけにタイムアウトを置く非対称の理由.
tags: []
sources: []
created: 2026-09-06T07:10:31Z
updated: 2026-09-06T07:10:31Z
---

# 自 turn の同定とイベントの多重化

1 個の app-server を複数の driver が同時に叩く ([[architecture/delegation-boundary|fan-out は CC 側に委譲]]
しているので、これは例外ではなく通常運転)。通知はコネクションごとに絞られて届くわけではないため、
**driver は自分の turn のイベントだけを選り分ける責任を持つ**。
実装は [`scripts/codex-turn.mts`](../../scripts/codex-turn.mts) の `ws.onmessage` と
`handleTurnEvent`。

## 3 段のフィルタ

1. 自分の `threadId` が確定するまでは thread/turn スコープの通知を**すべて捨てる**。
2. `params.threadId` が自分のものと違う通知を捨てる (サブエージェントが張った子 thread、
   同じ server 上の無関係な thread)。
3. `turnId` (`turn/completed` では `params.turn.id`) が自 turn (`turn`) と違うものを捨てる。

3 段目が無いと、**他人の turn の完了で自分が完了扱いになる**。これは黙って誤った結果を返す
バグになるので、テストで pin してある (`tests/codex-turn.test.mjs` の
"events from unrelated threads and turns are ignored")。

## turn id 確定前に届くイベント

`turn/start` の応答と、その turn の `item/completed` が**同じ TCP チャンクで届くことがある**。
このとき `await` はまだ戻っておらず自 turn (`turn`) は未定なので、素直に書くと 3 段目の
フィルタが自分のイベントを捨ててしまう。そこで `turn` が決まるまでの間の thread スコープ
イベントを `earlyEvents` に溜め、turn id が決まった時点で `turnIdentified()` が**同じハンドラに
replay** する。バッファは 1 箇所・replay 先は 1 経路に保ってあり、フィルタのロジックは二重化しない。

## タイムアウトの非対称

制御系 RPC は `CONTROL_TIMEOUT_MS` (既定 30 秒) で切るが、中断との関係で 2 種類に分かれる。
preflight (`initialize` / `thread/start` / `thread/resume`、[[security/containment-probe|プローブ]]の
`command/exec` はさらに短い `PROBE_TIMEOUT_MS` = 15 秒) は `controlRequest` で、`outcome` が決まった
時点で打ち切られる (中断後に thread を作る無駄をしない)。start 要求 (`turn/start` / `review/start`)
は `boundedRequest` で、送った後は打ち切らない — server が受理していれば interrupt 対象であり、
その応答か timeout だけがそれを教えるから (中断側は下の「短い締切」で待ち過ぎを防ぐ)。一方
**turn の完了待ちだけは無制限**にしてある。レビュー turn は 10 分を超えるのが普通で、
ここに締切を置くと正常な長考をハングと誤判定するため。「応答が来ないこと」と「考え続けていること」
を混同しない、という切り分けがこの非対称の意味。

## 最終メッセージの決め方

`final_answer` phase の agentMessage を最優先、無ければ最後に届いた agentMessage、
それも無ければ `turn/completed` が載せてきた `turn.items` から復元する。
モデルが phase を付けない場合に空返しにならないための段階的縮退で、
"latest agent message wins when no final_answer phase is present" が pin している。

## 中断

SIGTERM / SIGINT (= CC の `TaskStop`) と、待っても無駄な条件 (OpenAI からの 401 = 認証情報が
読めないか未ログイン。server は再試行を止めない) は、どちらも `outcome` を「中断」に決めるだけ。
`outcome` を待つ 1 箇所の終了処理が理由を先に出力し、`turn/interrupt` を送ってから終了する
(サーバー側の turn を止めないと、driver が死んだあともトークンを消費し続けファイルを書き換え得る)。
完了後のトリガーは `outcome` が既に決まっているので何もしない — 完了後に `process.exit` すると
stdout に流しかけの結果 JSON が切れる。
状態 × トリガーの組合せを bool フラグと if で書くと、セルを 1 つ直すたびに隣が開く。
そこで driver は**一度だけ決まる値** = promise だけで状態を持つ (`resolve` は 2 回目以降が no-op
なので、再トリガー・完了後のシグナル・interrupt 応答と競合する `turn/completed` に個別の分岐が
要らない)。同期的に読む必要がある値 (turn id によるフィルタ) だけ `Once<T>` (promise + 読み出し) にする。

### イベント列の文法と、各値が決まる時点

driver が自 thread について受け取る列を記号にすると (`S` = start 応答 = 自 turn id、`C` = 子の
`turn/started`、`I` = `item/completed`、`E` = `error`、`D` = `turn/completed`):

- 通常 turn: `S (I | E)* D`
- review: `S C (I | E)* D` — ただし `C` は `S` と同じ TCP チャンクで届きうるので、線上では
  `C S ...` の順に見えることがある (`earlyEvents` に溜めて `S` の後に replay する理由)。
  実測では `C` は `S` の直後に来る。

これに対して待つ値と、その値が「もう来ない」と確定する条件:

| 値 | 決まる時点 | 来ないと確定する条件 |
| --- | --- | --- |
| `turn` (自 turn と thread) | `S` | `run()` が終わったのに `turn` が空。start 要求を**送る前**の await (接続・プローブ・thread) は `outcome` が決まった時点で打ち切られるので、preflight 中の中断は即座に確定し、thread や turn を作ってから interrupt する無駄が無い。start 要求を**送った後**は server が受理しているかもしれないので、その応答か timeout まで待ってから確定する |
| `child` (子 turn) | `C` | 自 turn が終わった (`turnDone`)。それ以外は文法上「`S` の直後」なので短い上限で打ち切る (唯一の時間仮定) |
| `turnDone` | `D` | `outcome` が中断/失敗に決まった (以後は待たない) |
| `outcome` | `D` / SIGTERM / 401 / ws 切断 / 不正 frame / `reviewThreadId` 不一致 / `run()` の例外 | 必ず決まる |

`outcome` を待つ 1 箇所の `switch` が、中断なら `turn` を (`run()` の終了 = `runSettled` で確定
するまで) 待ち、review では `child` を上の条件で待ってから、子 → 親の順に `turn/interrupt` を送る。
start 要求が応答待ちのまま中断された場合だけは、その応答が持つ 30 秒の締切を待たず短い締切で
打ち切り「turn が始まっているかもしれない」と報告する (TaskStop が固まって見えないため)。
interrupt の応答待ち・handshake 待ち・この締切は、超過を例外 (`TimeoutError` / `AbortError`)
として扱い、理由を出して終了する。待ちは node 組み込み (`events.once` + `AbortSignal.timeout`、`timers/promises`、
`Promise.withResolvers`) で書き、自前のタイマー管理は持たない。
`tests/codex-turn.test.mjs` の SIGTERM・401 のテスト群が各セルを pin している。

review では本体が subagent の子 turn で走り、**親 turn だけを interrupt しても子は止まらない**
(実測: 90 秒走り続けた)。子 turn の id は自分の thread に別 turnId で届く `turn/started` に
乗ってくるので、driver はそれを覚えておき、signal 時は子 → 親の順に `turn/interrupt` を送る
(子を止めると親も同時に abort される。canon: `facts/codex/review-start-inline-same-thread`)。
`turn/started` を見るのはこの目的だけで、完了判定には使わない。この通知も `review/start` の応答と
同じ TCP チャンクで届きうるので、上の `earlyEvents` バッファと同じ経路に乗せて replay する。
