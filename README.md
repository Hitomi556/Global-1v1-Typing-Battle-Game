# NEONCRYPT - Global Typing Battle

## プロジェクト概要
- **名前**: NeonCrypt
- **目標**: サイバーパンクスタイルの1v1タイピング＆パズルバトルゲーム
- **主な機能**:
  - **🌐 リアルタイムマッチング**（Firebase Realtime Database使用）
  - グローバルプレイヤー対戦（1日1回）
  - 友達との無制限対戦
  - AIオポネント自動マッチング（マッチが見つからない場合）
  - リアルタイム対戦相手スコア同期
  - 国別リーダーボード
  - ダークネオンUIデザイン
  - ハッカースタイルのサウンドエフェクト

## 現在実装済みの機能

### ✅ 完成済み
1. **ウェルカム画面**
   - ニックネーム入力
   - 国選択（REST Countries API連携）
   - ランダムマッチ/フレンドバトルモード選択

2. **ゲームプレイ**
   - **謎解きタイピング**: 謎解き問題をタイピングし、答えを選択
   - **300問のデータベース**: 5つのカテゴリ（各50問）
     - Classic Riddles（古典的謎解き）
     - Logic & Wordplay（論理と言葉遊び）
     - Nature & Animals（自然と動物）
     - Objects & Everyday Items（物と日常アイテム）
     - Math & Numbers（数学と数字）
   - リアルタイムタイピングフィードバック（緑=正解、赤=間違い）
   - ラウンドシステム（難易度によって1-3ラウンド）
   - 難易度選択（Easy/Normal/Hard）- ゲームメニュー内
   - リアルタイムタイマー（最初の文字入力時にスタート）
   - 対戦相手のスコア表示
   - **Firebase経由でリアルプレイヤーのスコアをリアルタイム同期**
   - AIオポネントの進行シミュレーション（Firebaseマッチング失敗時）
   - スコアシステム
   - 勝敗判定

3. **リーダーボード**
   - 今日のランキング
   - 過去7日間のランキング
   - 国別統計（試合数、勝利数、敗北数、勝率）

4. **サウンドシステム**
   - タイピング音（Web Audio API）
   - 正解音
   - 不正解音
   - 音量コントロール
   - ON/OFFトグル

5. **データベース（Cloudflare D1）**
   - ユーザー管理
   - マッチ結果保存
   - 国別統計

6. **サイバーパンクUI**
   - ダークテーマ
   - ネオングリーン/シアン/ピンクのアクセント
   - グリッチエフェクト
   - モノスペースフォント（Share Tech Mono）
   - グリッドパターン背景

### 📋 機能一覧と対応URI

#### API エンドポイント
- `POST /api/match/world` - ワールドバトル開始
  - パラメータ: `{ nickname, countryCode, countryName, difficulty }`
  - レスポンス: マッチ情報、オポネント情報
  
- `POST /api/match/result` - マッチ結果保存
  - パラメータ: `{ userId, nickname, countryCode, countryName, matchType, difficulty, opponentType, opponentNickname, result, score, completedRounds }`
  - レスポンス: 保存成功/失敗
  
- `GET /api/leaderboard` - リーダーボード取得
  - レスポンス: `{ today: [...], last7days: [...] }`

#### フロントエンド画面
- `/` - メイン画面（フッター付き）
  - `#welcome-screen` - ウェルカム画面
  - `#game-screen` - ゲーム画面
  - `#leaderboard-screen` - リーダーボード画面

#### 法的文書ページ
- `/credits` - クレジット表記・開発者情報
- `/terms` - 利用規約
- `/privacy` - プライバシーポリシー
- `/cookies` - Cookieポリシー
- **お問い合わせ**: neoncrypt.game@gmail.com

## 未実装の機能

### ⏳ 今後の実装予定
1. **マルチプレイヤーマッチング**
   - 現在はAI対戦のみ
   - リアルタイムプレイヤーマッチング機能

2. **より高度なAI**
   - 難易度別のAI応答速度
   - より自然な対戦体験

3. **追加のゲームモード**
   - トーナメントモード
   - タイムアタックモード
   - エンドレスモード

4. **プロフィールシステム**
   - ユーザー統計
   - 実績システム
   - レベルシステム

5. **チャット機能**
   - 試合前のクイックチャット
   - エモート

6. **モバイル最適化**
   - タッチ操作の改善
   - レスポンシブデザインの強化

## 推奨される次のステップ

1. **リアルタイムマッチング実装**
   - Cloudflare Durable Objectsの活用
   - WebSocket接続の実装

2. **AI難易度調整**
   - 難易度別のタイピング速度シミュレーション
   - 問題の回答時間調整

3. **実績システム追加**
   - 連勝記録
   - 特殊な実績バッジ

4. **問題データベース拡張** ✅ **完了（300問実装済み）**
   - ✅ 300問の謎解き問題を5カテゴリに分類
   - 今後のアイデア：カテゴリ別難易度選択機能

## 🔥 Firebase Realtime Database セットアップ

**重要**: リアルタイムマッチング機能を有効にするには、Firebase Realtime Databaseの設定が必要です。

詳細な手順は `FIREBASE_SETUP.md` を参照してください。

### クイックセットアップ

