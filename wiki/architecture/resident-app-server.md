---
name: architecture/resident-app-server
title: 常駐 app-server と接続方式
desc: 1 セッション 1 app-server を Claude sandbox 内に常駐させ loopback WebSocket で駆動する構成の理由 — unix socket が bind できないこと、起動場所が封じ込めを決めること、ポートがセッションの識別子になること.
tags: []
sources: []
created: 2026-09-06T07:10:31Z
updated: 2026-09-06T07:10:31Z
---

# 常駐 app-server と接続方式

1 セッションにつき 1 個の `codex app-server` を **Claude sandbox 内**で
`run_in_background` の Bash として立て、その 1 プロセスに対して turn ごとに短命な driver が
接続する。起動手順は [`skills/codex-bridge/SKILL.md`](../../skills/codex-bridge/SKILL.md) の
起動レシピが正。

## なぜ常駐させるか

まず前提として、**app-server を使うこと自体が要件**である。`codex exec` の単発呼び出しで済ませる
薄型化は (それ自体は成立するが) 非目標として最初に外してある。

その上で常駐が返すものは、ターンごとのコールドスタートを避けられること、thread が永続して
`resume`/`fork` がネイティブに使えること、1 プロセス上で複数 thread を並行させられることの 3 つ。

## なぜ loopback WebSocket なのか

**Claude sandbox 内では AF_UNIX の bind ができない** (sandbox の設定にも bind/listen を許す口は無く、
`allowUnixSockets` は connect 側だけを開ける)。このため unix socket 前提の
`codex app-server daemon` と `proxy` はどちらも成立せず、既製の transport に乗るという選択肢が
消えた。loopback TCP は listen も connect も通るので、`--listen ws://127.0.0.1:PORT` が
唯一残った経路であり、[[architecture/delegation-boundary|自前 ws クライアント]]を書く理由でもある。
実測の出典は canon: `facts/codex/claude-sandbox-integration`。

## 起動場所が唯一効く瞬間

codex がモデルの指示で実行するコマンドは、**app-server プロセスが起動時に継承した sandbox**の
中で動く。つまり封じ込めが決まるのは turn を投げるときではなく **app-server を起動する瞬間**
だけである。あとから driver 側でどう指定しても、sandbox 外で起動された server は sandbox 外の
ままである。これが [[security/containment-probe|封じ込めプローブ]]が「driver 側の指定」ではなく
「server の実際の書込可否」を測る理由。

## ポートは固定しない

`--listen ws://127.0.0.1:0` で立てて OS に空きポートを選ばせ、server が起動バナーに出す
実際のポート (`listening on: ws://127.0.0.1:NNNNN`) を読んで使う。**driver に既定ポートは無く、
`--port` も `CODEX_BRIDGE_PORT` も `--url` も無ければ起動を拒否する。**

固定ポートをやめた理由は、**1 台のマシンで複数の CC セッションが同時に動く**ため。
セッションごとに server が要るのに番号が固定だと、後から始めたセッションが必ず衝突する
(実測: 既定 41100 は別セッションの生きた server が持っていた)。token が違うので handshake で
弾かれ実害は出ないが、毎回ポートを手で選び直すことになる。

既定ポートを残したまま port 0 を使うと、`--port` を忘れた呼び出しが黙って
「別セッションの server が居るかもしれない番号」へ向かう。だから既定そのものを消してある。

port 0 は codex 側がネイティブに受けるので、空きポートを先に別プロセスで bind して確保する
(そして閉じてから渡す) 必要はない。確保と bind の間の取り合いも起きない。
