# SF6 AI Coach — JSON永続管理と短縮レポートURL（2026-10-11）

## 方針・現在の状態

- **動画（SF6対戦リプレイMP4）**と**コーチングJSON**を同一の専用公開GitHub Release `sf6-ai-coach-media` で、`<試合ID>.mp4`／`<試合ID>.json` のペアとして管理する。バイナリや個別レポートJSONをGitのコミット履歴には入れない。
- 動画は作成から14日経過で削除対象（Actions遅延のため正確な削除時刻保証なし）。Release容量上限2,000MB、超過時1,800MBまで古い順に削除。**JSONは動画の削除処理の対象外**。JSONの削除は自動で行わない。
- GitHub Pagesは動画を新しい順に最大800MB、JSONは**全件**を最大50MB／2,000件／1件1MBまで公開配備。JSON枠を超えたら**配備をFAILにし、元の公開サイトを維持**。JSONを勝手に古い順で捨てない。
- Notion Coaching Sessions／Memoryがプレイヤーの分析記録の正本。公開JSONは特定試合の表示用データであり、Notionに代わる記憶ではない。
- **公開レポートには戦績・対戦相手・弱点・観察記録が含まれ、URLを知らない人も公開リポジトリとPagesから取得できる**。公開不可の内容や機密情報は含めない。
- 2026-10-11：合成MP4単体・旧形式の統合ビューアはiPhone Safari実機でユーザーPASS。**新しい短縮 `#id=` リンクも同日のユーザー統合テストOK報告を受け実機PASS**。実リプレイ動画を使うE2Eは未実施。

## 使い方：ChatGPTのコーチングJSONを保存する

前提：SF6 AI Coachから `schemaVersion:1` 検証済みコーチングJSONを出力したこと。本人は**SF6対戦リプレイの期限付き公開と、そのコーチングJSONの継続公開**を2026-10-11に許可済み。通常コーチングにはGitHubへの自動保存を必須化しない。

1. 例として `match-20261011-001` のような **固有の試合ID** を決める。英数字から始まる80文字以内の英数字・ハイフン・アンダースコアに限る。
2. ChatGPTなどで、UTF-8 JSONをzlib圧縮→base64url化した `z.<token>` を生成する。参照実装：`python3 scripts/create_coaching_link.py report.json` のURL `#r=z.<token>` 部分から `z.` を含めて取得する（`&v=` は除く）。これはGitHubへ送る時点で公開データになる。
3. [JSONを公開するGitHub Actions](https://github.com/SashunDev/sf6-ai-coach-viewer/actions/workflows/publish-coaching-report.yml) の **Run workflow** を開く。
   - `match_id`：上で決めたID
   - `report_token`：`z.` から始まるトークン
   - `replace_existing`：通常はチェックなし。既存レポートを**明示的に訂正・上書き**する場合だけチェックする。
4. 実行が成功すると、そのJSONを専用Releaseへ登録し、Pages配備ワークフローが自動的に起動する。Pages側の `build`／`deploy` 成功まで確認する。
5. 短縮URLは `https://sashundev.github.io/sf6-ai-coach-viewer/#id=match-20261011-001`。ページが `reports/match-20261011-001.json` を読み込む。
6. 同じ試合の公開MP4は [Release Assets](https://github.com/SashunDev/sf6-ai-coach-viewer/releases/tag/sf6-ai-coach-media) へ `match-20261011-001.mp4` の同名規則で登録する。動画のGitHub登録は現時点で手動（ChatGPT動画添付からの自動アップロードは未実装）。Pages反映後、レポートはMP4の再生・シークと連動する。動画が存在しない・削除済みならレポート本文のみを表示してローカル動画選択へ切り替える。

> `workflow_dispatch` 入力欄に貼り付けるレポート文字列は、公開レポートを生成するためのデータです。GitHub Actionsの実行履歴やReleasesから閲覧され得るため、秘密情報を入れないでください。**試合IDの重複**は初期状態でアップロード拒否とする。訂正時の `replace_existing` は事前バックアップ機能ではないため、必要ならNotionの正本・生成したJSONを手元に保持する。

## 公開HTTP検証（2026-10-11）
- [GitHub Actions実行 #38097505781](https://github.com/SashunDev/sf6-ai-coach-viewer/actions/runs/38097505781)：**PASS**。
- Pagesの合成JSON：HTTP 200、`Content-Type: application/json; charset=utf-8`。GitHub ReleaseのJSONとSHA-256完全一致。
- Pagesの合成MP4：HTTP 200、`Content-Type: video/mp4`。
- Pages自動更新：[Run #38097254001](https://github.com/SashunDev/sf6-ai-coach-viewer/actions/runs/38097254001)：**build/deploy PASS**。
- **iPhone Safari画面操作**：短縮URL `#id=sf6-coach-synthetic-smoke-16s` について2026-10-11にユーザーが統合テストOKと報告（実機Gate PASS）。**実リプレイ動画を使うE2Eは未確認**。

## 合成スモーク試験

- 対戦内容・コーチング事実は架空。動画は16秒の非ゲーム合成MP4で、元映像データは不要。
- [短縮URLによる合成コーチング試験](https://sashundev.github.io/sf6-ai-coach-viewer/#id=sf6-coach-synthetic-smoke-16s)
- [公開JSON](https://sashundev.github.io/sf6-ai-coach-viewer/reports/sf6-coach-synthetic-smoke-16s.json)
- [GitHub Release](https://github.com/SashunDev/sf6-ai-coach-viewer/releases/tag/sf6-ai-coach-media)
- [JSONの登録テスト実行](https://github.com/SashunDev/sf6-ai-coach-viewer/actions/workflows/bootstrap-json-smoke.yml)

## 既存リンクの後方互換・障害対応

- 従来の `#r=z.<token>`、`#r=j.<token>`、`#r=...&v=<URL>` は維持する。これらはJSONを短縮IDでサーバー保存せずURL自体に埋め込む方式。
- 新 `#id=` は同一Pages上の `/reports/` から **JSONのみ**を取得する。CSPは `connect-src 'self'` に限定。第三者ドメインや任意のURLへのfetchを行わない。動画URLも同一リポジトリの `/media/` に限定。
- JSONがない／不正／未配備：読み込み失敗を明示し、JSON手動読込へ。動画がない：JSONは引き続き表示、ローカル動画選択へ。音声付き動画がSafariで自動再生するとは限らない。
- Pages生成に失敗した場合は `deploy` しない。以前の公開サイトを維持する。スケジュールデプロイは毎日4回（遅延あり）、手動実行も可能。
- GitHub Pagesの公開サイト全体には1GBの制約がある。動画800MB＋JSON50MB＋HTML等の余裕は確保しているが、蓄積が限界を超えたときもJSONの無断削除はしない。将来的には別の配信戦略が必要。
