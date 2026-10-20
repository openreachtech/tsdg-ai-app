# 本番デプロイ手順書 — 1.0.0（Google Cloud Run）

| | |
|---|---|
| **状態** | **通しで実行済み。** 実際のプロジェクトに対して端から端まで実行した。その実行が生んだ訂正はすべて、巻末の正誤表ではなく各手順そのものに織り込んである。不自然に見える手順は、たいてい素直な書き方が失敗したからそう書かれている |
| 対象環境 | production |
| 対象バージョン | 1.0.0 |
| イメージタグ | `1.0.0` が最初。`1.0.1` が Cloud SQL ソケットの修正、`1.0.2` がクライアントシークレットのローテーション（Part III）。製品バージョンは通して 1.0.0 である |
| 作成日 | 2026-09-29 |
| 改訂 | 2026-10-20、初回の本番実行の後 |
| 実装対象 | `specs/1.0.0/spec.md` — §7（非機能）、§17（`provider-layer`）、§19（`retention`）、§22（バージョン受け入れ基準） |
| ビルド種別 | **初回構築。** まだ何も稼働していないため、Part I は一度だけ、全手順を実行する |
| 許容ダウンタイム | リリースごとに数分。運用者と合意済み |

この文書は本番を**一行ずつ触る**ためのものである。各手順は、何を実行するか、成功したときに画面に何が出るか、そうでなかったとき何をするかを述べる。**特記のない限り、すべてのコマンドは Cloud Shell で実行する。**

**第 1 章より先に第 7 章を読むこと。** 着手を妨げるものはもう無いが、そこに挙げた 2 件は、これから設定する値そのものを左右する。

---

## Chapter 0 — 全員が読む章

### 0.1 構成

| 役割 | 実行するもの | 備考 |
|---|---|---|
| クライアント向け API | Cloud Run **サービス** | `/v1` 配下の REST 4 経路。クライアントが到達する唯一のもの。`$PORT` で待ち受ける |
| 実行ワーカー | Cloud Run **ワーカープール** | 実行キューを消費する。ポートを持たないためサービスではない |
| データベース | Cloud SQL for **MySQL 8** | `mariadb` ドライバで接続する。Cloud SQL コネクタ経由 |
| キュー | **Memorystore for Redis**、VPC 内 | BullMQ。実行キュー、コールバックキュー、保持期間の 3 つのスケジュールを保持する |
| モデル提供者 | **Vertex AI、ワーカー自身の ID で** | `@google/genai` を `vertexai: true` で使い、`VERTEX_AI_PROJECT_ID` と `VERTEX_AI_LOCATION` で孛先を決める。鍵はどこにも無い。`GEMINI_API_KEY` はこの 2 つが揃わないときだけドライバが読む退避路である — 1.16 参照 |
| シークレット | **Secret Manager** | 環境変数として注入する |

**プロセスが 2 つに分かれているのは意図的である。** バックエンドの `pm2.config.cjs` が理由を述べている。実行はモデルを呼び、ファイルを取得する。そのどちらも §7 が実行に許した 300 秒を要しうる。リクエストを開いたまま保持できる時間をはるかに超える。API は実行キーとともに `202` を返して投入し、ワーカーが消費する。両者は 1 つの Redis と 1 つのデータベースを読む。

**API サービス以外は一切公開しない。** §7 は、すべてのリクエストが署名され、公開経路もヘルスチェックもゲスト許可リストも存在しないと述べている。

**すべての設定は `NODE_ENV=production` の下で、両プロセスに環境変数として届く。** この名前のとき `@openreachtech/renchan-env` は作業ディレクトリの素の `.env` を探し、**無ければ例外を投げる**（`DotenvLoader.js:49` が dotenv のエラーを再送出する）。一方で `.env.production` は一切読まない。したがってイメージは**空の `.env`** を持ち、実際の値はすべてプロセス環境から来る。プロセス環境はファイルより優先される。

### 0.2 プレースホルダ

何かを実行する前に、この表を自分の値で埋めてから読み進めること。以下に現れる `<...>` はすべてここの値である。

| 記号 | 意味 | 例 |
|---|---|---|
| `<PROJECT_ID>` | GCP プロジェクト ID | `example-ai-prod` |
| `<REGION>` | リージョン | `asia-northeast1` |
| `<AR_REPO>` | Artifact Registry のリポジトリ名 | `tsdg-ai` |
| `<SQL_INSTANCE>` | Cloud SQL インスタンス名 | `tsdg-db` |
| `<SQL_CONNECTION>` | Cloud SQL 接続名、1.3 で取得 | `example-ai-prod:asia-northeast1:tsdg-db` |
| `<REDIS_HOST>` | Memorystore のアドレス、1.4 で取得 | `10.12.0.3` |
| `<VPC_CONNECTOR>` | サーバレス VPC コネクタ名。API サービスが使う | `tsdg-connector` |
| `<VPC_NETWORK>` | ワーカープールが直接参加する VPC ネットワーク、1.4 で取得 | `default` |
| `<VPC_SUBNET>` | そのネットワーク内のサブネット | `default` |
| `<TAG>` | デプロイするバージョンのタグ | `1.0.0` |
| `<API_URL>` | API サービスの URL、1.9 で取得 | `https://tsdg-api-xxxxx.a.run.app` |
| `<CLIENT_HOSTS>` | メディア取得を許可するホスト | `files.example.com,storage.example.com` |

### 0.3 運用者が手元に用意するもの

- プロジェクトに対する Cloud Shell：`gcloud config set project <PROJECT_ID>`。`gcloud`、`docker`、`git` は既に入っている
- マイグレーションとスケジュール登録のための Cloud Shell 上の Node 24：`nvm install 24`（バックエンドの要件は `>=22.18.0`）
- バックエンドリポジトリへの読み取り権限
- **モデル提供者のために手元に用意するものは無い。** ワーカーは自身のサービスアカウントとして Vertex AI を呼ぶため、この手順に持ち込む鍵も、保管する鍵も、後で失効させる鍵も存在しない — 1.16 参照

### 0.4 必要な権限

| ロール | 対象 | 用途 |
|---|---|---|
| `roles/run.admin` | プロジェクト | サービスとワーカープールのデプロイ |
| `roles/artifactregistry.writer` | リポジトリ | イメージの push |
| `roles/cloudsql.admin` | プロジェクト | インスタンス作成。以後は `client` で足りる |
| `roles/redis.admin` | プロジェクト | Memorystore の作成 |
| `roles/secretmanager.admin` | プロジェクト | シークレットの書き込み。以後は `secretAccessor` で足りる |
| `roles/iam.serviceAccountUser` | 実行用サービスアカウント | そのアカウントとしてデプロイする |

### 0.5 所要時間

| | |
|---|---|
| Part I、初回構築 | 約 90 分。うち Cloud SQL が無人で 10〜15 分 |
| Part II、リリース 1 回 | 約 15 分。うち大半はイメージのビルド |

### 0.6 ダウンタイムの約束

**リリースごとに数分は許容する。** API はリビジョン単位で置き換わるため、処理中のリクエストは完了する。ワーカープールも同様である。再起動中も投入済みの実行は**失われない** — それは Redis 上のレコードであり、次に起動したワーカーが拾う。置き換えの間にクライアントが見るのは、最悪の場合でも新規リクエストの接続エラーであり、それはクライアント側の再試行が吸収する。

