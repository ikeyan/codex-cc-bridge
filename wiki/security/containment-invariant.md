---
name: security/containment-invariant
title: 封じ込め不変条件 (Codex の副作用 ⊆ Claude sandbox)
desc: 3 条件が同時に成り立つときだけ Codex の副作用が Claude sandbox に閉じる。各条件をどこが守っているか、どれがコードで守れない弱い環かを示す.
tags: []
sources: []
created: 2026-09-06T07:10:31Z
updated: 2026-09-06T07:10:31Z
---

# 封じ込め不変条件 (Codex の副作用 ⊆ Claude sandbox)

このリポジトリの correctness 要件は 1 つだけ: **Codex が起こす副作用は Claude sandbox が
許す範囲の部分集合に収まる**。次の 3 条件が**同時に**成り立つときにだけ成立し、1 つでも欠けると
保証は無くなる (段階的に劣化するのではなく、無くなる)。

1. app-server を **Claude sandbox 内**で起動している。
2. すべての thread と turn を **`danger-full-access`** で開始している。
3. **`dangerouslyDisableSandbox` と併用していない**。

## どこが守っているか

| 条件 | 守り方 | 強度 |
| --- | --- | --- |
| 1. sandbox 内起動 | 起動レシピ + turn 前の[[security/containment-probe|封じ込めプローブ]] | 実行時に検査される |
| 2. danger 固定 | driver の定数固定 + 未知フラグの即エラー + loopback 限定 | 静的。argv に注入経路が無い |
| 3. 併用しない | skill と commands の記述のみ | **運用規律だけ。コードでは検査できない** |

3 が弱い環である。driver からは自分が `dangerouslyDisableSandbox` 下で動いているかを知る術が無く、
その状態では 1 のプローブも「書ける」を正常と誤認しうる。だから skill と両 command が
「絶対に併用しない」を明示している。

条件 2 について、driver が `parseArgs` を `strict: true` / `allowPositionals: false` で使い
**未知フラグを即エラー**にしているのは利便性の話ではない。sandbox 値を外から注入する経路を
argv に一切残さないための構造的な防御であり、`tests/codex-turn.test.mjs` の
"unknown flags are rejected before connecting (no sandbox injection path)" が pin している。

## 不変条件が守るもの・守らないもの

守るのは**副作用**(ファイル書込・コマンド実行) の範囲だけである。Codex に渡した情報が
OpenAI に送られること自体は、この不変条件の対象外
([[security/egress-is-not-contained]])。
