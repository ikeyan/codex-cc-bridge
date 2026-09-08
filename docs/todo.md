# 未実装 TODO

実装済みの設計・不変条件の説明は [`wiki/`](../wiki/_index.md)、外部依存の実測事実は canon
(`ikeyan/canon` の `facts/codex/claude-sandbox-integration`) が正。ここには**まだ無いもの**だけを置く。

## Stop 前レビュー gate hook

セッションの Stop 時に Codex レビューを 1 回走らせる hook。初版では見送った。

- 位置づけ: 任意機能。無くても封じ込め不変条件 (`wiki/security/containment-invariant.md`) には影響しない。
- 実装の見込み: 数行。`review/start` を叩く driver 呼び出し 1 本 + `hooks` 設定。
  独自のレビュー実装は持たない (`wiki/architecture/delegation-boundary.md`)。
- 未着手の理由: 「Stop のたびにレビューを走らせる」運用が本当に欲しいかが未検証で、
  hook 設定・plugin.json・失敗時の挙動という可動部品が確実に増えるため。

## turn の駆動を MCP ツールにする (前提 2 点が解けたら)

driver の CLI 層を plugin 同梱の stdio MCP サーバに置き換えると、エージェントの手数は
「JSON 引数でツールを 1 回呼ぶ」に縮み、シェルも一時ファイルも通らなくなる。実測済みの前提
(canon `facts/claude-code/mcp-tool-call-backgrounds-cancels-and-runs-unsandboxed`):
120 秒で background task 化される、TaskStop で `notifications/cancelled` が届く (→ `turn/interrupt`
を打てる)、MCP サーバは sandbox 外で動く (→ app-server の起動は Bash のまま)。

見送っている理由は、解けていない 2 点が機能と信頼性を落とすため:

- **進捗**: `notifications/progress` は UI に出ない。今の stderr + Monitor に相当する経路
  (ログファイルのパスを呼び出し前に知らせる取り決め) が要る。
- **MCP サーバの再起動**: token/port と進行中の結果がメモリにあるので、MCP サーバだけ落ちると
  生きている app-server に誰も繋げなくなる。永続化すると session dir が戻ってくる。

やるなら順に: lifecycle/security テスト → ws コアを CLI の裏に関数化 → 最小の MCP transport と
init/ready → 実セッションで launch・background 完了・TaskStop を確認 → 上の 2 点を解決 →
CLI とランタイム行列を外し wiki 更新。job id・queue・status/result/cancel ツール・完了結果の
保管・app-server の監督は持ち込まない (Claude が task 寿命、codex が thread 永続を持つ)。

## sandbox read スコープの推奨設定を確定する

egress の上界は Claude sandbox が Codex に読ませる範囲で決まる
(`wiki/security/egress-is-not-contained.md`)。既定はコンピュータ全体で `~/.ssh/` も
`~/.codex/auth.json` も読めるが、**このリポジトリとして推奨する絞り方がまだ無い**。

候補は `permissions.blockReadsOutsideWorkingDirectories` / `sandbox.filesystem.denyRead` +
`allowRead` / `sandbox.credentials` の 3 つ。確定する前に測ることが 2 つある。

- **`~/.codex` との両立**: app-server は `~/.codex` の sqlite state を読み書きできないと起動しない。
  read を作業ディレクトリの外で塞いだとき、`sandbox.filesystem.allowWrite: ["~/.codex"]` だけで
  read も通るのか、`allowRead` を別に足す必要があるのかが未確認。
- **codex 自身の設定の読み取り**: `~/.codex/config.toml` と認証情報が読めなくなると
  turn がどう失敗するか (起動時に落ちるのか turn 中に落ちるのか)。

決まったら `skills/codex-bridge/SKILL.md` の「前提 (`~/.claude/settings.json`)」に足し、
実測は canon の `facts/claude-code/` に書く。
