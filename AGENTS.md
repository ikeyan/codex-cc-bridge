# このリポジトリでの作業規則

唯一のソースは `docs/spec.md`。実装を変えたら「実装状況 / 検証」節を更新する。

- 開発目標は**機能を保って複雑さを減らす**こと。代替案の採否は「同等機能を何個の可動部品で
  得るか」で比較する (「broker っぽいから却下」のような構造的理由付けはしない)。
- 外部依存 (codex CLI / app-server / Claude Code sandbox) の挙動に依存する記述は、記憶で断定せず
  一次情報か実測で裏を取る。確定済みの事実は `ikeyan/canon` の `facts/codex/` を引く/追記する。
- スクリプトは node 組み込みを優先 (引数解析は `node:util` の `parseArgs`)、型付き .mts
  (erasable types のみ、Node >= 23.6 の type stripping で直接実行) で書く。依存ゼロを維持。
- 検証は 1 コマンド: `npm test` (= `node scripts/check.mts`)。driver を node/deno/bun で回す
  テスト行列 + `deno check` + `tsc` (strict, `erasableSyntaxOnly`)。tsc には devDependencies が
  必要 (`npm install`。lockfile は package-lock.json に一本化)。個別実行:
  `node --test tests/codex-turn.test.mjs` / `deno check scripts/*.mts` / `node_modules/.bin/tsc -p .`。
  注意: Claude sandbox 内の `npm install` は既定キャッシュ (`~/.npm/_cacache`) 書込が EPERM で失敗し、
  npm がこれを「root 所有キャッシュ」と誤診することがある (実際は root 所有ではない)。
  sandbox 内では `npm install --cache "$TMPDIR/npm-cache"` を使う。
- 型は runtime 非依存に書く — `NodeJS.Timeout` でなく `ReturnType<typeof setTimeout>`。
  tsconfig.json は tsc 専用、deno.json は deno check 専用 (lib が非互換なため分離。両ファイルの
  コメント参照)。
- 実行済みの設計メモは git 履歴に委ねて整理する。
- コミット末尾に Co-Authored-By と Claude-Session の trailer を付ける
  (セッション URL はセッションごとに違うので使い回さない)。