---

## Part I — 初回構築（一度だけ）

### 1.1 第 7 章を読む

**目的。** 着手を妨げるものは無いが、そこに挙げた 2 件は、これから設定する値を左右する。後から変えるより今適用するほうが安い。

**前提。** なし。

**コマンド。** 第 7 章を読む。

**期待される出力。** 該当なし — これは読むための手順である。

**失敗したとき。** 該当なし。

**巻き戻し。** 該当なし。

**サービスを中断するか。** しない。

### 1.2 API を有効化する

**目的。** これ無しでは以降すべてが失敗する。しかもエラーは手順ではなく API の名前を告げる。

**前提。** 0.4 のロール。

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  secretmanager.googleapis.com \
  vpcaccess.googleapis.com \
  cloudbuild.googleapis.com \
  aiplatform.googleapis.com
```

**期待される出力。** `Operation "operations/..." finished successfully.` 既に有効な API を有効化しても何も出ず、それはエラーではない。

**モデル呼び出しが必要とするのは `aiplatform.googleapis.com` である**（0.1）。無効のままでもビルドもデプロイも通る。最初の実際の実行が提供者呼び出しで失敗する — ここから遠く離れた場所で、API の欠落ではなく実行の失敗として報告される。

**失敗したとき。** `PERMISSION_DENIED` は 0.4 のロールを持っていないことを意味する。課金が無効だと `FAILED_PRECONDITION` になる。

**巻き戻し。** 不要。API の有効化はデータを変更しない。

**サービスを中断するか。** しない。

### 1.3 Cloud SQL を作成する

**目的。** すべての行が置かれるデータベース。

**前提。** 1.2。

```bash
gcloud sql instances create <SQL_INSTANCE> \
  --database-version=MYSQL_8_4 \
  --edition=ENTERPRISE \
  --tier=db-custom-2-7680 \
  --region=<REGION> \
  --storage-auto-increase \
  --backup-start-time=18:00

gcloud sql databases create tsdg_ai --instance=<SQL_INSTANCE>

# コマンドの中ではなく変数に生成する。コマンドが戻った後でも読めるように
DATABASE_PASSWORD="$(openssl rand -base64 32 | tr -d '\n')"
printf '%s\n' "$DATABASE_PASSWORD"

gcloud sql users create tsdg_app \
  --instance=<SQL_INSTANCE> \
  --password="$DATABASE_PASSWORD"

gcloud sql instances describe <SQL_INSTANCE> --format='value(connectionName)'
```

**期待される出力。** 最後のコマンドが `<PROJECT_ID>:<REGION>:<SQL_INSTANCE>` を表示する。**これを 0.2 の `<SQL_CONNECTION>` に書き込むこと。** 作成には 10〜15 分かかり、`Creating Cloud SQL instance...done.` と表示される。

**`--edition` を明記するのは、既定値を前提にできないからである。** `db-custom-*` 系のティアは Enterprise エディションのもので、このフラグ無しに作成すると Enterprise Plus に配置され得る。そこはそのティアを拒否し、コマンドは失敗する。一行でこの疑問が消える。

**パスワードはコマンドの中ではなく変数に生成する。** `--password="$(openssl rand -base64 32)"` と書くと、その値はコマンド置換の中にしか存在せず、コマンドが戻った瞬間に失われる — そして 1.6 はそれを必要とする。`tr -d '\n'` も飾りではない。1.6 が、同じ文字の欠落がクラッシュループを招いた場所である。

**失敗したとき。** 削除済みの名前は 1 週間再利用できない。別の名前を選ぶこと。

**巻き戻し。** `gcloud sql instances delete <SQL_INSTANCE>`。**データが入った後は取り返しがつかない。**

**サービスを中断するか。** しない — まだ何も稼働していない。

### 1.4 VPC コネクタと Memorystore を作成する

**目的。** Redis はキューと保持スケジュールを保持する。Memorystore は公開アドレスを持たないため、Cloud Run はサーバレス VPC コネクタ経由で到達する。

**前提。** 1.2。

```bash
gcloud compute networks vpc-access connectors create <VPC_CONNECTOR> \
  --region=<REGION> \
  --range=10.8.0.0/28

gcloud redis instances create tsdg-redis \
  --size=1 \
  --region=<REGION> \
  --redis-version=redis_7_0

gcloud redis instances describe tsdg-redis --region=<REGION> \
  --format='value(host)'
```

**期待される出力。** 最後のコマンドが `10.12.0.3` のようなプライベートアドレスを表示する。**これを 0.2 の `<REDIS_HOST>` に書き込むこと。**

**失敗したとき。** `Range is already in use` は他のコネクタが `10.8.0.0/28` を保持していることを意味する。空いている `/28` を選ぶこと。

**巻き戻し。** 両方を削除する。Redis の削除は投入済みジョブと登録済みスケジュールをすべて破棄する。スケジュールは 1.12 で再登録する。

**サービスを中断するか。** しない。

### 1.5 Artifact Registry のリポジトリを作成する

**目的。** イメージを push する先。

**前提。** 1.2。

```bash
gcloud artifacts repositories create <AR_REPO> \
  --repository-format=docker \
  --location=<REGION>
```

**期待される出力。** `Created repository [<AR_REPO>].`

**失敗したとき。** `ALREADY_EXISTS` なら問題ない。次へ進む。

**巻き戻し。** `gcloud artifacts repositories delete <AR_REPO> --location=<REGION>`。

**サービスを中断するか。** しない。

### 1.6 シークレットを Secret Manager に置く

**目的。** 次の 2 つの値は、コマンドラインにも、リポジトリ内のファイルにも、コンソールで設定した Cloud Run の環境変数にも、決して現れてはならない。

**前提。** 1.2 と、1.3 の Cloud SQL パスワード。

```bash
# 1.3 の Cloud SQL パスワード
printf '%s' '<the password>' | gcloud secrets create tsdg-database-password --data-file=-

# 32 バイトを 64 桁の 16 進数で。各クライアントの署名シークレットを保存時に暗号化する鍵。
# 16 進数かつこの長さでなければならない。ApiClientSecretCipher が名指しで拒否するため、
# ここに base64 の値を入れると、この手順ではなく最初のリクエストで失敗する。
#
# この行が奇妙に見える理由は `tr -d '\n'` に尽きる。そしてこれは任意ではない。
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create tsdg-client-secret-key --data-file=-

