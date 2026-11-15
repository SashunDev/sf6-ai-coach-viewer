# B0 OAuth setup — 本人のYouTube限定公開一覧の実機検証

Status: UI・モックAPI・Chromium表示テストはPASS。実Google認可・本人の動画一覧取得は未検証。

検証URL: https://sashundev.github.io/sf6-b1-safari-probe/b0.html
データ取扱説明: https://sashundev.github.io/sf6-b1-safari-probe/b0-privacy.html
関連Issue: https://github.com/SashunDev/sf6-ai-coach-viewer/issues/16

## Google Cloudで必要な本人操作

1. Google Cloud Consoleでテスト用プロジェクトを選ぶ（新規作成でもよい）。既存のDesktopアプリ用OAuthクライアントID/Client Secretを流用しない。新しいWebアプリ用Client IDを使う。
2. https://console.cloud.google.com/apis/library/youtube.googleapis.com でYouTube Data API v3を有効化する。
3. https://console.cloud.google.com/auth/branding のGoogle Auth Platformにアプリ名・サポートメールなどを設定する。データ取扱説明URLは上記b0-privacy.htmlを利用できる。
4. https://console.cloud.google.com/auth/audience のAudienceをExternal / Testingにし、自分のGoogleアカウントをTest usersへ追加する。テスト中の同意は有効期限などの制約がある。
5. https://console.cloud.google.com/auth/data-access で YouTube読み取り専用スコープ https://www.googleapis.com/auth/youtube.readonly のみ設定する。読み取りの権限は画面の限定公開フィルタより広く、本人のYouTubeデータの読み取りを許可する。
6. https://console.cloud.google.com/auth/clients からCreate client → Web applicationを作成する。Authorized JavaScript originsに正確に https://sashundev.github.io を追加（リポジトリ名のパスを含めない）。Token Modelはredirect URI不要。
7. 作成された公開識別子の Client ID だけをSafariでB0画面に入力。シークレット、APIキー、パスワード、Googleログインコード、アクセストークンはChatGPTやGitHubに入力しない。
8. 説明に同意後、Googleと連携して一覧取得を押し、Google公式のアカウント選択画面で本人のテストアプリ名と権限を確認。身に覚えがない表示なら承認せず中断。
9. YouTube Studioの限定公開アップロードと件数・タイトルを比較。公開/非公開は画面から除外、1チャンネル最大20ページ×50件を超える場合は一部のみと明記。
10. 終了後は一覧・接続を消去、必要に応じてGoogle側の権限を取り消す。Googleアカウントの連携管理は https://myaccount.google.com/connections から行える。

## 安全・費用・検証範囲

- Google Identity ServicesのJavaScriptはページ読み込み時にGoogleから取得する。デモ一覧は本人のYouTube Data APIにアクセスせず、OAuth許可も開始しない。
- Token Modelの短期アクセストークンと一覧はページのメモリだけで処理し、永続保存・YouTube動画ダウンロード・独自サーバーへの送信はしない。各ページはGitHub Pagesで公開されている。
- YouTube Data APIの通常の無料クォータ内でのGET系の利用を想定する。Google Cloudの課金有効化を求められた場合は追加せず中断し、Quotaや利用条件を確認する。
- GitHub Pagesはリポジトリごとに分けても同じ https://sashundev.github.io のJavaScriptオリジンを共有する。Web OAuthのAuthorized JavaScript originsはパス単位で制限できない。
- B0実機で限定公開一覧を取得できても、YouTube動画をHTML5プレイヤーに読み込んでコマ送りできるわけではない。B1の実機PASSは合成MP4のみ。

## 合格基準

- OAuth許可とアップロード一覧取得がiPhone Safariで成功する
- 本人の限定公開動画のみ表示される（公開・非公開は含めない）
- 検索・表示消去・権限取消が動作し、上限に達したら部分取得と表示される
- 追加課金やPC常時稼働が不要

公式資料: https://developers.google.com/identity/oauth2/web/guides/use-token-model ; https://developers.google.com/youtube/data/sample_requests ; https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
