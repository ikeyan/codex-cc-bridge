---
name: architecture
desc: この橋がなぜ driver 1 本しか持たないのか — CC と codex への委譲の境界、常駐 app-server と接続方式、共有 server 上で自分の turn を同定する仕掛け.
tags: []
sources: []
created: 2026-09-06T07:16:13Z
updated: 2026-09-06T07:16:13Z
---

# architecture

[[_index|..]]

[[architecture/delegation-boundary|delegation-boundary]]: ジョブ・状態・転送の各層を CC と codex のネイティブ機能へ委譲した結果このリポジトリのコードは driver 1 本しかない。「無い層」は設計であって欠落ではない.

[[architecture/resident-app-server|resident-app-server]]: 1 セッション 1 app-server を Claude sandbox 内に常駐させ loopback WebSocket で駆動する構成の理由 — unix socket が bind できないこと、起動場所が封じ込めを決めること、ポートがセッションの識別子になること.

[[architecture/turn-event-demultiplexing|turn-event-demultiplexing]]: 共有 app-server から流れる全通知の中から自分の turn だけを拾う 3 段フィルタと、turn id 確定前のイベントを取りこぼさないバッファ、制御 RPC だけにタイムアウトを置く非対称の理由.

***

コードの構造ではなく、**コードが存在しない理由**と、1 本しかない実装が何を引き受けているかを書く。新しい層を足したくなったときは [[architecture/delegation-boundary]] を先に読む。
