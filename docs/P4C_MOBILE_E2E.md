# P4-C — 実動画の公開とiPhone Safari統合テスト

対象：SF6 AI Coach。実装正本：[PRODUCTION_READINESS_P4.md](PRODUCTION_READINESS_P4.md)／[Issue #3](https://github.com/SashunDev/sf6-ai-coach-viewer/issues/3)。

## 目的

PC上でコマンドを実行せず、GitHubのWeb画面から **同一試合IDのMP4とコーチングJSONを公開**し、既存Pagesの自動読込・SHA-256照合を行う。既存の `index.html` は変更しない。**GitHub Pagesでは映像配備のためにGit commitへMP4を登録しない。**

## テリー戦の検証データ

- 試合ID：`sf6-alex-terry-recoach-20261011`
- 同じ名前の `.mp4`（約25.1MB）と `.json`（約7.6KB）。
- H.264 + AAC、173.4秒、アレックス対テリー 1-2、イベント7件。以前のユーザー訂正（R3スタン時のSA3リーサル／被ガード起き上がりドライブリバーサル→Terry 2中P確反）を反映。
- この2ファイルはChatGPTの納品ファイルとしてユーザーに渡す。**GitHub側にはまだアップロードされていない**。送るのはこの2ファイルのみ（ZIP本体、元動画、HTMLはアップロードしない）。
- 公開先のReleaseおよび配備したJSON・MP4は**誰でも取得できる**。14日の自動削除対象は動画のみでJSONは継続公開。ダウンロードされたコピーの削除は保証されない。

## iPhone/PCブラウザーでの操作（ファイル2個）

1. ブラウザーのGitHubにログインし、[専用Release](https://github.com/SashunDev/sf6-ai-coach-viewer/releases/tag/sf6-ai-coach-media)を開く。
2. 既存Releaseの「Edit release」（編集）を開く。iPhoneで編集UIが見つからない場合はSafariの「デスクトップ用Webサイトを表示」を利用する。
3. アセット追加欄に `sf6-alex-terry-recoach-20261011.mp4` と `sf6-alex-terry-recoach-20261011.json` を選択して追加し、完了後「Update release」で保存する。**古い合成smokeファイルは削除しない。** 同名ファイルがすでに存在したら、勝手に上書きせず状態を確認する。
4. [Pages配備ワークフロー](https://github.com/SashunDev/sf6-ai-coach-viewer/actions/workflows/pages-video-site.yml)を開き、「Run workflow」を選択する。
5. `Use workflow from: main`、`deploy = true`、`verify_match_id = sf6-alex-terry-recoach-20261011` を入力し実行する。以前の `deploy` の見つけにくさに注意（Release編集画面ではなく**Actions**側の項目）。
6. 実行結果で `build`、`deploy`、`verify-match` の3ジョブがPASSしていることを確認する。最後のジョブログで **VERIFIED VIDEO + JSON** が表示されて初めてPagesのデータ配信検証PASS。URLは `https://sashundev.github.io/sf6-ai-coach-viewer/#id=sf6-alex-terry-recoach-20261011`。※公開データがまだないうちは、このURLを動作済みとして案内しない。
7. iPhone SafariでそのURLを開き、**アレックス対テリーの動画と7件の場面が最初から表示されるか**確認する。再生ボタンを押すことは正常。元動画選択やJSON選択を要求される場合はFAIL。場面タップ→シーク、区間再生、リピート、速度変更、全編再生を確かめる。

## 失敗時の対応

- `build` FAIL：アセット名称とJSON形式を確認。過去の公開サイトは原則維持される。
- `deploy` FAIL：Pages公開処理を確認。公開成功とは扱わない。
- `verify-match` FAIL：Releaseファイルの欠落／H.264・動画長・JSON・Pages HTTP応答・公開データのSHA不一致のいずれか。実動画のE2E PASSではない。手動で短縮URLの成功を報告しない。
- Pagesへの動画配信は最近14日以内かつ800MB容量枠に制限される。JSONは動画がなくなっても残る。
- Safariの再生操作で失敗したら、エラー表示と再生・シーク結果を記録。**表示不能＝自動読込成功ではない**。
- パッケージから単一HTMLを生成する[オフライン代替](STANDALONE_REPORT_GUIDE.md)は引き続き利用できる。

## Gate

- コード・単体テスト：このドキュメントで別途PASS候補とする。
- Releaseへの実ファイル公開・Pagesアセット照合：GitHub Actions `verify-match` 成功後。
- **Formal P4-C GO**：上記に加えユーザー実機iPhone Safari確認を取得し、ChatGPTがGitHubのactual Evidenceを直接レビューしてから判定する。
