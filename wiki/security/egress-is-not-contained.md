---
name: security/egress-is-not-contained
title: egress は封じ込められない — 上界は sandbox の read スコープ
desc: 送られうるものの上界は Claude sandbox が Codex に読ませる範囲であってプロンプトの中身ではない。だから「何が送られるか」の範囲提示は下界を上界に見せる誤りになる.
tags: []
sources: []
created: 2026-09-06T07:10:31Z
updated: 2026-09-06T07:10:31Z
---

# egress は封じ込められない — 上界は sandbox の read スコープ

[[security/containment-invariant|封じ込め不変条件]]が保証するのは**副作用**の範囲であって、
情報の流出ではない。**サンドボックスは egress を止めない**し、止めたら Codex は動かない
(`api.openai.com` への到達は動作条件そのもの)。

## 上界はプロンプトではなく read スコープ

Codex は [[security/why-danger-full-access|danger-full-access]] で動くので、自分でファイルを読み
コマンドを実行できる。つまり**送られうるものの上界は「Claude sandbox が Codex に読ませるもの」**
であって、こちらがプロンプトに何を入れたかとは無関係である。

Claude Code sandbox の**既定の read はコンピュータ全体**で (一部の deny ディレクトリを除く)、
`~/.ssh/` や `~/.codex/auth.json` のような資格情報も含む。read を絞る設定を入れていない環境では、
これがそのまま上界になる。出典と実測は canon: `facts/claude-code/sandbox-read-defaults-to-whole-computer`。

## だから「範囲提示」はしない

初期の設計には「turn を投げる前に、何が OpenAI に送られるかの範囲をユーザーに提示する」という
手続きがあった。**これは誤りなので廃止した。**

提示できるのは「確実に送られるもの」= **下界**である。一方、安全かどうかの判断に要るのは
「送られうるものの上界」で、両者は Codex の自律的な読み取りのぶんだけ食い違う。下界を「範囲」と
名乗って見せると、**提示に無いものは送られない**という、成り立たない安心を与えることになる。
リストの外にあるファイルほど機微である可能性が高いのだから、誤りの向きも悪い。

同じ理由で、[[domain/turn-input-references|プロンプトに中身を貼らないこと]]も egress の対策には
ならない。貼らなくても Codex は読む。

## 実際に効くレバー

上界は sandbox 側でしか動かせない。効くのは次のもので、いずれも
`~/.claude/settings.json` (turn ごとではなく環境の設定) である。

- `permissions.blockReadsOutsideWorkingDirectories` — 作業ディレクトリの外 (home・マウント) の
  read をまとめて塞ぐ。パス列挙より先に検討する。
- `sandbox.filesystem.denyRead` / `allowRead` — 領域単位で塞ぎ、必要な部分だけ開け直す。
- `sandbox.credentials` — 資格情報ファイルを read 不可にする、または値をマスクする。

推奨は `permissions.blockReadsOutsideWorkingDirectories: true` + `sandbox.filesystem.allowRead` に
`~/.codex` と toolchain (node / codex の実体とバージョン解決ファイル) を列挙する形。実測で、
`blockReads` は home 配下の実行ファイルと `allowWrite` で許した `~/.codex` の書込まで塞ぐので、
`allowRead` で開け直さないと codex も node も起動しない。これで上界は「作業ディレクトリ +
`~/.codex` + toolchain」まで縮む。`~/.codex/auth.json` だけは Codex 自身が読めなければならない
(deny すると turn が 401 の無限再試行になる) ので、Codex が自分の OpenAI トークンを読める点は
どの設定でも残る。具体的な設定と症状は skill の「前提」、実測は canon
`facts/claude-code/sandbox-read-scope-settings-measured`。

## 結局ユーザーが同意しているもの

「この turn でこれらのファイルが送られること」ではなく、「**この作業ツリーで Codex を走らせること**」
である。判断の単位は turn ではなく環境なので、機微なものがあるなら、絞るべきは
プロンプトではなく sandbox の read スコープか、そもそも Codex を起動するかどうかになる。