1. [Firebase Console](https://console.firebase.google.com/)でプロジェクト作成
2. Realtime Databaseを有効化（テストモードで開始）
3. Firebase設定を取得
4. `public/static/app.js`の`FIREBASE_CONFIG`を更新
5. アプリを再起動

**Firebase未設定の場合**: AIオポネント対戦のみ利用可能

## URLs

### 開発環境
- **ローカル開発**: https://3000-ikc557wguicxugfvxwd98-3844e1b6.sandbox.novita.ai
- **API Base**: Same as above

### 本番環境
- **本番デプロイ**: 未デプロイ（Cloudflare Pagesにデプロイ可能）

## データアーキテクチャ

### データモデル

#### Users テーブル
- `id` (TEXT, PRIMARY KEY) - ユーザーID
- `nickname` (TEXT) - ニックネーム
- `country_code` (TEXT) - 国コード（ISO 3166-1 alpha-2）
- `country_name` (TEXT) - 国名
- `last_world_battle_date` (TEXT) - 最後のワールドバトル日付
- `created_at` (DATETIME) - 作成日時

#### Match Results テーブル
- `id` (INTEGER, PRIMARY KEY AUTOINCREMENT) - マッチID
- `user_id` (TEXT) - ユーザーID
- `nickname` (TEXT) - ニックネーム
- `country_code` (TEXT) - 国コード
- `country_name` (TEXT) - 国名
- `match_type` (TEXT) - マッチタイプ（world/friend）
- `difficulty` (TEXT) - 難易度（easy/normal/hard）
- `opponent_type` (TEXT) - オポネントタイプ（player/ai）
- `opponent_nickname` (TEXT) - オポネントニックネーム
- `result` (TEXT) - 結果（win/loss）
- `score` (INTEGER) - スコア
- `completed_rounds` (INTEGER) - 完了ラウンド数
- `created_at` (DATETIME) - 作成日時

#### Country Stats テーブル
- `country_code` (TEXT, PRIMARY KEY) - 国コード
- `country_name` (TEXT) - 国名
- `total_matches` (INTEGER) - 総試合数
- `total_wins` (INTEGER) - 総勝利数
- `total_losses` (INTEGER) - 総敗北数
- `matches_last_7_days` (INTEGER) - 過去7日間の試合数
- `wins_last_7_days` (INTEGER) - 過去7日間の勝利数
- `losses_last_7_days` (INTEGER) - 過去7日間の敗北数
- `matches_today` (INTEGER) - 今日の試合数
- `wins_today` (INTEGER) - 今日の勝利数
- `losses_today` (INTEGER) - 今日の敗北数
- `last_updated` (DATETIME) - 最終更新日時

### ストレージサービス
- **Cloudflare D1**: SQLiteベースのグローバル分散データベース
- **ローカル開発**: `.wrangler/state/v3/d1` に自動作成されるローカルSQLite

### データフロー
1. ユーザーがニックネームと国を入力
2. ワールドバトルの場合、1日1回の制限をチェック
3. マッチ開始（現在はAI対戦）
4. ゲームプレイ（タイピング + 問題回答）
5. 結果をD1データベースに保存
6. ワールドバトルの場合のみ国別統計を更新
7. リーダーボードでは集計されたデータを表示

## ユーザーガイド

### 初めての方へ
1. **ニックネームを入力**: 好きなハンドルネーム（例: pixel_hacker）
2. **国を選択**: 国名を入力すると候補が表示されます
3. **モード選択**:
   - **Random Match**: ワールドバトル（1日1回）
   - **Play with Friend**: 友達バトル（無制限）

### ゲームの遊び方
1. ゲームメニューで**難易度を選択**:
   - **Easy**: 1文章のみ
   - **Normal**: 2文章（デフォルト）
   - **Hard**: 3文章
2. **Start Game**をクリック
3. 画面に表示された文章を**正確に**入力します
   - **最初の文字を入力するとタイマーがスタート**
   - 対戦相手のスコアもリアルタイムで表示されます
4. 入力が完了すると問題が表示されます
5. 正しい答えを選択してください
6. **間違えるとゲームオーバー**です
7. すべてのラウンドをクリアすると勝利！
8. 最終結果には自分と対戦相手のスコア、経過時間が表示されます

### リーダーボード
- **Today's Rankings**: 今日のランキング
- **Last 7 Days Rankings**: 過去7日間のランキング
- 各国の試合数、勝利数、敗北数、勝率が表示されます
- フレンドバトルの結果は含まれません

## デプロイメント

### プラットフォーム
- **Cloudflare Pages**

### ステータス
- ✅ ローカル開発環境: 稼働中
- ❌ 本番環境: 未デプロイ

### 技術スタック
- **バックエンド**: Hono (v4.10.3)
- **データベース**: Cloudflare D1 (SQLite)
- **フロントエンド**: Vanilla JavaScript + HTML5 + CSS3
- **フォント**: Orbitron, Share Tech Mono
- **外部API**: REST Countries API
- **デプロイ**: Cloudflare Pages + Wrangler

### 最終更新
- **日付**: 2025-10-31
- **最新の変更**: 
  - 謎解きデータベースを15問から300問に拡張（5カテゴリ、各50問）
  - 法的文書ページを追加（利用規約、プライバシーポリシー、Cookieポリシー、クレジット表記）
  - フッターとお問い合わせ先（neoncrypt.game@gmail.com）を追加

## 開発コマンド

```bash
# ローカル開発サーバー起動
npm run build
npm run clean-port
pm2 start ecosystem.config.cjs

# データベース操作
npm run db:migrate:local    # ローカルマイグレーション実行
npm run db:console:local    # ローカルDBコンソール

# Git操作
npm run git:commit "message"  # コミット
npm run git:status            # ステータス確認
npm run git:log               # ログ確認

# 本番デプロイ（未設定）
npm run deploy
```

## ライセンス
このプロジェクトは学習および実験目的で作成されています。
