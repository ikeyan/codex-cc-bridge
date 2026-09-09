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
3. `turnId` (`turn/completed` では `params.turn.id`) が `activeTurnId` と違うものを捨てる。

3 段目が無いと、**他人の turn の完了で自分が完了扱いになる**。これは黙って誤った結果を返す
バグになるので、テストで pin してある (`tests/codex-turn.test.mjs` の
"events from unrelated threads and turns are ignored")。

## turn id 確定前に届くイベント

`turn/start` の応答と、その turn の `item/completed` が**同じ TCP チャンクで届くことがある**。
このとき `await` はまだ戻っておらず `activeTurnId` は `null` なので、素直に書くと 3 段目の
フィルタが自分のイベントを捨ててしまう。そこで `activeTurnId === null` の間の thread スコープ
イベントを `earlyEvents` に溜め、turn id が決まった時点で `turnIdentified()` が**同じハンドラに
replay** する。バッファは 1 箇所・replay 先は 1 経路に保ってあり、フィルタのロジックは二重化しない。

## タイムアウトの非対称

制御系 RPC (`initialize` / `thread/start` / `thread/resume` / `turn/start` / `review/start`) は
`controlRequest` が `CONTROL_TIMEOUT_MS` (既定 30 秒) で、[[security/containment-probe|プローブ]]の
`command/exec` はさらに短い `PROBE_TIMEOUT_MS` (15 秒) で切る。一方
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
読めないか未ログイン。server は再試行を止めない) は同じ `abortTurn` に入り、理由を先に出力してから
`turn/interrupt` を送って終了する。理由を先に出すのは、interrupt された turn の `turn/completed` が
interrupt 応答より先に届いて本経路が結果 JSON を出し終えても、理由が消えないため。
サーバー側の turn を止めないと、driver が死んだあともトークンを消費し続けファイルを書き換え得るため。
`turn/start` の応答待ち中に signal が来た場合は turn id が無いので、最大 3 秒だけ id の到着を
待ってから interrupt する (review では子 turn の id も同じ猶予で待つ)。abort 進行中や完了後の
再トリガーは無視する — 完了後に `process.exit` すると stdout に流しかけの結果 JSON が切れる。
中断ロジックは「状態 (開始前 / 応答待ち / turn 中 / 完了後 / review で子 id 未知) × トリガー
(SIGTERM / 401 / 再トリガー / ws 切断)」の組合せで、`tests/codex-turn.test.mjs` の SIGTERM・401 の
テスト群が各セルを pin している。1 セルだけ直すと隣が開くので、直すときは表を先に埋める。

review では本体が subagent の子 turn で走り、**親 turn だけを interrupt しても子は止まらない**
(実測: 90 秒走り続けた)。子 turn の id は自分の thread に別 turnId で届く `turn/started` に
乗ってくるので、driver はそれを覚えておき、signal 時は子 → 親の順に `turn/interrupt` を送る
(子を止めると親も同時に abort される。canon: `facts/codex/review-start-inline-same-thread`)。
`turn/started` を見るのはこの目的だけで、完了判定には使わない。この通知も `review/start` の応答と
同じ TCP チャンクで届きうるので、上の `earlyEvents` バッファと同じ経路に乗せて replay する。
