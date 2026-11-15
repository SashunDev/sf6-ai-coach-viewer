# Phase B B0/B1 実現性検証 — Owner E2E Pending

Status: **SPIKE IMPLEMENTED / STATIC REVIEW PENDING / AUTHENTICATED E2E NOT RUN / iPHONE NOT TESTED**.

Issue: https://github.com/SashunDev/sf6-ai-coach-viewer/issues/16

## なぜこの検証を行うか

ユーザーは単なるYouTube動画再生ページを必要としていない。検証する価値は以下の2点。

- B0：自分のYouTube限定公開アップロードが、サムネイル付きで自動一覧表示されること
- B1：動画を一時停止し、**実際に表示される動画のコマを前後に1コマずつ進められること**。ゲームの1Fと時間・フレーム番号を一致させる要件ではない。現PoCの1/60秒シーク試験は、真のコマ送り操作ではない

本PoCは**既存の本番\`index.html\`に一切触れず**、\`spikes/\` 内に隔離した実験コード。正式なユーザー向けビューアではない。

## ファイル構成

- \`spikes/phase-b-feasibility.html\`：Google Identity Services OAuth + YouTube Data API + IFrame API のUI検証
- \`spikes/phase-b-probe-core.mjs\`：動画URL判定・本人限定公開フィルタ・時刻計算・ChatGPT引き継ぎ文字列
- \`spikes/phase-b-probe-core.test.mjs\`：Node標準ライブラリだけの合成テスト

ローカル静的テスト：\`node --test spikes/phase-b-probe-core.test.mjs\`。
ブラウザ構文、モック検証はCI workflowで別チェックする。**合成テストPASSは実際のGoogleアカウント・iOS再生精度PASSを意味しない。**


## 要件訂正：ゲーム内1Fではなく動画のコマ送り（2026-11-15）

本人の明示説明：「+-1Fはゲームの1フレームじゃなくて良いです。コマ送りが出来ればOKです。」

- **ゴール：** 映像を一時停止したまま「次のコマ」「前のコマ」を押すと、動画の次/前の表示フレームへ移動すること。ゲームの1/60秒との同期やSF6の技フレーム番号は不要。元映像が30fpsでも60fpsでも、映像のフレームとして進むことが判断基準。
- **現状：** GitHub Draft PR #17内の実装は`seekTo(now ± 1/60)`の時刻シークを検証するだけ。**真の動画コマ送りは未実装**。コードとUIから正確な1コマ操作だと誤認しない。
- **確認方法：** 停止した動きのある場面で1回押したときに隣の異なる静止画が見えるか、連続操作できるか、逆操作で直前の表示コマへ戻れるか、一時停止が維持されるか。APIが返す時刻だけでPASSにしない。コマを飛ばしたり同じ絵に留まればFAIL/APPROXIMATE。
- **公式仕様：** YouTube公式ヘルプはPCプレイヤーで停止中の「,」「.」をコマ送りと記載。[公式ヘルプ](https://support.google.com/youtube/answer/7631406?hl=ja)。公式[IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)は`seekTo`による時間移動を提供するが、独立したframeStep APIは公開していない。PCのキーボード機能を外部サイトからiPhone上で自動実行できると推測しない。
- **B1 Gate：** 「動画コマ送り」を満たせる手段が確認できるまではHOLD。B0の限定公開一覧が成立するかは独立評価する。元動画を本人がローカル選択する案は任意の別方式であり、YouTubeを勝手にダウンロード・複製するものではない。

## B0 Google OAuth 手順（本人が実機テストする場合のみ）

1. Google Cloudコンソールで個人のテスト用プロジェクトを使い、YouTube Data API v3を有効化。OAuth consent screen は **Testing** とし、自身を許可ユーザーに登録。不要なスコープは付けず、\`youtube.readonly\` だけを使用する。
2. ウェブアプリケーション用 OAuth クライアントID を新規発行し、**検証ページを置くHTTPSオリジンを Authorized JavaScript origins に登録**する。例：所有者のPages上で動作させる場合は \`https://sashundev.github.io\`。GitHub branchのHTMLはそのままでは公開Pagesに配備されない。**Pagesのmainや現在の本番配備を無断変更しない。**
3. クライアントIDのみ画面に入力する。**クライアントシークレット、APIキー、Google ID・パスワード、アクセストークンは共有・入力・Git登録しない。** クライアントIDは公開識別子だが、そのままIssue本文に載せる必要はない。
4. 本人が説明を確認して接続操作。内部フローは \`channels.list(mine=true,part=contentDetails)\` → \`playlistItems.list(part=contentDetails)\` → \`videos.list(part=snippet,status,contentDetails)\` で \`status.privacyStatus=unlisted\` のみ表示。
5. 本人がYouTube Studioで確認できる限定公開の実件数/タイトル（サンプル可）と画面の結果を比較。チャンネルが複数ある場合の対象・アップロード順・ページ送り・OAuthの再ログインを記録。テスト用上限は1チャンネル20ページ×50件。
6. 「連携解除」後に画面内容とメモリ上のトークンが破棄されるか確認。Googleアカウントの接続済みアプリ画面から権限取り消し可能。権限の再取得が必要なら同意を取り直す。

Google Cloudには通常のAPI無料クォータがあるが、プロジェクトに割当があるか実際のQuotasで確認する。**自動課金されないことを利用者側で確認してから接続**。新規の課金や有料認証を要求する場合は中断。

Google Identity Services Token Modelを用い、アクセストークンはブラウザメモリのみ。Googleのアップロード許可スコープやrefresh tokenは使用しない。YouTube動画自体のダウンロード・ストレージ保存はしない。

### B0 合格条件

- iPhone Safari HTTPS環境で本人がOAuthを承認できる
- 本人の限定公開動画が漏れなく一覧化される（調査上限があれば明示）
- 公開/非公開動画は一覧に混ざらない
- スクロール、サムネイル選択、アカウント切替、接続解除が実用的
- 追加の継続/従量課金・PC常時稼働なし
- OAuthのポリシー・プライバシー条件が個人利用で成立する

## B1 iPhone実機試験（Google認証なしでも可）

1. HTTPS配信された検証ページで手持ちの限定公開SF6動画を手入力（GitHubリポジトリに動画IDを登録しない）。
2. 再生開始後に一時停止。複数の動きがある箇所で±5秒、±1秒、±1/6秒、±1/60秒の時刻シーク試験を各方向で繰り返す。**この試験が通っても「コマ送り達成」とは呼ばない**。実コマ送り機構を別に用意できた場合は、1タップで動画の隣接する表示コマに移動して一時停止を維持するか、前後方向で繰り返し検証する。
3. API報告時刻だけでは判断せず、**静止画の動作変化が本当に1フレーム単位で起きたかを画面上で確認する**。再生済み/未バッファ箇所、動画中の異なる場面、iPhoneのOS・Safari版を分けて記録。
4. 0.5倍速・指定時刻（例 01:34.500）・ChatGPT引き継ぎコピーを確認。動画を開いた直後・再生中・一時停止中でシーク挙動が違う場合は明記。
5. 実画像や録画を保存する必要はない。可否と観測された現象をテキストで残す。

**判定規則：**
- EXACT：実際に各入力で期待する隣接フレームの表示を独立して検証できた場合のみ。ただし標準IFrame APIだけでは一般保証はできないため、特定環境での観測に限定する
- APPROXIMATE：時刻が動く/場面は変わるが、次の表示コマに正しく進んだとは言えない（時刻シーク試験の結果であり、コマ送りPASSではない）
- FAIL：ボタンが動作しない、同じフレームのまま、再生が不安定等

YouTube公式\`seekTo\`は、未バッファ位置では直前キーフレームへ移動するため、**実際のコマ送りができるとは証明できない**。YouTubeのPC版では動画一時停止中の「,」「.」が公式の前後フレーム操作だが、iPhoneの第三者IFrameサイトからこのキー操作を呼び出せるAPIは確認できない。動画の実コマ送りが必要なら別の許可された映像入力経路も別途検証する（YouTube動画の無断ダウンロードは禁止）。

## 未解決／検証Gate

- このChatGPTセッションでは本人のGoogle OAuth認可もiPhone Safariの目視検証も実施できない。自動テストはB0/B1の本番合格を証明しない。
- **本番Pages配備は禁止**。手動で試験する場合は認可済みの安全なHTTPSステージングサイトが必要（適切な配備先は別途レビュー）。
- 本試験には個人のGoogle OAuth設定が必要。既存SF6ReplayCoachのDesktop OAuthのClient SecretやトークンをこのWeb PoCへ流用しない。
- YouTube APIポリシー上、実運用前に規約・プライバシー表示と同意、データ削除/権限取消導線を十分に確認する。
- B0/B1のどちらかが目的を満たさない場合、単なる埋め込みビューアを製品化しない。Issue #16で設計判断を更新する。

## 公式参考資料

- https://developers.google.com/youtube/data/guides/implementation/videos
- https://developers.google.com/youtube/data/guides/authentication
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/youtube/data/reference/rest/v3/videos
- https://developers.google.com/youtube/iframe_api_reference
- https://developers.google.com/youtube/data/getting-started
- https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- https://developers.google.com/youtube/terms/developer-policies
