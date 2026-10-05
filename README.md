# しごと展望台

**公開URL:** https://ishibashm.github.io/job-board/

メール調査から得た求人情報のうち、公開して問題のない項目だけを掲載する静的ジョブボードです。日本語UIで、キーワード検索・掲載元フィルター・スマートフォン表示に対応しています。バックエンドやビルド処理はありません。

> このリポジトリは**公開用のミラー**です。編集元（source of truth）は非公開の管理用リポジトリに移りました。公開して問題のないファイルだけが自動で同期され、同期のたびに許可リストとプライバシーの検証が走ります。コミットは管理用リポジトリ側で行ってください（このリポジトリへ直接コミットしても次の同期で上書きされます）。

## ローカルで確認する

ブラウザーの `file://` では `data/jobs.json` を読み込めないため、このディレクトリで簡易HTTPサーバーを起動します。

```sh
python3 -m http.server 8000
```

その後、ブラウザーで `http://localhost:8000/` を開いてください。

## データ形式

公開データの契約は [`SPEC.md`](SPEC.md) に記載しています。`updatedAt` はデータセットの更新日時、`receivedAt` は求人情報の受信日時です。日時にはISO 8601形式を使用します。

掲載元 `source` には次の値を使用できます。

- `linkedin`（LinkedIn）
- `indeed`（Indeed）
- `agency`（人材紹介）
- `jobboard`（求人サイト）
- `direct`（企業採用）
- `other`（その他）

公開URLの許可対象は次の形式だけです。許可形式に変換できないURLは空文字になります。

- LinkedInの `/jobs/view/<数字>`
- Indeedの `https://jp.indeed.com/viewjob?jk=<16桁の16進文字>`
- BizReachの `/job-feed/public-advertising/<コード>/`

## Indeed の職種フィルター

Indeed 由来の求人は、IT・エンジニア・データベース関連の職種だけを掲載します（タイトルが許可キーワードに一致し、除外キーワードに一致しないもの）。この絞り込みは非公開モノレポ側の `config/job-filters.json` と `scripts/merge-jobs.mjs` で行い、**公開ミラーには載せません**。公開されるのは絞り込んだあとの `data/jobs.json` だけです。

## データ更新（公開ミラー）

日次更新処理は [`data/jobs.json`](data/jobs.json) 全体を、`SPEC.md` のデータ契約に従って上書きします。更新後は必ず検証を実行します。

```sh
node scripts/validate-jobs.mjs
```

追加パッケージは不要です。検証では必須フィールド、型、日時、ID重複、掲載元、URLの公開安全性、代表的な個人情報・非公開情報の混入を確認します。

## 日次マージ（非公開モノレポのみ）

マージCLI（`scripts/merge-jobs.mjs`）と職種フィルター（`config/job-filters.json`）は **モノレポ専用** です。公開許可リスト外のため、公開リポジトリへは同期されません。

1. 自動処理がメールから候補JSONを作成します（リポジトリ外・非公開）。
2. 非公開の禁止語ファイルを指定してマージを実行します。

   ```sh
   node scripts/merge-jobs.mjs <候補JSON> --deny-terms <非公開の禁止語ファイル>
   ```

3. 変更がなければ公開処理を行いません。
4. 変更があれば検証が成功したことを確認し、Pull Requestで `main` へ反映します。

`config/job-filters.json` の職種フィルターも適用されます。別の設定ファイルは `--filters <file>` で指定できます。標準では受信日時が60日より古い求人を自動で削除します。`--dry-run` / `--now <ISO>` / `--data <jobs.json>` / `--report <file>` も利用できます。

## 公開時のプライバシールール

- 氏名、メールアドレス、電話番号、個人宛ての敬称、個人メモ、メール本文を掲載しない。
- 公開求人ページ以外のURLを掲載しない。認証情報、トラッキング用クエリ、フラグメントは削除する。
- 認証・追跡トークンを含む文言は掲載しない。
- LinkedIn、Indeed、BizReachは上記許可形式だけを使用する。それ以外のURLは掲載しない（空文字にする）。
- BizReachの `/messages/` など、ログイン後の個人用ページは掲載しない。安全な公開URLに置き換えられない場合は `url` を空文字にする。
- 障害に関するセンシティブな文言、個人の属性を推測できる紹介サービス、パーソナライズされた文言を掲載しない。
- 勤怠、給与明細、契約更新など、求人ではなく個人向けの雇用管理通知を掲載しない。
- 非公開の禁止語ファイルに一致する候補は掲載しない。一致した語そのものはログやレポートへ出力しない。
- 不動産情報、ニュースレター、求人を特定できないダイジェスト、プレースホルダー求人を掲載しない。

## ファイル構成

```text
# 公開されるもの
index.html                 ページ本体
assets/styles.css          レイアウトとデザイン
assets/app.js              JSON読込・検索・絞り込み・描画
data/jobs.json             公開可能な求人データ
scripts/validate-jobs.mjs  データとプライバシーの検証
README.md / SPEC.md        ドキュメント

# モノレポ専用（公開しない・MONOREPO_ONLY）
config/job-filters.json    掲載元ごとの職種フィルター（Indeed IT 絞り込みなど）
scripts/merge-jobs.mjs     候補JSONの正規化・統合・期限管理
.public-github/            公開前チェックと Pages ワークフロー元
```