# 何かがマウントする前に読み戻す。64。65 ではない
gcloud secrets versions access latest --secret=tsdg-client-secret-key | wc -c
```

**期待される出力。** `Created version [1] of the secret [...]` が 2 回、その後 `64`。

**`tsdg-client-secret-key` の末尾の改行 1 文字がワーカーをクラッシュループさせる。経路はこうである。** `openssl rand -hex 32` は出力の末尾に改行を付ける。Secret Manager は渡されたバイトをそのまま保存する。Cloud Run は保存されたとおりに環境変数へ渡す。結果、プロセスは 64 文字を要求する場所で 65 文字を読む。`ENCRYPTION_KEY_PATTERN` は `/^[0-9a-f]{64}$/iu` — アンカー付きで `m` フラグは無く、JavaScript の `$` はシェルの比較のように末尾の改行を見逪してはくれない。コンテナは起動時に `API_CLIENT_SECRET_ENCRYPTION_KEY must be 64 hex characters, the 32 bytes AES-256-GCM takes` で終了し、再試行のたびに同じことを繰り返す。その間、隣の API サービスは健全に見える。**これは本番の実行で起きた**。上の `wc -c` の行が助言でなく手順の一部であるのはそのためである。

**この手順書の最初の稿が 4 つ作っていたところを、2 つにしてある。** 落とした 2 つはどちらも空のプレースホルダであり、空のシークレットは存在しないシークレットより悪い — マウントするもの、権限を与えるもの、そして忘れるものが 1 つ増えるだけである：

| 落としたもの | 理由 |
|---|---|
| `tsdg-redis-password` | ここの Memorystore は AUTH 無効で動き、`RedisConnection.generatePassword()` は変数が無ければ `null` を返す。「AUTH を送らない」は既に起きていることであり、空のシークレットをマウントしても読み取りが 1 つ増えるだけである |
| `tsdg-gemini-api-key` | ワーカーは自身として Vertex AI 経由で Gemini に到達する（0.1、1.16）ので、鍵は決して読まれない。ここで作って後から中身を入れたものは、何も参照しない生きた資格情報である — まさに、誰も失効を思い出さない種類のものである |

**鍵への退避が必要になったときは**、その時点でシークレットを作り、その時点でマウントすればよい。ドライバは Vertex を優先し、`VERTEX_AI_PROJECT_ID` と `VERTEX_AI_LOCATION` が両方揃わないときに限って鍵を読む。

**`tsdg-client-secret-key` は、全クライアントのシークレットを再暗号化せずに変更できない。** 一度生成したら、軽々しくローテーションしないこと — 7.3 参照。

**失敗したとき。** `ALREADY_EXISTS` はシークレットが既に在ることを意味する。代わりに `gcloud secrets versions add <name> --data-file=-` でバージョンを追加すること。

**巻き戻し。** `gcloud secrets delete <name>`。取り返しがつかない。

**サービスを中断するか。** しない。

### 1.7 実行用サービスアカウントを 2 つ作成する

**目的。** API とワーカーは必要なものが異なる。モデル提供者を呼ぶのはワーカーだけであり、保持期間の掃引を走らせるのもワーカーだけである。

**前提。** 1.2。

```bash
gcloud iam service-accounts create tsdg-api    --display-name='tsdg API'
gcloud iam service-accounts create tsdg-worker --display-name='tsdg worker'

for ROLE in roles/cloudsql.client roles/secretmanager.secretAccessor; do
  for SA in tsdg-api tsdg-worker; do
    gcloud projects add-iam-policy-binding <PROJECT_ID> \
      --member="serviceAccount:${SA}@<PROJECT_ID>.iam.gserviceaccount.com" \
      --role="$ROLE" >/dev/null
  done
done

# モデルを呼ぶのはワーカーだけで、それは自身として呼ぶ
gcloud projects add-iam-policy-binding <PROJECT_ID> \
  --member="serviceAccount:tsdg-worker@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user" >/dev/null
```

**期待される出力。** `Created service account [...]` が 2 行、その後ループは無言で走る。

**API キーの代わりになるのが、ワーカーだけに与えた `roles/aiplatform.user` である。** これが提供者の資格情報のすべてである。ここで付与されたが最後で、書き留められることも、保管されることも、ローテーションされることも無い。API サービスには与えない。API サービスはモデルを呼ばないからである。

**失敗したとき。** バインディングでの `PERMISSION_DENIED` は `roles/resourcemanager.projectIamAdmin` を持っていないことを意味する。

**巻き戻し。** 両アカウントを削除する。

**サービスを中断するか。** しない。

### 1.8 イメージをビルドして push する

**目的。** 1 つのイメージで API とワーカーの両方を走らせる。異なるのはデプロイごとのコマンドだけである。

**前提。** 1.1（Dockerfile は 7.1 の一部）、1.5、そして `<TAG>` をチェックアウトしたバックエンド。

```bash
cd tsdg-ai-backend
git fetch --tags && git checkout <TAG>

gcloud builds submit \
  --tag <REGION>-docker.pkg.dev/<PROJECT_ID>/<AR_REPO>/tsdg-ai-backend:<TAG>
```

**期待される出力。** 末尾に `STATUS: SUCCESS` と push されたダイジェスト。

**失敗したとき。** コマンドが示すビルドログを読むこと。イメージ内に `.env` が無い場合、このサービスはビルド時ではなく**実行時**に失敗する — 0.1 参照。

**巻き戻し。** 不要。使われないイメージはストレージを消費するだけである。

**サービスを中断するか。** しない。

### 1.9 API サービスをデプロイする

**目的。** クライアントに面する側。

**前提。** 1.3、1.4、1.6、1.7、1.8。

```bash
# すべての値を 1 つのファイルに。行継続が輸送中に失われようがないように
cat > ~/api-env.yaml <<'YAML'
NODE_ENV: production
DATABASE_NAME: tsdg_ai
DATABASE_USERNAME: tsdg_app
DATABASE_DIALECT: mariadb
DATABASE_HOST: /cloudsql/<SQL_CONNECTION>
DATABASE_PORT: '3306'
REDIS_HOST: <REDIS_HOST>
REDIS_PORT: '6379'
MEDIA_FETCH_ALLOWED_HOSTS: <CLIENT_HOSTS>
VERTEX_AI_PROJECT_ID: <PROJECT_ID>
VERTEX_AI_LOCATION: <REGION>
YAML

# 1 行で。行継続を使わない
gcloud run deploy tsdg-api --image=<REGION>-docker.pkg.dev/<PROJECT_ID>/<AR_REPO>/tsdg-ai-backend:<TAG> --region=<REGION> --service-account=tsdg-api@<PROJECT_ID>.iam.gserviceaccount.com --set-cloudsql-instances=<SQL_CONNECTION> --vpc-connector=<VPC_CONNECTOR> --no-allow-unauthenticated --env-vars-file=$HOME/api-env.yaml --set-secrets=DATABASE_PASSWORD=tsdg-database-password:latest,API_CLIENT_SECRET_ENCRYPTION_KEY=tsdg-client-secret-key:latest

gcloud run services describe tsdg-api --region=<REGION> --format='value(status.url)'

