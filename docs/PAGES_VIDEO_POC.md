# GitHub Pagesへの動画直接配備 — 16秒合成MP4 PoC

## 目的と変更範囲

既存の `GitHub Pages` ビューアは変更せず、Releasesの `sf6-coach-synthetic-smoke-16s.mp4`（約355KB）を同じPagesの配信アーティファクトに含める。GitへのMP4コミットや外部サービスの契約を行わない。

- ワークフロー: `.github/workflows/pages-video-poc.yml`
- 生成されるテストページ: `pages-video-smoke.html`
- 動画URL（**デプロイ後のみ**）: `https://sashundev.github.io/sf6-ai-coach-viewer/media/sf6-coach-synthetic-smoke-16s.mp4`
- テストページ（**デプロイ後のみ**）: `https://sashundev.github.io/sf6-ai-coach-viewer/pages-video-smoke.html`
- 既存のHTML 4件（index、demo、release-smoke、video-diagnostics）は1バイトも変更せず配信アーティファクトにコピーする。
- GitHub Releasesの2,000 MB／1,800 MB／14日削除は変更しない。Pagesの公開データには別途1GBサイト上限がある。

## 検証済み

- [Run 38055523937](https://github.com/SashunDev/sf6-ai-coach-viewer/actions/runs/38055523937): build SUCCESS, deploy SKIPPED（公開を意図的に保留）。
- 合成MP4 354785 bytes、MP4ヘッダ確認、既存HTMLバイト一致。
- `actions/upload-pages-artifact@v4` の GitHub Pages用アーティファクト登録成功。
- この結果は**サイト公開・Safari実機再生の成功を示すものではない**。

## 次の実機検証（ユーザー操作が必要）

1. [Settings → Pages](https://github.com/SashunDev/sf6-ai-coach-viewer/settings/pages) で、Build and deployment / Source を **GitHub Actions** に切り替える。
2. [Actions → SF6 GitHub Pages video PoC](https://github.com/SashunDev/sf6-ai-coach-viewer/actions/workflows/pages-video-poc.yml) → **Run workflow**（branch `main`）を選び、`deploy=true` にして実行する。
3. Runの `build` と `deploy` が両方SUCCESSになってから、`/pages-video-smoke.html` をiPhone Safariで直接開く（ChatGPT内ブラウザーではなく）。
4. 自動的に映像のメタデータが読み込まれるか、再生・9秒シーク・9～14秒ループが動作するか確認する。
5. ブラウザー再生が不調なら診断ログを確認し、動画URLを直接開いたときの応答と併せて報告する。

### 復旧手順

**PoC公開前の配信方式に戻す場合**は、Settings → Pages → Build and deployment → Source を **Deploy from a branch**、branch `main`、folder `/(root)` に戻す。GitHub Pagesの再ビルド完了を確認する。PoCの配信アーティファクトはGitの履歴にMP4を追加していない。

**重要:** GitHub Actionsを公開元に変更したままの場合、通常のmainへのコミットだけではこのPoCワークフローのdeployは動かない。正式運用ではmain更新時にもサイト更新されるよう専用の自動デプロイが必要。PoCはこれを提供しない。

## 未解決事項

- 実際のGitHub Pagesからの動画応答（Content-Type, Range等）とiPhone Safari再生は未確認。
- 動画本数増加時はPages 1GB上限未満に配信対象を絞る別のキャッシュ選択・期限同期が必要。
- 現在の本番`index.html`は自己ホスト動画（same-origin）を許すCSPではないため、PoC成功後に**検証済み動画URLだけを適切に許可する変更**が必要。
- 現在のリンク方式 `#r=...&v=...` でPages動画を扱う改修は未実施。今回のテストページのみで判定する。
