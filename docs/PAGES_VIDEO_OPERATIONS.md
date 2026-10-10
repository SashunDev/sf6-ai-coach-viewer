# SF6 AI Coach — GitHub Pages MP4動画連動（v1）

## 2026-10-11 現在の結果

- PagesへのMP4単体再生（16秒の合成動画）：iPhone Safari実機で再生・9秒シーク・9〜14秒の区間リピートがPASS（ユーザー確認済み）。
- コーチング結果 `#r=...` とPages動画 `&v=...` の連動機能：実装・公開済み。**新しい統合リンクのiPhone実機動作は未確認**。
- [本番デプロイ成功ログ](https://github.com/SashunDev/sf6-ai-coach-viewer/actions/runs/38090879101)：build SUCCESS / deploy SUCCESS。
- Python mirror 18 tests、JavaScript URL allowlist 12 tests、Release retention 11 tests = **計41件PASS**。
- GitHub Pages試験リンク：[pages-integration-smoke.html](https://sashundev.github.io/sf6-ai-coach-viewer/pages-integration-smoke.html)
- コーチングJSONと元動画は実際の対戦データではなく、架空内容・合成動画で検証。

## 現在の運用ルール

| 管理対象 | 設定 |
|---|---|
| GitHub Releases（公開元動画） | 2,000MBを超えたら古い順で1,800MB以下へ削減 |
| GitHub Releases保存期限 | 作成後14日 |
| GitHub Pages（再生用MP4） | **合計800MB以下**、14日以内のMP4のみ、新しい順に選択 |
| JSON | 動画保存・削除対象外。レポート本文はURLフラグメントに保持 |
| 動画配備頻度 | 通常4回/日（UTC 00:42, 06:42, 12:42, 18:42）、main更新時、手動 |
| 外部有料サービス | 不使用 |

GitHub Actionsのスケジュールは遅延・停止する場合があり、動画をアップロードしてすぐにはPagesへ反映されない。Releasesへの動画追加だけでは常に即時再配備されるわけではないため、急ぐ場合は手動実行を行う。

### Pagesに配備されない動画

- 14日を過ぎたもの
- MOV/WEBMなどMP4以外
- 名前にスペース、日本語、URLエスケープ記号などを含むMP4
- 動画1本が800MBを超える、または選別済み動画との合計が800MBを超えるもの

ここで扱う800MBは配信先の公開容量であり、Releasesに保持できる2,000MBという元動画の上限とは別。Pagesに載らない動画はビューアでローカル動画選択を使う。**全保存動画の自動再生は保証しない**。

## URL連動

基本ビューア: `https://sashundev.github.io/sf6-ai-coach-viewer/`

- レポートのみ: `#r=z.<圧縮JSONトークン>`
- 動画連動: `#r=z.<圧縮JSONトークン>&v=<URLエンコードされたPagesのMP4 URL>`
- 対応例: `https://sashundev.github.io/sf6-ai-coach-viewer/media/<動画名>.mp4`
- 以前の専用Releaseリンクは、同名のMP4がPagesに存在する場合、ビューア内でPagesのURLへ読み替える。
- 配信期間を過ぎた等で取得失敗したときは、端末内動画を選択して再生できる。
- URLフラグメントは通常サーバーに送られない。ただしコピーしたURL、ブラウザ履歴・同期先には**暗号化されていないレポート本文が含まれる**。
- **公開リポジトリとPagesに配備した動画は誰でも閲覧可能**。本番のプライベート録画や個人情報を含む動画をアップロードしないこと。

## 新規動画を登録してすぐ再生したい場合

1. [専用Release](https://github.com/SashunDev/sf6-ai-coach-viewer/releases/tag/sf6-ai-coach-media) のAssetsに英数字とハイフン／アンダースコアのファイル名の `.mp4` を登録する。例：`sf6-session-20261011-001.mp4`。MP4はGit履歴にcommitしない。
2. [Pages自動配備ワークフロー](https://github.com/SashunDev/sf6-ai-coach-viewer/actions/workflows/pages-video-site.yml) で **Run workflow** を開き、`deploy=true`（チェックあり）の状態で実行する。
3. `build`・`deploy` が両方SUCCESSであることを確認する。
4. 動画URLを `https://sashundev.github.io/sf6-ai-coach-viewer/media/<ファイル名>.mp4` として指定し、レポートのリンク `&v=` にURLエンコードして付与する。
5. iPhoneでは動画の自動**読み込み**とタップ再生を区別する。Safariの制限により、ページを開いただけで音声付き動画が自動再生するとは限らない。

ChatGPTに添付した動画からReleaseへ自動アップロードする機能は**未実装**。現段階では手動アップロードが必要。

## 技術構成と復旧

- **本番**: `.github/workflows/pages-video-site.yml`、`scripts/build_pages_site.py`、`tests/test_pages_build.py`、`tests/test_viewer_pages.cjs`。
- **旧PoC**: `.github/workflows/pages-video-poc.yml` のデプロイは無効化済み。実行しても本番Pagesを上書きしない。
- **Releases期限削除**: `.github/workflows/video-retention.yml` の毎時ジョブは引き続き稼働する。
- **GitHub Pages公開元**: GitHub Actions（Deploy from branchではない）。
- CI/本番ミラーの生成が失敗した場合、deployは動かず**直前のPages版を保持**する。
- 必要時には[Pages Settings](https://github.com/SashunDev/sf6-ai-coach-viewer/settings/pages)から公開元を `Deploy from a branch` → `main` / `/(root)` へ変更すれば、HTMLのみの旧配信方式へ戻せる。その場合MP4と統合リンクは使えなくなる。

## 次の実機Gate

**iPhone Safariで** [統合テストリンク](https://sashundev.github.io/sf6-ai-coach-viewer/pages-integration-smoke.html) を開き、以下を確認する。

- レポートJSONの選択を求めず、架空の試合レポートが表示される
- MP4を端末から選択することなく、16秒の合成動画が表示される
- 動画を再生できる
- シーンをタップすると該当秒へシークする
- 区間リピートが機能する
- エラーの場合、ローカル動画選択に戻せる

このGateをPASSするまでは、**統合画面のiPhone実機検証は保留**。