# リビジョンが実際に持っている数を数える。11 であって 6 ではない
gcloud run services describe tsdg-api --region=<REGION> --format='value(spec.template.spec.containers[0].env[].name)' | tr ';' '\n' | wc -l
```

**期待される出力。** `Service [tsdg-api] revision [tsdg-api-00001-abc] has been deployed and is serving 100 percent of traffic.` 最後のコマンドが URL を表示する。**これを 0.2 の `<API_URL>` に書き込むこと。**

**環境変数をファイルにし、デプロイを 1 行にするのは、素直な書き方が何をするかのためである。** `--set-env-vars` を十数個バックスラッシュで繋いだブロックを貼ると、貼り付けテキストがそうであるようにバックスラッシュが 1 つ失われる。そしてその欠落は静かである：シェルは壊れた行をコマンドの終わりと受け取り、それ以降はすべて落ち、デプロイは**成功し**、リビジョンは 11 書いたところを 6 だけ持って立ち上がる。本番の実行で起きたのはこれで、症状はこの手順でのエラーでなく、起動しないワーカーであった。ファイルは行を失わないし、`--env-vars-file` は集合をマージではなく丸こと置き換える。上の数える行が、ファイルの言ったものがリビジョンに届いたかを告げる。

**YAML 内の数値はクォートする。** `DATABASE_PORT: 3306` は YAML パーサにとって整数であり、このフラグは文字列を要求する。`'3306'` は文字列である。Redis のポートも同じ。

**`REDIS_TLS` と `REDIS_PASSWORD` は意図して無い。** Redis は VPC 内にあり AUTH は無効で、どちらの読み手も、変数が無いことを欠落でなく決定として扱う — パスワードは `null`、輸送は TLS なし。`REDIS_TLS=` と空値を置くのは同じことを曙昧に言っているだけであり、コンマ区切りの `--set-env-vars` 列の中の空値はそれ自体が別の罠である。

**`--add-` ではなく `--set-cloudsql-instances` を使う。** `--add-` は追加するので、2 度目のデプロイで同じインスタンスが 2 回並ぶ。無害であり、その後のあらゆる `describe` に永続的に残る雑音でもある。

**`MEDIA_FETCH_ALLOWED_HOSTS` を空のままにすると、あらゆるメディア URL が拒否され**、すべての実行が `MEDIA_UNREADABLE` で `failed` となり、モデル呼び出しは 0 回になる。それは許可リストが機能している証拠であって欠陥ではない — が、空の値は「何一つ成功しない」を静かに意味する。スモークチェックの前に設定すること。

**失敗したとき。** `Revision is not ready` はたいていコンテナが起動時に終了したことを意味する。`gcloud run services logs read tsdg-api --region=<REGION> --limit=50` を読むこと。このサービスの起動失敗は `.env` の欠如と `NODE_ENV` の欠如の 2 つである。

**巻き戻し。** `gcloud run services delete tsdg-api --region=<REGION>`。

**サービスを中断するか。** しない — まだ何も稼働していない。

### 1.10 ワーカープールをデプロイする

**目的。** 実行を処理する側。ポートを持たない。

**前提。** 1.9。

```bash
# 1.9 と同じ 11 つの値。サービスとワーカープールは別々に設定されるので、
# 共有するのではなくもう一度渡す
cp ~/api-env.yaml ~/worker-env.yaml

# 1 行で。行継続を使わない
gcloud beta run worker-pools deploy tsdg-worker --image=<REGION>-docker.pkg.dev/<PROJECT_ID>/<AR_REPO>/tsdg-ai-backend:<TAG> --region=<REGION> --service-account=tsdg-worker@<PROJECT_ID>.iam.gserviceaccount.com --set-cloudsql-instances=<SQL_CONNECTION> --network=<VPC_NETWORK> --subnet=<VPC_SUBNET> --vpc-egress=private-ranges-only --command=node --args=scripts/startJobDaemon.js --instances=1 --env-vars-file=$HOME/worker-env.yaml --set-secrets=DATABASE_PASSWORD=tsdg-database-password:latest,API_CLIENT_SECRET_ENCRYPTION_KEY=tsdg-client-secret-key:latest
```

**期待される出力。** `Worker pool [tsdg-worker] has been deployed.`

**ワーカープールはサービスが取るフラグを取らない。** `worker-pools deploy` は `--vpc-connector` と `--min-instances` を**その場で拒否する**。VPC にはネットワークとサブネットで直接参加し、インスタンス数のフラグ名も異なる。1.9 のコマンドを写して名詞だけ変えると、2 度失敗してから通る：

| サービスが取る | ワーカープールが取る |
|---|---|
| `--vpc-connector=<VPC_CONNECTOR>` | `--network=<VPC_NETWORK> --subnet=<VPC_SUBNET> --vpc-egress=private-ranges-only` |
| `--min-instances=1` | `--instances=1` |

**`--instances=1` は任意ではない。** ゼロにスケールしたワーカープールはキューを消費しないため、`202` で受理された実行は、何かがスケールアップするまで Redis に留まり続ける。

**失敗したとき。** `worker-pools` を指定した同じログコマンドで確認する。隣の API サービスが平常に応答しているのに、プールだけが数秒で起動と死を繰り返す場合は、1.6 の末尾の改行である — 他を見る前に、鍵の名前が出ているログを読むこと。

**巻き戻し。** ワーカープールを削除する。投入済みの実行は Redis に残り、復帰時に再開する。

**サービスを中断するか。** しない。

### 1.11 スキーマを作成する

**目的。** マイグレーションが全テーブルを構築する。これより前は何も動かない。

**前提。** 1.3 と、Cloud Shell 上の Node 24。

```bash
cd tsdg-ai-backend
npm ci

# Cloud SQL Auth Proxy。sequelize-cli が Cloud Shell からインスタンスに到達するために使う。
# Cloud Shell には同梱されていないため、一度だけ取得する。
curl -sSLo cloud-sql-proxy \
  https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.1/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy
./cloud-sql-proxy <SQL_CONNECTION> &

export NODE_ENV=production
export DATABASE_HOST=127.0.0.1 DATABASE_PORT=3306
export DATABASE_NAME=tsdg_ai DATABASE_USERNAME=tsdg_app
export DATABASE_PASSWORD='<the password from 1.3>'
export DATABASE_DIALECT=mariadb
touch .env   # NODE_ENV=production では renchan-env がこれを要求する

# ここでは 127.0.0.1 がホストで、あちらでは /cloudsql/... がソケットである。
# 1 つの設定が両方を兼ねる：DatabaseDialectOptionsBuilder は "/" で始まる値を
# ソケットパスとし、それ以外をホストとして扱う

