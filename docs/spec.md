# codex-cc-bridge 設計仕様

> 状態: 設計 (実装前)。この文書が唯一のソース。実装が始まったら「実装状況」節を更新する。

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

- **1 セッション 1 app-server**。Claude sandbox 内で起動した長寿命プロセス (`codex app-server`,
  必要なら codex 純正の `app-server daemon`/`proxy` を利用) を JSON-RPC で駆動する。
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
- **turn ドライバ** (極小): app-server への JSON-RPC を 1 ターン分だけ実行する薄いクライアント
  (可能なら codex 純正の `app-server proxy` を使い自前実装を最小化)。**唯一残す実装らしい実装**。
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

## 検証 (done の条件)

- app-server を Claude sandbox 内で起動 → `danger-full-access` thread で 1 ターンを回し、
  モデルが実行したコマンドが Claude sandbox に閉じる (リポジトリ内/`$TMPDIR` 可、`$HOME` 直下不可) ことを実測。
- read-only/workspace-write を誤って渡した場合に fail-closed (turn ドライバが拒否) することを検査で pin。
- 常駐 app-server が CC のターンをまたいで生存し、かつ sandbox に閉じ続けることを実測 (§未解決 1)。
- egress レビュー材料の範囲提示が働くことを確認。

## 未解決事項 (実装前に確定させる)

1. **常駐 app-server の寿命**: `run_in_background` で立てた長寿命プロセスが CC のセッション/ターンを
   またいで生存し、かつ Claude sandbox に閉じ続けるか。閉じ続けないなら「セッション開始で起動 +
   健全性チェック + 必要時再起動」の運用を定義する。codex 純正 `app-server daemon` の利用可否も要検証。
2. **JSON-RPC を自前で駆動 vs `app-server proxy`**: どちらが薄いか。プロトコル変更耐性も含めて選ぶ。
3. **app-server turn の出力スキーマ指定方法**: `codex exec --output-schema` と app-server RPC で
   スキーマ指定の口が同じか差があるか。
4. **並行の上限**: fan-out するサブエージェント数と、1 app-server 上の並行 thread 数のどちらで
   律速すべきか。
5. **モデル一覧 refresh の副次ホスト**を allowlist に足すか (非致命なので既定は放置)。

## 参考

- 既存実装: `openai/codex-plugin-cc` (置き換え対象)。
- サンドボックス実測: `ikeyan/canon` `facts/codex/claude-sandbox-integration.md`。
