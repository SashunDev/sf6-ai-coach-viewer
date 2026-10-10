# SF6 AI Coach — Release MP4配信修正PoC（Cloudflare Workers Free）

## 結論と診断事実

GitHub Actionsから公開Releaseアセットを実測すると、元のMP4は:

- 通常取得: **200**, `Content-Type: application/octet-stream`, `Content-Disposition: attachment`
- Range取得: **206**, `Content-Range: bytes 0-1023/354785`（Rangeには対応）
- iPhone Safari: `MediaError.code=4`, `NotSupportedError`

保存先はGitHub Releasesのまま維持し、**配信ヘッダーのみ変更**します。

## 実装方針

`GitHub Releases（公開動画） → Cloudflare Worker（streaming proxy） → iPhone/PCの動画プレーヤー`

- `video/mp4` + `Content-Disposition: inline`
- `Range` / `206 Partial Content` / `Content-Range` / `Content-Length` を引き継ぐ
- `response.body` を直接中継し、Worker側に動画を保存しない（動画全体をメモリに読まない）
- 許可対象は `SashunDev/sf6-ai-coach-viewer` の `sf6-ai-coach-media` Releaseだけ
- `/video/<安全なファイル名>.mp4` 以外にアクセス不可
- `Cache-Control: no-store` を指定（削除期限後の配信延命を避ける）
- 新しい料金の発生を避けるため、**Cloudflare Workers Free** を使用（現在100,000リクエスト/日、超過すると利用不可となる）
- GitHubで既に確定した動画上限 **2,000MB / 1,800MB以下へ削減 / 14日経過時削除** のルールは変更しない
- `Chat → #r=圧縮コーチングJSON & v=動画URL` の仕様と手動JSON読込は維持する

## 現状

- `worker.mjs` を実装し、`worker.test.mjs` のモックテスト **12/12 PASS**
- GitHubのReleaseヘッダーの実測を実施
- **Cloudflareへは未配備**。Workers Freeのアカウント作成およびWorkerのデプロイは別作業
- **本番ビューア `index.html` は未変更**。Workerの実機動画再生が通るまで切り替えない
- GitHub Releasesの実動画ストリーミング可否はWorkerの配備後に確認する

## 初回セットアップの予定（ユーザー操作）

1. 無料のCloudflareアカウントを作成。
2. Cloudflare Dashboard → Workers & Pages → Create application → Create Worker。
3. Workerのソースに [`worker.mjs`](./worker.mjs) の全文を使用（ES Modules型）。
4. Workers FreeでDeployし、割り当てられた `https://<name>.<subdomain>.workers.dev` を取得。
5. Safariで `https://<name>.<subdomain>.workers.dev/healthz` を開き `ready` の表示を確認。
6. 次に `https://<name>.<subdomain>.workers.dev/video/sf6-coach-synthetic-smoke-16s.mp4` をSafariで開き、動画として再生可能かを確認。
7. `GET` のほか、`Range: bytes=0-1023` を送ると `206` が返るかも検証。
8. 動画再生・シークが成功したら初めて、GitHub PagesのViewerからWorkerへ再生先を切り替える。既存 `v=` パラメータはGitHub Releasesの元URLのまま保持する。

## ローカル検証

```bash
node --test workers/worker.test.mjs
```

このテストはネットワーク接続を使わず、取得先をモックして以下を検証しています: MIME変更、添付ダウンロード指定の解除、Range/206保持、外部URLの拒否、HTTPエラー、HEAD、CORS、no-store。

## 制約

- GitHub Releaseは公開です。公開データを非公開にはできません。Workerも公開映像へ誰でもアクセスできます。
- Workers Freeはリクエスト数上限があり、利用制限でストリームが停止する場合があります。
- まだGithub Pages側をWorkerに向けていません。
- Cloudflareのアカウント作成／デプロイをせずに、WorkerのHTTPS URLは発行できません。
- 動画を一時保存・バックアップしない設計です。14日経過によるRelease削除後、動画は再生できなくなります。