npx sequelize-cli db:migrate
```

**期待される出力。** マイグレーションごとに `== <timestamp>-<name>: migrated (0.0xxs)` が 1 行、最後までエラー無し。2 回目の実行では `No migrations were executed, database schema was already up to date.` と表示される。

**失敗したとき。** `ER_ACCESS_DENIED_ERROR` はユーザまたはパスワードの誤りを意味する。途中で失敗したマイグレーションは、それより前の分は適用済みのまま残る。原因を直して再実行すれば `db:migrate` は続きから再開する。

**巻き戻し。** `npx sequelize-cli db:migrate:undo` で 1 つ戻る。**`npm run db:teardown` は使わないこと。中身は `rm sequelize/storage/*.sqlite3` であり、ここでは何の意味も持たない。**

**サービスを中断するか。** 初回以降はする — スキーマ変更と稼働中のコードは互換でなければならない。この初回構築では何も稼働していない。

### 1.12 マスタデータを投入する

**目的。** 区分、状態、提供者、モデル、そしてエージェントとモデルの結び付け。**この結び付けの行が無ければ、エージェントはそもそも呼び出せない。**

**前提。** 1.11 と、同じ環境変数。

```bash
npx sequelize-cli db:seed:all --seeders-path sequelize/seeders/master
```

**期待される出力。** シーダごとに `== <timestamp>-<name>: migrated` が 1 行、全 16 件。

**`npm run db:seed:master` は実行しないこと。** その名に反して、このスクリプトは開発用の複製である `sequelize/seeders/dev-master` を指している。本番のマスタデータは `sequelize/seeders/master` であり、上記のように明示的に指定しなければならない。7.3 参照。

**`sequelize/seeders/development` は本番の近くで絶対に実行しないこと。** 実行、メディア、そして署名シークレットが公開リポジトリに載っている API クライアントを投入してしまう。

**失敗したとき。** 重複キーはシーダが既に走ったことを意味する。`SELECT COUNT(*) FROM ai_models;` で確認すること — `stub` と `gemini-2-5-flash` の 2 行である。

**巻き戻し。** `npx sequelize-cli db:seed:undo:all --seeders-path sequelize/seeders/master`。

**サービスを中断するか。** しない。

### 1.13 保持期間のスケジュールを登録する

**目的。** 保持期間の 3 つの掃引は、プロセスではなく **Redis 上のレコード**である。自動で登録されるものは何も無く、この手順を飛ばしたデプロイは、保持期間が一度も発火しないサービスを走らせることになる。それは数週間後に、§19 が消えていると述べたデータとして表面化する。

**前提。** 1.4 と、実行する場所から Redis に到達できること。

```bash
export REDIS_HOST=<REDIS_HOST> REDIS_PORT=6379 REDIS_PASSWORD=''
npm run schedulers:start
```

**期待される出力。** このスクリプトはすべての応答を検査し、**登録できなかったスケジュールがあれば例外を投げる**。したがって終了コード 0 での正常終了が成功の合図である。独立に確認すること：

```bash
redis-cli -h <REDIS_HOST> --scan --pattern 'bull:purge-*'
```

3 つのキューが現れる：`purge-expired-provider-uploads`、`purge-expired-run-content`、`purge-expired-run-traces`。

**失敗したとき。** スクリプトが失敗したスケジュールを名指しする。失敗ではなく応答が止まる場合は Redis に到達できておらず、`maxRetriesPerRequest: null` が待ち続けている。VPC コネクタを確認すること。

**再実行は安全であり**、cron 式を変更したときはこれが適用手段である。ただし `schedulerId` 自体を変えると、代わりに**もう 1 つ**スケジュールが登録され、元のものが孤児となって、誰も知らない名前で永久に発火し続ける。戻す手段は `npm run schedulers:stop` であり、改名の**前**に、古い ID で実行しなければならない。

**巻き戻し。** `npm run schedulers:stop`。

**サービスを中断するか。** しない。

### 1.14 最初の API クライアントを発行する

**目的。** 暗号化された署名シークレットと登録済みコールバック URL 接頭辞を持つ行が `api_clients` に存在するまで、このサービスは誰からも呼び出せない。

**前提。** 1.11、1.12、1.11 の Cloud SQL プロキシが動作中であること、そして同じ環境変数 — 1.6 で Secret Manager に入れた値である `API_CLIENT_SECRET_ENCRYPTION_KEY` を含む。

```bash
export API_CLIENT_SECRET_ENCRYPTION_KEY='<the 64 hex characters from 1.6>'

node scripts/registerApiClient.js '<the client's name>' '<their callback URL prefix>'
```

**期待される出力。**

```
Registered.

  name                 <the client's name>
  callback URL prefix  https://api.example.com/callbacks/
  client key           <48 hex characters>
  secret               <43 characters>
```

**表示されたシークレットをその場で控えること。** これは暗号化して保存され、モデルの既定スコープはその列を選択せず、このリポジトリのどこにも復号して表示するものは無い。この出力がクライアントにとって唯一の控えである。この端末のスクロールバック以外の手段で引き渡すこと。失ったシークレットは、新しいクライアントを発行して置き換えるものであり、取り戻すものではない。

**コールバック接頭辞はラベルではなく制御である。** 実行の終端コールバックは、これで始まる URL にのみ送信される。それ以外は `unregistered-callback-url` として拒否され、送信されない。必要より広い接頭辞は、結果が送られうる場所がそれだけ広いということである。

**失敗したとき。** 絶対 `http(s)` URL でスラッシュ終わりでない接頭辞は拒否され、理由を表示して**終了コード 1 で終わる** — ラッパースクリプトが拒否と成功を区別できる。64 桁の 16 進数でない `API_CLIENT_SECRET_ENCRYPTION_KEY` は、最初のリクエストではなくこの手順で名指しで拒否される。

**巻き戻し。** 行を削除する。そのクライアントは呼び出せなくなる。

**サービスを中断するか。** しない。

### 1.15 スタブでのスモークチェック — 提供者の前に、経路そのものを

**目的。** 誰かが依存する前に、そして提供者が間に入る前に、通しの一巡が動くことを証明する。これは §22 の第 1 受け入れ基準を本番に対して実行するものである。

**ここでスタブが応答するのは、ここだけの話である。** 新規インストールは設計上スタブに結び付いており、この手順は数分だけそのままにしておく理由そのものである。署名、データベース、キュー、ワーカー、メディア取得、署名付きコールバックを、**デプロイの外側を一切介さずに**動かす。これが通って 1.16 が失敗すれば、原因は提供者か鍵であり、考えるまでもなくそう分かる。いきなり 1.16 に進むと、あらゆる失敗が曖昧になり、経路を証明するために費用と顧客の写真を使うことになる。

**これは最終状態ではない。** Part I が完了するのは 1.16 であって、ここではない。

**前提。** 1.9 から 1.14 まで。

```bash
# 1. 署名の無いリクエストは拒否される
curl -s -o /dev/null -w '%{http_code}\n' <API_URL>/v1/ai-runs
# 期待値: 401

# 2. 署名されたリクエストは実行を作成する
#    signature = HMAC-SHA256(secret, "<timestamp>.<raw body>")、16 進数
curl -s -X POST <API_URL>/v1/asset-media-extractions \
  -H 'content-type: application/json' \
  -H 'idempotency-key: smoke-0001' \
  -H 'x-ort-client-id: <client key>' \
  -H 'x-ort-timestamp: <epoch seconds>' \
  -H 'x-ort-signature: <hex>' \
  --data-raw '<the body you signed>'
# 期待値: 202、runKey と statusName "queued"

# 3. キーで読み戻すと、コールバックが運んだ本文と同じものが返る
curl -s <API_URL>/v1/ai-runs/<runKey> \
  -H 'x-ort-client-id: <client key>' \
  -H 'x-ort-timestamp: <epoch seconds>' \
  -H 'x-ort-signature: <hex over "<timestamp>.">'
# 期待値: 200、statusName "succeeded"
```

**期待される出力。** コメントのとおり。手順 3 は**空の**本文に対して署名する — 本文を宣言しないリクエストの生本文は空文字列である。

**4. どのモデルが応答したかを確認する。** これは状態からは推し量れない唯一の確認である：

```sql
SELECT m.name, COUNT(*)
FROM ai_model_calls c JOIN ai_models m ON m.id = c.ai_model_id
GROUP BY m.name;
```

既定のインストールでは全行が `stub` と答える。それは正しく、期待どおりである — 1.16 参照。

**失敗したとき。** 手順 2 の `401` は署名かクライアント行の誤りを意味する。`MEDIA_UNREADABLE` で `failed` となる実行は、メディアのホストが `MEDIA_FETCH_ALLOWED_HOSTS` に無いことを意味する。`queued` のまま止まる実行は、ワーカープールが消費していないことを意味する。`--min-instances` を確認すること。

**巻き戻し。** 不要。スモーク実行も他と同じデータであり、保持期間の掃引が取り除く。

**サービスを中断するか。** しない。

### 1.16 実際の提供者を有効にする — 必須。go-live とはこのことである

**目的。** サービスを実際のモデルで応答させること。**この手順なしに Part I は完了しない**。1.15 で止めたデプロイは、実クライアントに決定論的な固定値を返し続けるデプロイである。

新規インストールは**スタブ**に応答する。決定論的な固定値、鍵の読み取り無し、外向き通信無し。それが出荷時の既定であり — §17 は分岐ではなくデータとしてそれを表現している — 提供者の有効化は**行 1 つ**の変更である。

**前提。** 1.15 が通過していること、`aiplatform.googleapis.com` が有効であること（1.2）、ワーカーが `roles/aiplatform.user` を持っていること（1.7）、そしてワーカーの環境に `VERTEX_AI_PROJECT_ID` と `VERTEX_AI_LOCATION` があること（1.10）。

**切り替えはこの結び付けの行であり、他のどこでもない。**

```sql
-- どのモデルが存在するか
SELECT id, name, is_default FROM ai_models;

-- 切り替え
UPDATE ai_agent_default_models
SET ai_model_id = (SELECT id FROM ai_models WHERE name = 'gemini-2-5-flash'),
    saved_at = NOW()
WHERE ai_agent_id = (SELECT id FROM ai_agents WHERE name = 'asset-media-extraction-agent');
```

**`ai_models.is_default` は切り替えではない。** それは、結び付けを持たないエージェントのためにモデルを選ぶ将来のバージョンに向けて保持されている列である。**今日これを設定しても何も変わらず**、これを設定して終えたデプロイは、エラーも警告も、何かが無視されたという痕跡も無いまま、スタブの応答を受け取り続ける。これは推測ではなく計測された事実である — そのように構成した実行は、3 回のモデル呼び出しを伴って `succeeded` で返り、応答したのはスタブだった。

**このためにデプロイするものは無く、再起動するものも無い。** ワーカーは自身として認証するので追加する鍵がない。そして `AiAgentModelBindingFinder` は、エージェントと結び付いたモデルとドライバを**実行ごとに** 1 回の `findOne` で読み、実行を越えてキャッシュを持たない。したがって上の `UPDATE` は次のリクエストから有効になる — この手順の末尾の巻き戻しが次のリクエストから有効になるのも、どちらの向きにもリビジョンが不要なのも、同じ理由である。

**その上でリクエストを 1 本流し**（1.15 の手順 2）、トークンの行を読む。

**期待される出力 — そしてこれだけが証明になる。**

```sql
SELECT m.name, c.input_token_count, c.output_token_count
FROM ai_model_calls c JOIN ai_models m ON m.id = c.ai_model_id
ORDER BY c.id DESC LIMIT 5;
```

最新の行は `gemini-2-5-flash` でなければならない。**`stub` と出るなら切り替えは効いていない** — そして稼働中のサービスは何も教えてくれない。スタブの応答も成功した応答だからである。

**失敗したとき。** 結び付けが指すモデルの提供者にドライバが無い場合、実行は応答せず拒否する。したがってここでの `failed` は正直な結果であり、`stub` が応答した `succeeded` のほうが危険である。`aiplatform` からの `PERMISSION_DENIED` は 1.7 の欠けた半分を直接名指す。`VERTEX_AI_*` の片方だけを設定した構成は鍵の経路に退避し、鍵が無いことを理由に拒否する。それは提供者側の問題のように読めるが、そうではない。

**巻き戻し。** 結び付けを `stub` の行に戻す。次の実行から有効になる。

**サービスを中断するか。** しない。ただし処理中の実行は、開始時のモデルのまま完了する。

---

## Part II — 毎回のリリース

### 2.1 何を出すのかを確定する

```bash
cd tsdg-ai-backend
git fetch --tags
git log --oneline $(git describe --tags --abbrev=0)..<TAG>
```

**期待される出力。** このリリースに入るコミット。マイグレーションが含まれるなら、続ける前に 2.3 を読むこと。

**サービスを中断するか。** しない。

### 2.2 今動いているものを記録する

**目的。** これが巻き戻し先である。何かを変える前に書き留めること。

```bash
gcloud run services describe tsdg-api --region=<REGION> \
  --format='value(status.latestReadyRevisionName)'
gcloud beta run worker-pools describe tsdg-worker --region=<REGION> \
  --format='value(status.latestReadyRevisionName)'
```

**期待される出力。** リビジョン名が 2 つ。**書き留めること。** これ無しに 2.8 は実行できない。

**サービスを中断するか。** しない。

### 2.3 データベースをバックアップする

**目的。** 取り返しのつかないことの直前の手順。コードは戻せるが、データは戻せない。

```bash
gcloud sql backups create --instance=<SQL_INSTANCE>
gcloud sql backups list --instance=<SQL_INSTANCE> --limit=1
```

**期待される出力。** 状態が `SUCCESSFUL` のバックアップ。`FAILED` なら続行しないこと。

**失敗したとき。** 一度だけ再試行する。再び失敗したらリリースを中止する。

**サービスを中断するか。** しない。

### 2.4 イメージをビルドして push する

1.8 と同じ。`<TAG>` を新しいものにする。

**サービスを中断するか。** しない — まだ何も切り替わっていない。

### 2.5 マイグレーションを適用する

**目的。** スキーマが先、コードが後。

**前提。** 2.3 が成功していること。

1.11 の `npx sequelize-cli db:migrate` と同じ。

**期待される出力。** 新しいマイグレーションのみ、あるいは `No migrations were executed`。

**互換性の規則。** **今まさに**稼働しているコードは、この手順が生成したスキーマの上で、2.6 が終わるまで動き続ける。したがってリリース内のマイグレーションは**追加**してよい — テーブル、NULL 許容列、インデックス — が、稼働中のコードがまだ読む何かを削除・改名してはならない。使われなくなった列は、それを使っていたコードが消えた**後の**リリースで削除する。

**失敗したとき。** 直して再実行する。`db:migrate` は止まった所から再開する。

**巻き戻し。** 可逆なマイグレーションなら `db:migrate:undo`。そうでなければ 2.3 のバックアップを復元する。

**サービスを中断するか。** 大きなテーブルにロックを取るマイグレーションでは、短時間あり得る。

### 2.6 API とワーカーを入れ替える

```bash
gcloud run deploy tsdg-api --region=<REGION> \
  --image=<REGION>-docker.pkg.dev/<PROJECT_ID>/<AR_REPO>/tsdg-ai-backend:<TAG>

gcloud beta run worker-pools deploy tsdg-worker --region=<REGION> \
  --image=<REGION>-docker.pkg.dev/<PROJECT_ID>/<AR_REPO>/tsdg-ai-backend:<TAG>
```

**期待される出力。** それぞれが新しいリビジョン名と `serving 100 percent of traffic` を表示する。

**失敗したとき。** `Revision is not ready` は以前のリビジョンを稼働させたままにするため、デプロイの失敗は障害ではない。ログを読み、直し、再デプロイする。

**巻き戻し。** 2.8。

**サービスを中断するか。** 処理中のリクエストは旧リビジョンで完了する。ワーカー入れ替え時に実行中だったものは BullMQ が再配信する。

### 2.7 検証する

1.15 の 4 つの確認を実行する。そして**リリースが提供者層、モデルの行、結び付けのいずれかに触れた場合は必ず**、1.16 のトークン照会も実行する。リリースは、誰も意図しないままどのモデルが応答するかを変えうるし、スタブの応答は実際の応答と見分けがつかない。

### 2.8 巻き戻す

```bash
# コードのみ。データには触れない — まずこれを試す
gcloud run services update-traffic tsdg-api --region=<REGION> \
  --to-revisions=<the revision from 2.2>=100

gcloud beta run worker-pools update tsdg-worker --region=<REGION> \
  --image=<the image the old revision ran>
```

**期待される出力。** 旧リビジョンに対して `serving 100 percent of traffic`。

**どこまで戻れるか。** コードは即座に戻せる。**スキーマは 2.3 のバックアップまで**であり、復元すればそれ以降に受理した実行はすべて失われる。したがって、追加しかしていないマイグレーションのリリースはコードだけで巻き戻せる。削除を含むものは戻せない。2.5 が同一リリース内での削除を禁じているのはそのためである。

**サービスを中断するか。** トラフィック切り替えの間、短時間あり。

---

## Part III — クライアントの署名シークレットをローテーションする

**イメージ `1.0.2` 以降。** シークレットを変えなければならないクライアント — 漏洩したか、規程がそう言うか — に、新しい登録を与える必要はない。数時間から数日隔てて 2 つのコマンドを実行する。その間、古いシークレットも動き続ける。

**前提。** 1.11 の Cloud SQL プロキシと export 済みの環境。1.14 と同様に `API_CLIENT_SECRET_ENCRYPTION_KEY` を含む。

### 3.1 クライアントに新しいシークレットを渡す

```bash
node scripts/rotateApiClientSecret.js '<the client's name>'
```

**期待される出力。** `rotated`。新しいシークレットが一度だけ表示される。古いシークレットはそのクライアントの「以前の」枠に移り、検証を続ける。この瞬間から、コールバックの署名に使われるのは新しい方である。

**新しいシークレットは、まずクライアントのコールバック検証側に、次にリクエスト署名側に渡すこと。** ここで噂むのはこの非対称性だけである。到着するリクエストは 2 つのシークレットのいずれでも検証されるので、クライアントは必要な間だけ古い方で署名を続けてよい。**外向きのコールバックは新しい方だけで署名される。** コールバック検証が古いシークレットしか持たないクライアントは、この窓の間に送られたコールバックをすべて `401` で跜ねる。それぞれが約 1 時間にわたって 7 回再試行され、その後破棄される。ポーリングでは結果が返るので、失われるのは実行ではなく通知である — が失われることに違いはなく、両側の順序を正しくするだけで避けられる。

**失敗したとき。** `rotation-already-under-way`（終了コード 1）は、前回のローテーションが未引退のままだという意味である。先に 3.2 を実行すること。`client-not-found`（終了コード 1）は名前の誤りである — クライアントキーでなく `name` を渡す。

**巻き戻し。** 無し。これは意図したことである：古いシークレットはまだ受け入れられているので、元に戻すものがない。新しいシークレットは再表示できない — 失ったクライアントはもう一度ローテーションする。

**サービスを中断するか。** しない。

### 3.2 クライアントの展開後に、古いシークレットを引退する

```bash
node scripts/retireApiClientPreviousSecret.js '<the client's name>'
```

**期待される出力。** `retired`。ここから先は新しいシークレットだけが検証される。

**クライアントが新しいシークレットで署名していると確認するまで、これを実行しないこと。** これが窓を閉じる手順であり、早く実行することは、クライアント側から見れば、サービスが正当なリクエストを跜ねているのと区別がつかない。

**失敗したとき。** `nothing-to-retire` は**終了コード 0** である — 枠が既に空だったということで、それは 2 度目の実行がそう見える姿であり、エラーではない。

**巻き戻し。** 無し。古いシークレットは行から消えている。まだそれを持っているクライアントはもう一度ローテーションする。

**サービスを中断するか。** 新しいシークレットを一度も展開しなかったクライアントに対してのみ。この手順はそれが済んでいることを前提にしている。

---

## Chapter 7 — 未解決事項

**7.1 と 7.2 は解決済みであり、この文書はもう DRAFT ではない — 端から端まで通して実行された。** 残るのは 7.3 のスクリプトの罠 2 件と 7.4 の運用上の欠落である。いずれも構築を妨げず、7.4 の 4 件のうち 1 件は、ドライバが Vertex AI の経路を得たことで自ら解決した。

### 7.1 サービスが Cloud Run で動かなかった — **解決済み、2026-09-29**

`server/index.js` は固定ポート 8001、3900、5800 で `127.0.0.1` を bind し、`PORT` を読まなかった。一方 Cloud Run は `0.0.0.0:$PORT` を要求し、サービスあたり 1 ポートしか公開しない。実施した内容：

- `server/index.js` は `PORT` を読み（既定 8001）、`0.0.0.0` を bind する
- **customer と admin の GraphQL エンジンを削除**（`Q163`） — ソース 19 ファイル、テスト 10 ファイル。両者が公開していたのは `healthCheck` 1 つのみで、それは §7 が存在しないと述べるゲスト許可リストの上にあった。さらにワイルドカード CORS、認証されない静的マウント（`Q160`）、アップロードミドルウェア、認証されない WebSocket トランスポート、GraphiQL コンソール（`Q161`）を抱えていた。削除によりそのすべてが閉じ、提供すべきポートが 1 つになった
- `Dockerfile` と `.dockerignore` を追加。イメージはフレームワークが要求する空の `.env` を書き、`.dockerignore` は、公開リポジトリに値が載っている `.env.development` をイメージから排除する

**読むのではなく、動かして確認した。** `PORT=9123` でサービスは署名の無いリクエストに `401` を返し、`ss` は `LISTEN 0.0.0.0:9123` を示し、ポート 3900 と 5800 は接続を拒否する。変更後のスイートは **155 スイート / 5,234 テスト**、および **9 / 537**、すべて通過、lint も clean。

**意図的に手を付けなかったこと。** GraphQL 関連 7 パッケージと `express-rate-limit` は、このリポジトリのどのソースからも参照されなくなったが、`@openreachtech/renchan` のバレルが依然として読み込む可能性がある。`package.json` からの削除は、それを確認したうえでの別の変更である。`pm2.config.cjs` も、この構成では使わないプロセスマネージャ型のデプロイを記述したままである。

### 7.2 本番の API クライアントを作る手段が無かった — **解決済み、2026-09-29**

`api_clients` の行は `sequelize/seeders/development/` でしか作られず、そのシークレットは公開リポジトリにコミットされている。そのため新規構築した本番は、署名されたリクエストを 1 本も受理できなかった。`scripts/registerApiClient.js` がそれを行い、1.14 がそれを実行する手順である。

48 文字のキーと 43 文字のシークレットを生成し、リクエスト経路が復号するのと同じ `ApiClientSecretCipher` でシークレットを暗号化し、ローテーション対象を持たない有効な行として書き込み、両方の値を一度だけ表示する。

**読むのではなく、通しで確認した。** このコマンドで登録したクライアントが署名したリクエストに、サービスは **`200`** を返した。同じリクエストを別のシークレットで署名すると **`401`** が返った。保存されたエンベロープは、表示されたシークレットに復号される — これはモック化したテストなら隠してしまう唯一の性質であり、実データベースに対して検証している。

**動かしたことで欠陥が 1 つ見つかり、修正した。** 拒否は理由を表示したうえで **0** で終了していた。`ProcessClerk#exit()` が読むのは `exitCode` であり、呼び出し側がフィールドを `code` と名付けていたため既定の 0 が適用されていた。パイプラインが読むのは終了コードであって本文ではないので、このコマンドの唯一の失敗経路が不可視だった。現在は 1 で終了し、テスト 2 件がそれを固定している。

### 7.3 既存スクリプトに潜む 2 つの罠

- **`npm run db:seed:master` は `master` ではなく `dev-master` を投入する。** 名前が言うことと `--seeders-path` が言うことが食い違っている。1.12 はパスを明示することで回避しているが、回避が不要になるようスクリプトを直すべきである。
- **`API_CLIENT_SECRET_ENCRYPTION_KEY` は値の差し替えではローテーションできない。** 保存済みのクライアントシークレットはすべてこの鍵で暗号化されているため、新しい値は一斉にすべてを復号不能にする。ローテーションとは全行の再暗号化であり、それを行う道具は今日存在しない。**クライアント自身の署名シークレットは別の話であり、こちらはローテーションできる** — 1.0.2 以降、Part III。

### 7.4 このデプロイ形態が生む運用上の欠落

- **ログファイルは残らない。** `MentsuLogger` は作業ディレクトリの `logs/` に書き、Cloud Run ではそのファイルシステムはインスタンスごとで破棄される。したがって §22 のログ規約は、誰も読めないファイルを生み出す。ロガーは stdout に書き、Cloud Logging に拾わせるべきである。関連して、ロガーは `NODE_ENV=production` の下でのみ書く。このデプロイはそれを設定するので、本番はそれらの行が存在する唯一の環境である（`Q149`）。
- **すべての SQL 文が Cloud Logging に流れる。** `sequelize/config.cjs` が `logging: false` を設定しているのは `development` だけなので、`production` は Sequelize の既定である `console.log` を取る（`Q154`）。Cloud Run では費用と雑音であり、`logging: false` にすべきである。
- **SQL 接続に TLS の選択肢が無い**（`Q24`）。コネクタの unix ソケット経由で Cloud SQL に到達すればこの露出は避けられる。1.9 がホストとポートではなく `/cloudsql/<SQL_CONNECTION>` を使うのはそのためである。`DATABASE_HOST` を公開 IP に向けないこと。
- **提供者への到達は API キーではなくサービスアカウントである — 解決済み。** ドライバは Vertex AI の経路（`GeminiApiClient.createWithVertexAi()`）を得、ワーカーは `roles/aiplatform.user` の下で自身の ID として呼ぶ。Secret Manager にも他のどこにも鍵は存在しない。`VERTEX_AI_PROJECT_ID` と `VERTEX_AI_LOCATION` が両方揃わないときに限って鍵が退避路として読まれるので、退避路は構成せずに溏されている。

---

## Chapter 8 — CI がこれを実行する場合に変わること

| | |
|---|---|
| 実行者 | 人ではなく、0.4 のロールを持つ Cloud Build または GitHub Actions のサービスアカウント |
| 鍵 | ダウンロードした鍵ファイルではなく Workload Identity Federation。鍵ファイルはランナーに一切書かれない |
| 2.2 の「書き留める」 | ビルド成果物になる。2 つのリビジョン名をステップ出力として取得し、2.8 が読めるようにする |
| 2.3 のバックアップ | 判断ではなく、失敗すればパイプラインを止める必須ステップになる |
| 1.16 の切り替え | **手動のまま。** 実際の提供者を有効にすることは費用を伴う意図的な行為であり、受け入れ基準もそう述べている |
| スモークチェック | パイプラインのステップとして実行し、その 4 つの確認がゲートになる |

---

## Chapter 9 — 本番を見る

### 9.1 各部の状態

```bash
gcloud run services describe tsdg-api --region=<REGION> \
  --format='value(status.conditions[0].message)'
gcloud beta run worker-pools describe tsdg-worker --region=<REGION> \
  --format='value(status.conditions[0].message)'
redis-cli -h <REDIS_HOST> --scan --pattern 'bull:*:meta'

# ワーカー自身のログ。範囲か順序かのどちらかを指定する。両方は指定しない
gcloud logging read 'resource.type="cloud_run_worker_pool" AND resource.labels.worker_pool_name="tsdg-worker"' \
  --freshness=1h --limit=50
```

**`--order=asc` は `--freshness` を無効にし、そのことをどこにも告げない。** この組み合わせはプロジェクトが持つ最も古い行を返す。クラッシュループ中にこれを見ると、最初から壊れたままのサービスにそのまま見える。`--order` を落として新しい順に読むか、`--limit` を広げること。

### 9.2 照会する価値のある 4 つの問い

```sql
-- 滞留しているものはあるか
SELECT s.name, COUNT(*) FROM ai_runs r
JOIN ai_run_statuses s ON s.id = r.ai_run_status_id
GROUP BY s.name;

-- 今週、実際に応答しているのはどのモデルか
SELECT m.name, COUNT(*) FROM ai_model_calls c
JOIN ai_models m ON m.id = c.ai_model_id
WHERE c.created_at > NOW() - INTERVAL 7 DAY GROUP BY m.name;

-- コールバックは届いているか
SELECT http_status_code, COUNT(*) FROM ai_run_callback_deliveries
WHERE created_at > NOW() - INTERVAL 1 DAY GROUP BY http_status_code;

-- 保持期間は追いついているか（期限を過ぎてなお提供者側に残る複製が滞留分）
SELECT COUNT(*) FROM provider_uploaded_files
WHERE provider_purged_at IS NULL AND expires_at < NOW();
```

### 9.3 失敗理由の意味

| `failure_reason_code` | 何が起きたか |
|---|---|
| `MEDIA_UNREADABLE` | メディア URL のホストが `MEDIA_FETCH_ALLOWED_HOSTS` に無いか、ファイルを取得できなかった。まず許可リストを確認する |
| `unregistered-callback-url`（実行の失敗ではなく配信の拒否） | コールバック URL がそのクライアントの `callback_url_prefix` で始まっていない。何も送信されていない |

### 9.4 どの照会も教えてくれない唯一のこと

**モデルの切り替えが誤って設定されたことを、稼働中のサービスは何も告げない。** スタブに結び付いたサービスは、トークン数と署名付きコールバックを伴って、あらゆるリクエストに成功を返す。唯一の手がかりは `ai_model_calls.ai_model_id` であり、1.16 と 2.7 がどちらもそこで終わるのはそのためである。
