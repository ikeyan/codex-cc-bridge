---
name: security/capability-token
title: capability token の扱いと却下した代替案
desc: 常駐 server を token 認証で守る構成、token ファイルを消さず中身も読まない運用の理由、そして同等のアクセス制御をより多い部品で得るために却下した代替案.
tags: []
sources: []
created: 2026-09-06T07:10:31Z
updated: 2026-09-06T07:10:31Z
---

# capability token の扱いと却下した代替案

loopback で待ち受ける常駐プロセスは、放っておけば**同じマシンのどのプロセスからでも駆動できる**。
これを塞ぐのが capability token で、防御は 2 層になっている。

1. **server 側**: `--ws-auth capability-token --ws-token-file <f>` 付きで起動する。token を知らない
   ローカルプロセスは handshake で拒否される。`--help` の文言は non-loopback 用と読めるが、
   **loopback でも機能する**ことを実測済み (canon: `facts/codex/claude-sandbox-integration`)。
2. **driver 側**: token を必須にし (無ければ接続前に起動拒否)、endpoint が loopback でなければ
   **token を送る前に**拒否する。加えて接続後に[[security/containment-probe|封じ込めプローブ]]。

## token ファイルは消さず、中身も読まない

skill が「token ファイルはセッション中保持し、`cat` で中身をコンテキストに入れない」と
指定しているのは、扱うものを**パスだけ**に保つためである。0600 のファイルに置いておけば、
token 文字列は一度もデータとして持ち回られない。

## 却下した代替案

- **token ファイルの起動後削除** (秘密を server のメモリと Claude のコンテキストだけに置く):
  技術的には成立する (server は起動時に token をメモリ保持する) が堅牢化にならない。削除すると
  以後 Claude が token を毎ターン持ち回ることになり、(a) 会話経由で `~/.claude/projects/` の
  セッショントランスクリプトに永続化、(b) 再具現化のたびにコマンドライン (ps) へ露出、
  (c) コンテキスト圧縮で失えば誰も認証できない server がポートを占有するロックアウト、が起きる。
- **unix socket への移行**: Claude sandbox は AF_UNIX を bind/connect とも既定拒否で、設定
  (`allowUnixSockets` / `allowAllUnixSockets`) は **connect のみ**を開ける口。bind/listen を許す
  設定は存在しない (公式 docs + 実測)。
- **socket unlink + fd 保持 / endpoint を持たない構成**: unlink 方式は AF_UNIX bind 不可の時点で
  不成立 (TCP に unlink 相当は無い)。fd を後続 turn の driver に渡すには結局 IPC endpoint か
  「全 driver の親となる常駐プロセス」が要る。**これが得るアクセス制御は token 方式と同等**で、
  可動部品 (常駐親プロセス + fd 受け渡し) だけが増える。stdio 構成は endpoint を持たない唯一の
  完全解だが、常駐要件と CC のプロセスモデル (turn ごとに独立プロセス) に矛盾する。
- **slash command の `disable-model-invocation: true`**: 境界として機能していない。
  skill (`codex-bridge`) は model-invocable のままで起動レシピと driver の叩き方を全部含むので、
  モデルは command を経由せず素の Bash で同じ turn を回せる。実際の防御は
  [[security/containment-invariant|不変条件]]の側にあり、このフラグはそれと独立。
  残る効果は「近道を塞ぐ」だけなので、機能を保ったまま可動部品を 1 つ減らした。

## 限界

同一ユーザーで能動的に動く攻撃者は token ファイルも `~/.codex` の資格情報も読める。どの方式でも
防げない — これは OS のユーザー境界の問題であり、本設計のスコープ外である。
