---
name: lsmcp
description: Use the vendored lsmcp (TypeScript language server over MCP) for semantic code work in this repo — inferred types via hover, definitions, references, safe rename/delete, per-file diagnostics — instead of grep and text edits. Covers setup, tool naming, the workflow, and measured caveats.
---

# lsmcp — このリポジトリでの使い方

`vendor/lsmcp/` は mizchi/lsmcp の fork build (TS7 で動かなかったため。元コミットは
`vendor/lsmcp/SOURCE`、リリース後に消す: https://github.com/ikeyan/codex-cc-bridge/issues/7)。
`.mcp.json` が project scope で登録しているので、Claude Code 起動時に承認すると
`mcp__lsmcp__*` ツールが使える (`.mcp.json` はセッション開始時にしか読まれない。追加・変更後は
`claude --resume` で再起動)。設定は `.lsmcp/config.json` (preset `typescript`、対象は
`**/*.ts` と `**/*.mts`、`vendor/` と `node_modules/` は除外)。索引は `.lsmcp/cache` (gitignore 済)。

## 何に使うか

grep と Edit で済むこと (文字列検索、docs の編集) には使わない。**意味的な操作**に使う:

| したいこと | ツール | 備考 |
| --- | --- | --- |
| 推論された型を見る | `lsp_get_hover` (`textTarget` にシンボル名) | guard で組み立てた型 (`isObjectOf(...)` の結果) は hover でしか読めない |
| 定義に飛ぶ | `lsp_get_definitions` (`includeBody: true` で本体も) | `guard.mts` 側の定義も追える |
| 使用箇所を全部出す | `lsp_find_references` | rename / delete の前に必ず |
| シンボルを探す | `search_symbols` (部分一致) → `get_symbol_details` | details は hover + 定義 + 参照をまとめて返す |
| ファイル/ディレクトリの構造 | `get_symbols_overview`、`get_project_overview` | overview の初回は索引作成で 15 秒ほど |
| 名前の変更 | `lsp_rename_symbol` | テキスト置換でなくこれを使う。import/export も追従する |
| シンボルの削除 | `lsp_delete_symbol` | 参照ごと消える。先に `lsp_find_references` で影響を見る |
| ファイル単位の型エラー | `lsp_get_diagnostics` | workspace 全体の diagnostics は非対応 (下記) |
| quick fix の候補 | `lsp_get_code_actions` | organizeImports / removeUnusedImports / fixAll |

引数の共通事項: `root` はリポジトリの絶対パス、`relativePath` はそこからの相対パス。`line` には
行番号でなく**その行に含まれる文字列**を渡せる (行番号は編集でずれる)。

## ワークフロー

1. **把握**: `search_symbols` で当たりを付け、`get_symbol_details` で型・定義・参照を一度に見る。
   ファイル全体なら `get_symbols_overview`。
2. **読む**: `lsp_get_hover` で推論型を確認し、`lsp_get_definitions` で定義へ。
   境界の guard から導かれる型 (`Guarded<typeof isX>`) は hover が唯一の可視化手段。
3. **変える**: シンボルの改名・削除は `lsp_rename_symbol` / `lsp_delete_symbol`。
   その後 `deno fmt scripts tests` を掛けてから `npm test` (deno fmt / lint / tsc / テスト行列が門)。
4. **検査**: 変更したファイルごとに `lsp_get_diagnostics`。最終判定は `npm test`。

## 実測した注意点 (2026-09-14、fork build)

- `lsp_check_capabilities`: hover / definition / references / rename / code actions / formatting は
  対応、**workspace diagnostics は非対応**。全体の型検査は `npm test` (tsc + deno check) で行う。
- `lsp_get_diagnostics` は tsc の hint も返す。`process.exit()` の直後の `break` に
  「Unreachable code」の hint が出るが、これは deno lint (`no-fallthrough`) が要求している行なので
  消さない。
- `tests/*.mjs` は JS なので hover は効くが引数の型は `any` (`makeSession(port: any, ...)`)。
  テストの型を追いたいときは `.mts` 側 (`scripts/`) を見る。
- `get_project_overview` の統計は `vendor/` を含む (63 files / 9665 symbols のほとんどが vendor)。
  `.lsmcp/config.json` の `ignorePatterns` は索引の対象外指定で、overview の構造表示には効かない。
  Variables/Constants は設定で索引から外している。
- `line` に文字列を渡すとき、同じ文字列が複数行にあると最初の一致が使われる。一意な断片を渡す。

## 元の lsmcp のコマンド文書との対応

fork 元 (`~/hobby/lsmcp/.claude/commands/`) の `analyze-code.md` / `refactor.md` は adapter ごとの
ツール名 (`mcp__lsmcp-tsgo-dev__get_all_diagnostics` 等) や旧名 (`mcp__typescript__rename_symbol`) で
書かれている。このリポでは server 名が `lsmcp` 固定なので `mcp__lsmcp__lsp_*` に読み替える。
`get_all_diagnostics` 相当は無い (上記のとおり `npm test` が担う)。`move_file` / `move_directory` も
無いので、ファイル移動は `git mv` のあと `lsp_get_diagnostics` で import 切れを見る。
