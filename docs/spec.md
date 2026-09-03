# codex-cc-bridge 設計仕様

> 状態: 実装中 (spike 完了・初版実装あり)。この文書が唯一のソース。「実装状況」節を参照。

## 目的

OpenAI Codex を Claude Code (CC) から使うための、**薄い**プラグイン/ツール群を設計する。既存の
`openai/codex-plugin-cc` が自前で持つランタイム・ジョブ・状態・転送の各層を、いまの Claude Code が
ネイティブに提供する機能 (Background Task・完了通知・SendMessage 再開・Monitor・TaskStop) と
`codex exec`/`codex app-server` のネイティブ機能に寄せて置き換え、実装量を大幅に減らす。

同時に、Codex の実行権限を **Claude Code のサンドボックスの部分集合 (⊆ Claude sandbox)** に閉じ込める
ことを correctness 要件とする。

## 確定している前提 (実測済み)

出典: `ikeyan/canon` の `facts/codex/claude-sandbox-integration.md` (2026-08-24, codex-cli 0.137.0, macOS Seatbelt)。

1. `codex` のサンドボックスは **入れ子にできない**。Claude sandbox 内で codex が Seatbelt を
   張ろうとすると `sandbox-exec: sandbox_apply: Operation not permitted`。
2. thread/turn の sandbox が `read-only` / `workspace-write` のときは codex が Seatbelt を張るので、
   Claude sandbox 内では上記で死ぬ。**`danger-full-access` のときだけ codex は Seatbelt を張らない**。
3. `danger-full-access` で走らせると、codex のコマンドは **Claude sandbox の制約下でそのまま実行**
   される (実測: リポジトリ内と `$TMPDIR` へは書ける、`$HOME` 直下は Claude が拒否)。
   → これが「⊆ Claude sandbox」を構成的に満たす唯一の経路。
4. codex の sandbox 値は **明示指定 (CLI `--sandbox` / app-server の thread RPC パラメータ) が
   `~/.codex/config.toml` を上書きする**。実測: config=`danger-full-access` + 明示 `--sandbox read-only`
   → read-only が勝ち Seatbelt で死ぬ。よって config 経由で挙動を変えることはできず、**呼び出し側が
   thread を `danger-full-access` で開始する必要がある**。
5. `codex app-server` は `~/.codex` の sqlite state を書けないと起動できない。
6. `codex exec` はネイティブに `--output-schema FILE` / `--json` (JSONL イベント) /
   `-o FILE` (最終メッセージ) / `resume [--last]` / `fork` / `review` を持ち、prompt は stdin から
   `<stdin>` ブロックとして渡せる。

### Claude Code 側の必要設定 (`~/.claude/settings.json`)

- `sandbox.enabled`: `true` と `sandbox.failIfUnavailable`: `true` — sandbox が有効であることが
  本設計全体の前提 (無効だと「⊆ Claude sandbox」が最初から成り立たない)。
- `sandbox.network.allowLocalBinding`: `true` — 常駐 app-server の localhost listen 用 (macOS)。
- `sandbox.filesystem.allowWrite`: `["~/.codex"]` — app-server の state 用。
- `sandbox.network.allowedDomains`: `["api.openai.com","auth.openai.com","chatgpt.com","*.chatgpt.com"]`
  — 到達を実測済み。モデル一覧 refresh 用の副次ホスト 1 件が allowlist 外で非致命 ERROR になるが動作に影響なし。
- `permissions.allow` (任意、classifier 判定を避けたい場合):
  `"Bash(codex ...)"` 系。

## 非目標

- `codex exec` 単発で済ませる「app-server を使わない」薄型化 (ユーザー要件で app-server を使う)。
- Codex 自身の機能拡張。あくまで CC からの薄い橋渡し。
- プロンプト egress をサンドボックスで防ぐこと (原理的に不可。§セキュリティ参照)。

## 中核設計

### 1. app-server を warm な常駐ランタイムとして使う

- **1 セッション 1 app-server**。Claude sandbox 内で起動した長寿命プロセス
  (`codex app-server --listen ws://127.0.0.1:PORT` + capability token 認証) を JSON-RPC で駆動する。
  unix socket 系 (`app-server daemon`/`proxy` 含む) は sandbox 内で bind 不可のため使わない
  (経緯は「未解決事項」1/2)。
