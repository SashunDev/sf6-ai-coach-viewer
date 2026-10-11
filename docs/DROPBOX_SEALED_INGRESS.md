# Dropbox → GitHub Actions の公開鍵暗号化（本番移行）

## 目的と適用範囲

ChatGPTに**SF6の対戦リプレイ動画を1回添付**するだけで、ChatGPT側でコーチングJSONと動画を組み合わせたZIPを作成→Dropboxへ転送→GitHub Actionsが公開→動画・JSONの自動読込済みPages URLを返す。毎回の手動ZIP登録を要求しない。

- 投稿する動画は**ユーザーから明示的に公開を許可されたSF6リプレイのみ**。動画とコーチングJSONは公開後誰でも取得可能。個人的な映像や許可されていない素材を扱わない。
- Dropboxの一時URLを公開IssueへBase64で載せる**旧v1スキーマは完全拒否**。Base64は暗号化ではない。
- v2スキーマ：**PyNaCl SealedBox / Curve25519**によって一時URLだけを公開鍵暗号化。公開Issueには暗号文 `sealedUrl` と試合ID・サイズ・SHA-256・Dropbox content_hashだけを格納。短期URLも秘密鍵もログに出さない。
- 発行者の権限は従来どおりGitHubのIssue所有者 `SashunDev` に限定。公開鍵暗号の性質上、暗号文自体には送信者認証がない。GitHubのowner認可とソースファイル／JSON・MP4ハッシュ検査が必要。
- 最後にPagesのMP4・JSONをHTTP/MIME/全バイトSHA-256照合して初めてURL成功判定。成功後のIssue本文は安全なURLだけに書き換え・クローズ（編集履歴の完全削除は保証しない）。
- 秘密鍵未設定・復号失敗・旧v1・別URLホスト・ファイル改ざん・ZIP不一致は**FAIL CLOSED**。

## 初回の秘密鍵登録：ユーザー1回だけ

GitHub連携にはActions Secret登録機能がない。**ユーザー本人のWindows PC上で**安全に鍵を生成して登録する。チャットへの秘密鍵貼付は禁止。

準備：GitHub CLI `gh` へのログイン（`gh auth status`）、Pythonを使用できること。

```powershell
git clone https://github.com/SashunDev/sf6-ai-coach-viewer.git
cd sf6-ai-coach-viewer
py -m pip install PyNaCl==1.6.2
py scripts\bootstrap_dropbox_ingress.py --apply
```

※すでにリポジトリがある場合は `git clone` を省略し、`main` の最新を `git pull` で取得する。

実行スクリプトはランダムな秘密鍵をPCのメモリ内で生成し、標準入力を通じて**GitHub Actions repository secret** `SF6_DROPBOX_INGRESS_PRIVATE_KEY_B64` へ登録。対応する**公開鍵だけ**をGitHubの `.github/sf6_dropbox_ingress_public_key.b64` にcommitする。秘密鍵をファイルやチャットへ書き出さない。

- 途中で失敗した場合、部分登録が起きるため二重実行しない。Secretの有無をGitHub設定で確認し、必要ならSecretだけ削除してから再実行する。
- すでにSecret/公開鍵がある場合は**意図しない鍵ローテーションを拒否**。
- 公開鍵ファイル作成後にChatGPTからGitHub接続で公開鍵を取得できる（秘密鍵は取得できない）。
- GitHubのSecret設定画面：[Actions secrets](https://github.com/SashunDev/sf6-ai-coach-viewer/settings/secrets/actions)。Secretの値はここでも後から表示できない。

## 各リプレイの自動公開（鍵の初回設定後）

1. ChatGPTで既存のリプレイ→コーチングJSON v1→H.264/AAC MP4→同一match-id ZIP作成・SHA-256計算。
2. ChatGPTのDropbox連携でZIPを一時保存。Dropboxメタデータのサイズ、content_hashとファイルSHA-256を確認する。
3. Dropbox `download_link` で最大15分の**1回限りのダウンロードURL**を取得（HEADやプレビュー禁止）。GitHubにある公開鍵でURLをSealedBox暗号化し、ownerとしてGitHubに `SF6-PUBLISH <match-id>` Issueを作成。本文は `schemaVersion:2`, `sealedUrl`, `matchId`, `size`, `sha256`, `dropboxHash` のみ。
4. GitHub ActionsがSecretで復号し、一度だけGET、Dropboxホスト検証、サイズ・ハッシュ・ZIPのMP4/JSON整合・既存公開ファイルとの衝突検証を行い、GitHub Release → Pagesへ反映。
5. 公開検証がPASSしたらIssueコメントと本文に**検証済みの短いURL**を残して終了。ユーザーはChatGPTのURLを押すだけで動画・JSONが読み込み済みのビューアに進める。

## 検証Gate

- **コード**：PyNaCl 1.6.2固定のCI、暗号化往復・改ざん・異なる鍵・欠落Secret・v1拒否・owner拒否・Dropboxホスト制限・バイト単位照合を確認。
- **初回設定**：ユーザーがSecret登録、公開鍵commitを完了したことをGitHubで確認する。**秘密鍵はチャットに貼らない。**
- **本番E2E**：新規リプレイで暗号化v2 Issue → Release MP4/JSON → Pages HTTP一致 → iPhone Safariで読み込み、場面ジャンプ等を確認。
- **運用判定**：初回Secret設定前はv2自動公開は不能。**旧v1へ戻さない**。既存テリー戦の公開URLは引き続き参照可能。

暗号ライブラリ：https://pynacl.readthedocs.io/en/latest/public/
Secret管理：https://docs.github.com/ja/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
