---
name: domain/turn-input-references
title: turn 入力は参照で渡す
desc: Codex は自分でファイルを読みコマンドを実行できるので turn の入力はパスと git ref と意図だけを渡し、中身を貼るのは Codex から到達できない情報に限る.
tags: []
sources: []
created: 2026-09-06T07:10:31Z
updated: 2026-09-06T07:10:31Z
---

# turn 入力は参照で渡す

turn の入力は「**何をしてほしいかの意図と制約 + 対象への参照**」である。ファイルの中身を
プロンプトに貼らない。

Codex は [[security/why-danger-full-access|danger-full-access]] で動いており、**自分でファイルを
読み、コマンドを実行できる**。したがって貼る必要が無い。

## 何を渡すか

| 渡すもの | 例 |
| --- | --- |
| 対象への参照 | リポジトリ相対のパス、ディレクトリ、glob |
| git の状態への参照 | ブランチ名、sha、 のような読ませたいコマンド |
| 意図と制約 | 何を判断してほしいか、触ってよい範囲、出力の形 |

パスがリポジトリ相対で通るのは、driver を起動したディレクトリ (既定。`--cwd` で上書き可) を thread の cwd に
置いているため。

## 中身を貼ってよい唯一の場合

**Codex から到達できない情報**だけ。Claude 側の文脈でしか分からない判断、別セッションや別マシンの
出力、web で読んだ内容など、ファイルとして存在しないものは本文に書くしかない。

逆に、リポジトリにあるものを貼るのは 3 つの意味で悪い。

1. **安全にならない**。貼らなくても Codex は読む。プロンプトの中身は egress の上界と無関係で、
   「貼らなかったから送られない」は成り立たない ([[security/egress-is-not-contained]])。
2. **実物とずれる**。抜粋は切り取り位置を誤れば嘘になり、貼った後に変更されれば古くなる。
   Codex が実際に読むのは実物の方なので、食い違いは黙って起きる。
3. **二重に食う**。同じ内容が Claude 側の文脈と OpenAI 側の両方でトークンを消費する。

レビューでは何も貼らない。`review/start` が target から diff を自分で集める
([[domain/app-server-protocol-surface]])。

## 専用の transfer を持たない理由

置き換え元には Claude の JSONL トランスクリプトを parse して codex thread に変換する機構があった。
これは廃止した。制御側の Claude は文脈を持っているので、機械変換した生ダンプより
**意図を書いた handoff** の方が良い入力になる。参照渡しはその延長で、
「Claude が書くのは意図、実物は Codex が見に行く」という役割分担になっている。

結果として入力の型は「テキスト 1 本」だけになり、driver 側に「束」に対応するデータ構造は無い。
探しても見つからないのが正しい。

## codex に「どこに居るか」を教えるのも参照で

codex は自分が Claude sandbox の中にいることを知らない。だから `/tmp` への書込が弾かれると
**それをレビュー対象コードの不具合として扱い**、手数を使う (実測: レビュー中に
`npm test > /tmp/... ` が失敗し、原因を探ってから redirect 無しで再実行していた)。

これを防ぐため、driver は `thread/start` の `developerInstructions` に短い環境説明を自動で載せる。
turn ごとの入力ではなく **thread の設定**なので、prompt の口が無い
[[domain/app-server-protocol-surface|review turn にも効く]]。載せているのは:

- ここは Claude Code CLI の sandbox で、codex が変えることはできないという事実
- 作業ディレクトリと `$TMPDIR` は書けるが `$HOME` と `/tmp` 直下は書けないこと
- そういう失敗はコードの不具合ではないので、`$TMPDIR` を使って進み、指摘として報告しないこと
- **`cc-cli-sandbox` skill のファイルパス** — 詳細はそこを読む

最後の 1 点がこのページの原則そのもの。制約の一覧を driver の文字列に写して二重管理するのではなく、
**正本のファイルパスを渡して codex に読ませる**。パスは実行時に `~/.claude/plugins` 以下から
探す (`CODEX_BRIDGE_SANDBOX_SKILL` で上書き可)。見つからなければその行だけ落ちる。

## 必ず stdin から渡す

skill と commands が「Write ツールで一時ファイルに書き、`<` でリダイレクト」を指定しているのは
好みではなく、**内容をシェルに通さないため**である。意図の文章もパスも `$(...)`・バッククォート・
引用符を含みうるし (`echo` はそれを展開する)、heredoc は本文が終端行を含むと壊れる。
`review/start` の target JSON を `--review-target -` で stdin から読むのも同じ理由。