- 常駐させる理由 = ユーザー要件。得られるもの: (a) ターンごとのコールドスタート回避、
  (b) thread の永続と `resume`/`fork` がネイティブ、(c) 複数 thread の並行。
- **必ず Claude sandbox 内で起動する**。子プロセス (codex がモデル指示で実行するコマンド) は
  起動時の Claude sandbox を継承するため、app-server を sandbox 内で立てれば全ターンの
  コマンド実行が Claude sandbox に閉じる。

### 2. 1 ターン = 1 CC Background Task

「Codex にメッセージを送り返信を得る」1 往復を、CC の **Background Task** として動かす。

- **開始**: `run_in_background` の Bash が app-server に対し 1 ターンを駆動する
  (`initialize` → `thread/start` か `thread/resume` → `turn/start` → イベント購読 → 最終メッセージ)。
  thread は **必ず `sandbox: "danger-full-access"`** で開始する (§前提 2/3/4)。
- **id / 通知 / 結果 / キャンセル**: CC の task id・完了通知・結果ファイル・`TaskStop` に委ねる。
  plugin 側の job-state 層は持たない。
- **進捗**: app-server の JSONL イベント (または `codex exec --json`) を **Monitor** で流す。
- **並行**: 独立した複数ターンは CC の並行サブエージェントで fan-out (各自が app-server の別 thread を駆動)。
  「codex daemon 上の N thread を自前管理」ではなく「CC が N エージェントを管理」に寄せる。
- **マルチターン**: thread id を task 結果に載せ、次ターンで `thread/resume` に渡す。

### 3. 構造化出力・レビューはネイティブに寄せる

- 構造化出力は app-server の turn 出力スキーマ (または `codex exec --output-schema`) を使い、
  JS でのパース/整形を持たない。
- コードレビューは `codex exec review` / app-server のレビュー turn を使う。プロンプトは *内容*
  (skill) として保持し、オーケストレーション JS は持たない。

### 4. transfer を「材料束」に一般化する

- 既存 plugin の「Claude の JSONL トランスクリプトを parse して codex thread に変換する」機構は
  **廃止**。制御側の Claude が文脈を持っているので、生ダンプより **Claude が要点を書いた
  handoff プロンプト**を turn の入力 (stdin の `<stdin>` ブロック) として渡す方が、質・安全とも上。
- 代わりに、turn の入力を **「コンテキスト材料束」** として一般化する: diff・ファイル・
  トランスクリプト抜粋・spec・自由文プロンプトのいずれも渡せる。これにより
  「トランスクリプトをレビュー材料として渡す」がフォーマット追加なしで実現し (機能増)、
  専用の transfer 実装が消える (コード減)。egress 前に Claude が curate/redact する前提。

## 残す薄い部品

- **diff 収集 (スコープ + 上限)**: working-tree / branch 切替、ファイル数・バイト数上限、
  巨大時は stat 化。既存 `git.mjs` の意図は残すが、Claude が組めるので**大幅に薄く**する
  (小さな helper か skill 手順)。
- **調整済みプロンプト**: コードでなく skill コンテンツ。
- **sandbox-off 起動レシピ**: 唯一の correctness 要。「app-server を Claude sandbox 内で起動」
  「全 thread を `danger-full-access`」「`dangerouslyDisableSandbox` とは絶対に併用しない」を 1 箇所に固定。
- **Stop 前レビュー gate** (任意): hook 設定は残すが中身は数行 (`codex exec review` かレビュー turn を呼ぶ)。

## 捨てる実装 (既存 plugin 比)

- `app-server-broker` / `broker-lifecycle` の自前ジョブ endpoint 層 (CC Background Task に置換)。
- `job-control` / `tracked-jobs` / `state` (CC の id/通知/結果/cancel に置換)。
- `status` / `result` / `cancel` サブコマンド (同上)。
- `claude-session-transfer` (材料束に一般化)。
- 大きな `setup` JS (auth/診断は `codex login` / `codex doctor` を直接)。
- 構造化出力のパース/整形 JS (`--output-schema` に置換)。

## 最小構成 (成果物の形)

「大きな JS ランタイム」ではなく「**skill + 数個の slash command + 極小の turn ドライバ + 1 hook**」:

- **skill**: プロンプト集 + 起動レシピ (sandbox-off、材料束の組み方、app-server の起動/健全性)。
- **slash command** `/codex-review`, `/codex-task`: `run_in_background` で 1 ターンを app-server に対して駆動。
  結果は CC 通知 + 出力ファイルで受ける。並行が要れば fan-out。
