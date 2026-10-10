# SF6 AI Coach — GitHub Releases 動画運用

## 保存設定（確定）

- 保存先: 公開リポジトリ `SashunDev/sf6-ai-coach-viewer` の専用 Release（tag: `sf6-ai-coach-media`）
- 合計動画容量の上限: **2,000 MB**（2,000,000,000 bytes、十進表記）
- 上限を超えた場合: **古い順に削除し、1,800 MB以下**へ
- 最大保存日数: **14日**（アセット作成日時から。14日経過を削除対象にする）
- 容量が上限未満でも、14日を経過した動画は削除
- JSON・非動画アセット: **削除しない**
- 対象拡張子: `.mp4`, `.mov`, `.webm`, `.m4v`（大文字小文字を区別しない）
- **専用Release以外の動画やリリース、Git履歴は一切触らない**
- 削除判定は毎時のGitHub Actionsと手動実行。リアルタイム上限ではない。GitHubのスケジュールは遅延・一時停止の可能性あり。

## 初回セットアップ（1回だけ）

1. [Actions / SF6 AI Coach video retention](https://github.com/SashunDev/sf6-ai-coach-viewer/actions/workflows/video-retention.yml) を開く。
2. `Run workflow` → `main`。初回は `initialize_release = true`, `dry_run = true` を指定して実行。
3. [Releases](https://github.com/SashunDev/sf6-ai-coach-viewer/releases) に `SF6 AI Coach Temporary Videos`（tag `sf6-ai-coach-media`）ができたことを確認。
4. 以後、このReleaseの **Assets** に動画をアップロードする。通常はH.264/AAC MP4を推奨。動画ファイルは **Gitへコミットしない**。

アップロード後、必要なら同じワークフローを `initialize_release=false`, `dry_run=false` で手動実行すると、容量・期限チェックを即時に試行する。

## ブラウザーで開くリンク

通常のChat生成リンク:
`https://sashundev.github.io/sf6-ai-coach-viewer/#r=<レポートの圧縮トークン>`

任意の動画URLを加えたリンク:
`https://sashundev.github.io/sf6-ai-coach-viewer/#r=<レポートの圧縮トークン>&v=<URLエンコード済みReleaseのMP4ダウンロードURL>`

許可される元動画は、公開された **このリポジトリの `sf6-ai-coach-media` Release** 上にあるMP4のみ。URLはアセットの `Copy link address` で取得する。動画が削除・再生不可になった場合、手元の動画を選択する従来操作が残る。

**注意:** GitHub Releasesからのブラウザー内再生・シークは実機未検証です。ダウンロード強制やMIME/Rangeの挙動によって、iPhone Safari等で再生できない可能性があります。この段階では試験機能です。

## セキュリティと保存の性質

- このリポジトリとそのRelease動画は **公開**。URLを知らなくても第三者がアクセス可能。対戦相手名、ゲーム内ID、音声等が含まれる場合は公開に注意。
- 14日経過後の削除は即時保証ではない。スケジュール遅延、ワークフロー失敗、公開リポジトリ60日無操作時の自動無効化があり得る。
- 一度配信した動画を削除しても、第三者が取得済みのコピーは回収不能。
- コーチングJSONはURLフラグメント内に保持し、専用Releaseへは保存しない。ブラウザー履歴や共有したURLには情報が含まれる（暗号化されていない）。
- GitHubのReleaseアセットは通常のGit履歴に含まれない。保存上限はこの専用Releaseの**動画ファイルのみ**の合計。
- ChatGPTに添付された動画をReleaseへ自動転送する機能は未実装。アップロードは現段階ではユーザーが実施する。
- GitHub Freeの公開リポジトリと標準GitHub Actionsを利用。別の有料サービス、動画DB、独立課金契約は不要。
- GitHub側でReleaseのimmutability（不変化設定）が有効だと、削除が拒否される場合がある。

## 検証

`python3 -m unittest discover -s tests -v`

- 年齢超過を先に削除、容量超過時は古い動画から削除
- 上限ちょうどなら容量削除しない
- JSONと非動画アセットは削除しない
- `workflow_dispatch` の `dry_run=true` で削除予定だけ確認可能

公開ビューアの変更・期限削除・実機動画配信は異なる検証対象。**自動管理コードとブラウザー再生の実運用結果を混同しない**こと。
