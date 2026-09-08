# このリポジトリでの作業規則

## 情報の置き場所

| 置き場所 | 内容 | 扱い |
| --- | --- | --- |
| `wiki/` (`wiki/_index.md` から) | 設計・不変条件の唯一のソース | 実装を変えたら対応ページを更新する |
| `docs/` | 未実装 TODO 専用 | 実装したらその項目を消す |
| `ikeyan/canon` の `facts/codex/` | 外部依存の実測事実 | 記述が外部の挙動に依存するときは引く/追記する |
| `REVIEW.md` | `ikeyan/agent-files` のコピー | 直接編集せず上流を直す (frontmatter の `source:`) |

- 外部依存 (codex CLI / app-server / Claude Code sandbox) の挙動は、記憶で断定せず一次情報か
  実測で裏を取る。
- wiki にはコードを読めば分かることを書かない。外部依存の実測は wiki でなく canon に置く。
- 実行済みの設計メモは git 履歴に委ねて整理する。

## 設計の判断基準

開発目標は**機能と信頼性を保って複雑さを減らす**こと。代替案の採否は「同等の機能と信頼性を
何個の可動部品で得るか」で比較する (「broker っぽいから却下」のような構造的理由付けはしない)。

可動部品は数だけでなく壊れやすさで重み付ける。テストで固定された決定的な手続きは軽い部品、
LLM が毎回読んで実行する散文の手順は実行のたびに誤りうる重い部品。だから決定的な手続きは
script に出し、判断だけを skill に残す (`wiki/architecture/delegation-boundary.md`)。
コードを散文に置き換えて部品数を減らすのは、この基準では改善にならない。

## コード

- スクリプトは型付き .mts (erasable types のみ、Node >= 23.6 の type stripping で直接実行) で
  書き、node 組み込みを優先する (引数解析は `node:util` の `parseArgs`)。依存ゼロを維持する。
- driver は node/deno/bun で動かすので、型は runtime 非依存に書く —
  `NodeJS.Timeout` でなく `ReturnType<typeof setTimeout>`。
- tsconfig.json は tsc 専用、deno.jsonc は deno の check/fmt/lint 用 (lib が非互換なため分離。
  両ファイルのコメント参照)。

## 依存

- 追加・更新は `sfw npm install ...` (Socket のラッパー) 経由で行う。
- `.npmrc` が `min-release-age` (公開 3 日未満を掴まない) と `strict-allow-scripts`
  (package.json の `allowScripts` に無い依存の install script はエラー) を効かせている。
  現在 install script を持つ依存はゼロなので `allowScripts` は空のまま維持する。
- Claude sandbox 内の `npm install` は既定キャッシュ (`~/.npm/_cacache`) 書込が EPERM で失敗し、
  npm がこれを「root 所有キャッシュ」と誤診することがある (実際は root 所有ではない)。
  sandbox 内では `npm install --cache "$TMPDIR/npm-cache"` を使う。

## 検証

1 コマンド: `npm test` (= `node scripts/check.mts`)。内容は driver を node/deno/bun で回す
テスト行列 + `deno check` + `tsc` (strict, `erasableSyntaxOnly`) + `deno fmt --check` +
`deno lint` + `wiki update --check`/`wiki lint` + REVIEW.md の上流同期チェック。

- tsc には devDependencies が必要 (`npm install`。lockfile は package-lock.json)。
- wiki 系には uv が必要 (plasma-wiki は pyproject.toml + uv.lock で固定)。
- 個別実行: `node --test tests/codex-turn.test.mjs` / `deno check scripts/*.mts` /
  `node_modules/.bin/tsc -p .`。

### wiki の運用

`wiki/` は plasma-wiki 管理。index と相互リンクは `wiki update` が生成するので手で書かない。
ページ追加は `wiki new`、検査は `wiki lint` (どちらも `npm test` に入っている)。desc は句点でなく
`.` で終える (lint 規約)。

## ワークフロー

1. 変更する前に、対応する wiki ページと canon を読む。
2. テストを先に書いてから実装する (不変条件は `tests/codex-turn.test.mjs` で pin する)。
3. `npm test` を通す。
4. **確認を待たずに自分でコミットする。** 1 コミット = 1 論理変更。本文には何をなぜ変えたかを
   書き、実測に基づく判断はその実測も書く。
5. canon に追記した場合は、canon は別リポジトリなのでそちらでも同様にコミットする。
6. push はユーザーの指示があるまでしない。