- **turn ドライバ** (極小): app-server への JSON-RPC を 1 ターン分だけ実行する薄い自前 ws
  クライアント (`scripts/codex-turn.mts`)。**唯一残す実装らしい実装**。
- **hook**: Stop gate (数行、任意)。

## セキュリティ・モデル

- **不変条件 (⊆ Claude sandbox)**: 次の 3 つが同時に成り立つときのみ「Codex の副作用 ⊆ Claude sandbox」。
  1. app-server を **Claude sandbox 内**で起動している。
  2. すべての thread/turn を **`danger-full-access`** で開始している (read-only/workspace-write は
     入れ子 Seatbelt で死ぬか、sandbox 外で codex 独自の広い read を許してしまう)。
  3. **`dangerouslyDisableSandbox` と併用しない** (併用すると完全無制限になる)。
- **fail-closed**: turn ドライバは sandbox 値を `danger-full-access` に**固定**し、外部入力で
  上書きできないようにする。app-server が Claude sandbox 内で起動されていることを起動時に確認する。
- **egress は防げない**: Codex に渡したプロンプト・材料 (diff/ファイル/トランスクリプト) は OpenAI に
  送信される。サンドボックスは egress を止めない。working-tree レビューは未ステージの WIP も送りうる。
  → 送信前に Claude が範囲を提示し、必要なら redact する運用を仕様に含める。
- **残余リスク (実装済みの緩和と限界)**: 二層の防御を実装済み。
  (1) app-server は **capability token 認証** (`--ws-auth capability-token`、loopback でも機能することを
  実測) つきで起動し、セッションごとに生成した token を知らないプロセスは handshake で拒否される。
  これにより別セッション・他ツールの誤接続とポートスキャン経由の接続は塞がる。
  (2) turn ドライバは token 必須・loopback 限定で、接続後に封じ込めプローブ (`command/exec` で
  $HOME と /tmp 直下が書込不可 & 対象 cwd が書込可) を行い、sandbox 外で起動された server への
  誤接続を fail-closed で拒否する。
  限界: 同一ユーザーで能動的に動く攻撃者 (token ファイルや `~/.codex` の資格情報を読める) は
  どの方式でも防げない — これは OS のユーザー境界の問題で、本設計のスコープ外。

### 却下した代替案 (アクセス制御まわり)

- **token ファイルの起動後削除 (秘密を server メモリ + Claude コンテキストのみに)**: 却下。
  server は token を起動時にメモリ保持するため技術的には成立する (実測) が、堅牢化にならない。
  削除すると以後 Claude が token を毎ターン持ち回ることになり、(a) token が会話経由で
  セッショントランスクリプト (`~/.claude/projects/`) に永続化、(b) 再具現化のたびにコマンドライン
  (ps) へ露出、(c) コンテキスト圧縮で token を失うと誰も認証できない server がポートを占有する
  ロックアウトが起きる。ファイル保持 (0600) なら token 文字列は一度もデータとして持ち回られない
  (Claude が扱うのはパスのみ)。
- **unix socket への移行**: 却下。Claude sandbox は AF_UNIX を bind/connect とも既定拒否で、
  設定 (`sandbox.network.allowUnixSockets` / `allowAllUnixSockets`) は **connect のみ**を開ける口。
  bind/listen を許可する設定は存在しない (公式 docs + 実測)。
- **socket unlink + fd 保持 / endpoint を持たない stdio 構成**: 却下。unlink 方式は AF_UNIX bind
  不可の時点で不成立 (TCP に unlink 相当は無い)。fd を後続ターンの driver に渡すには結局
  IPC endpoint か「全 driver の親となる常駐プロセス」が必要になる。それ自体が禁じ手なのではなく
  (目標は broker の排除ではなく、機能を保って複雑さを減らすこと)、この案が達成するアクセス制御は
  capability token と同等で、可動部品 (常駐親プロセス + fd 受け渡し) だけが増える —
  複雑さの純増になるため採らない。stdio 構成は endpoint を持たない唯一の完全解だが、
  常駐要件と CC のプロセスモデル (ターンごとに独立プロセス) に矛盾する。
