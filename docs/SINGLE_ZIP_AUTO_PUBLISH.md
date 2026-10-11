# SF6 AI Coach — ZIP 1個で自動公開する方法

## 実行内容と現状

- **承認済みのSF6対戦リプレイのみ**。動画連動コーチングを明示依頼した試合に限定する。通常コーチングや私生活の録画は公開しない。
- 手動操作は**ZIPのRelease追加1回だけ**。JSON・MP4の個別追加や手動Actions実行は不要。
- GitHub Releaseが編集された場合に自動取り込みを試みる。イベントが届かなかった場合も**30分間隔のスケジュール**で再試行する（GitHub Actionsの遅延あり）。
- 自動処理：ZIP検査→動画形式・JSON検査→同一IDのMP4・JSONを専用公開Releaseへ追加→Pages workflow実行→動画・JSONの公開SHA-256／MIME照合→成功時だけZIP削除。
- 処理が失敗した場合、**未完了と判定**しZIPを残して次回に再試行する。未処理の専用一時ZIPは**48時間経過後の次の成功した定期処理で削除対象**（Actionsの停止・遅延があれば削除も遅れる）。JSONは削除しない。公開動画は従来の14日削除・容量ルールのまま。
- 公開MP4・JSONは第三者も閲覧・取得できる。ZIPも処理完了まで一時的に公開される。第三者がダウンロードしたコピーまでは自動削除できない。

## iPhoneからの操作

1. ChatGPTから提供された `sf6-coach-package-<試合ID>.zip` **1ファイル**を保存する。
2. [専用GitHub Release](https://github.com/SashunDev/sf6-ai-coach-viewer/releases/tag/sf6-ai-coach-media) を開く。
3. **Edit release** からZIPをアセットとして追加し **Update release** で保存する。iPhoneで見づらいときはSafariの「デスクトップ用Webサイトを表示」。既存アセットの削除や上書きは不要。
4. 以降はGitHub Actionsが実行する。[ZIP自動公開Actions](https://github.com/SashunDev/sf6-ai-coach-viewer/actions/workflows/auto-publish-match-package.yml) がPASSなら、短縮URL `https://sashundev.github.io/sf6-ai-coach-viewer/#id=<試合ID>` から開ける。**Actionsが成功する前にURLが有効だとは判断しない**。
5. iPhone Safariで動画とJSONが自動読み込みされ、7場面のタップ→シーク、区間再生・リピートができるか確認する。Safariの再生開始ボタンを押すことは正常だが、ファイル手動選択が必要ならE2E FAIL。

## テリー戦（今回の承認済みリプレイ）

- 試合ID `sf6-alex-terry-recoach-20261011`
- ZIP名称 `sf6-coach-package-sf6-alex-terry-recoach-20261011.zip`
- 中身：同じ試合IDの `.mp4` / `.json` と操作説明 `PUBLISH_README.txt`。
- 観察は7場面。ユーザー確認のR3スタン時SA3リーサル逃し、および起き上がりドライブリバーサルガード後のテリー2中Pパニッシュカウンター訂正を維持。

## 安全仕様／トラブル時

- ZIP名は厳格な `sf6-coach-package-<安全なID>.zip`。ZIPサイズ100MBまで。中身は必ず同じIDのMP4/JSON、任意で `PUBLISH_README.txt` のみ。パス／重複／シンボリックリンク／暗号化ZIP／展開過大を拒否。
- JSON v1、動画H.264（AACまたは無音）、動画長一致、Pages動画800MB／JSON1MB以内。
- 同名アセットがある場合、別の実動画・JSONへ無断上書きしない。途中まで公開されていれば既存ファイルSHA照合後に不足分だけ再開する。
- 本番公開リンクは配備成功後、実際にGitHub PagesへHTTPアクセスしてサイズ・SHA・MIMEの一致を確認できてから表示する。
- 失敗したら[自動公開Actions](https://github.com/SashunDev/sf6-ai-coach-viewer/actions/workflows/auto-publish-match-package.yml)のログで確認。48時間を超えたZIPは自動削除対象なので、修正後に新しいZIPを投入する。
- GitHub connectorからのバイナリアップロードは現状非対応のため、ChatGPTからの**ZIP送信そのものはできない**。専用公開Releaseへの1ファイル追加が必要となる。
- Gitコミット履歴、GitHub Issue/Actionsログ、Notionに実動画を保管しない。実動画や生成HTMLをテストfixtureとしてGitに含めない。

## Formal Gate

- CI PASS / main反映 ≠ 実戦動画公開済み。
- Actionsによる実試合MP4+JSONのHTTP検証PASSとユーザーのSafari実機確認後に、ChatGPTがIssue #3のFormal P4-C GOを判定。