- **slash command の `disable-model-invocation: true` (モデルからの自発呼び出し禁止)**: 却下し、
  初版にあった指定を削除。これは境界として機能していない — skill (`codex-bridge`) は
  model-invocable のままで起動レシピと driver の叩き方を全て含むため、モデルは command を
  経由せず素の Bash で同じ turn を回せる。実際の防御は不変条件 (sandbox 内起動・danger 固定・
  token 必須・封じ込めプローブ・egress 範囲提示) 側にあり、フラグはそれと独立。
  egress 範囲提示は呼び出し後の手順なので、呼び出し経路を絞る理由にもならない。
  残る効果は「近道を塞ぐ」だけで、機能を保ったまま可動部品を 1 つ減らせる。

## 検証 (done の条件)

- app-server を Claude sandbox 内で起動 → `danger-full-access` thread で 1 ターンを回し、
  モデルが実行したコマンドが Claude sandbox に閉じる (リポジトリ内/`$TMPDIR` 可、`$HOME` 直下不可) ことを実測。
- read-only/workspace-write を誤って渡した場合に fail-closed (turn ドライバが拒否) することを検査で pin。
- 常駐 app-server が CC のターンをまたいで生存し、かつ sandbox に閉じ続けることを実測 (§未解決 1)。
- egress レビュー材料の範囲提示が働くことを確認。

## 実装状況 (2026-08-24)

spike 全項目決着 (詳細: `docs/plan.md`、実測: canon `facts/codex/claude-sandbox-integration.md`)。初版実装済み:

- `scripts/codex-turn.mts` — turn ドライバ。ws (`ws://127.0.0.1:41100` 既定, `CODEX_BRIDGE_PORT`) で
  常駐 app-server に接続し 1 turn (または native `review/start`) を駆動。
  - **loopback 限定 + capability token 必須** (token を送る前に endpoint を検証。token 無しは起動拒否)。
  - sandbox は thread (`sandbox`) と turn (`sandboxPolicy`) の両方で danger 固定。未知フラグは拒否。
  - **封じ込めプローブ**: turn 前に `command/exec` (danger, トークン消費なし) で
    「$HOME と /tmp 直下が書込不可 かつ 対象 cwd が書込可」を検査。sandbox 外の server・
    別セッションの server は拒否。
  - approval 系の server 要求はメソッド別の schema-valid な deny で fail-closed。
  - イベントは threadId + turnId で自 turn のものだけ採用 (並行 driver・子 turn と混線しない)。
  - 制御系 RPC (initialize/thread/turn-start) はタイムアウト付き。turn 完了待ちのみ無制限。
  - SIGTERM/SIGINT で `turn/interrupt` を送ってから終了 (turn/start 応答待ち中でも turn id を
    待ってから interrupt する)。TaskStop でサーバー側 turn も止まる。
- `tests/codex-turn.test.mjs` — mock app-server で上記不変条件を pin (`node --test tests/codex-turn.test.mjs`)。
- plugin 一式: `.claude-plugin/plugin.json`, `commands/codex-task.md`, `commands/codex-review.md`,
  `skills/codex-bridge/SKILL.md` (起動レシピ・材料束・egress 提示)。
- 検証 (done の条件) の実測状況: 封じ込め (HOME 不可/TMPDIR・repo 可) ✓、fail-closed pin ✓、
  セッション内常駐 ✓ (セッション跨ぎは起動レシピで対応)、egress 範囲提示は commands の手順に組込。
- 未実装: Stop 前レビュー gate hook (spec で任意。後続)。

## 未解決事項 (解決済み — 経緯は docs/plan.md)

1. **常駐 app-server の寿命**: 解決。unix socket/`daemon`/`proxy` は sandbox 内で bind 不可のため
   **`--listen ws://127.0.0.1:PORT`** で常駐。セッション内は生存、セッション跨ぎは
   「`/readyz` チェック + 必要時再起動」(skill の起動レシピ)。
2. **自前 vs proxy**: 自前の極小 ws クライアントで確定 (proxy は sandbox 内で成立しない)。
3. **出力スキーマ**: `turn/start` の `outputSchema` がネイティブに存在し機能 (実測)。
4. **並行の上限**: 1 app-server で複数 thread 並行が成立 (実測)。律速は CC 側 fan-out。
5. **副次ホスト**: 放置で確定 (非致命)。

## 参考

- 既存実装: `openai/codex-plugin-cc` (置き換え対象)。
- サンドボックス実測: `ikeyan/canon` `facts/codex/claude-sandbox-integration.md`。
