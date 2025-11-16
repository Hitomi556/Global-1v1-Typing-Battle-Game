# Google Analytics & Search Console Setup Guide

このガイドでは、NeonCryptにGoogle Analytics 4（GA4）とGoogle Search Consoleを設定する方法を説明します。

## 📊 Google Analytics 4 (GA4) セットアップ

### ステップ1: Google Analyticsアカウント作成

1. [Google Analytics](https://analytics.google.com/)にアクセス
2. Googleアカウントでログイン
3. 「測定を開始」をクリック
4. アカウント名を入力（例：NeonCrypt）
5. アカウント設定を確認して「次へ」

### ステップ2: プロパティ設定

1. プロパティ名を入力（例：NeonCrypt Game）
2. タイムゾーンを選択（例：日本）
3. 通貨を選択（例：JPY）
4. 「次へ」をクリック

### ステップ3: ビジネス情報

1. 業種：「ゲーム」を選択
2. ビジネスの規模：適切なものを選択
3. 「作成」をクリック

### ステップ4: データストリーム設定

1. プラットフォーム：「ウェブ」を選択
2. ウェブサイトのURL：本番環境のURLを入力
   - 例：`https://your-project.pages.dev`
3. ストリーム名：NeonCrypt
4. 「ストリームを作成」をクリック

### ステップ5: 測定IDを取得

1. 作成されたデータストリームを開く
2. **測定ID**（`G-XXXXXXXXXX`の形式）をコピー
3. この測定IDを以下のファイルで置き換えます：

**`src/index.tsx`の5箇所**：
```typescript
// すべての G-XXXXXXXXXX を実際の測定IDに置き換える
<script async src="https://www.googletagmanager.com/gtag/js?id=G-YOUR_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-YOUR_MEASUREMENT_ID', {
    // ...
  });
</script>
```

### ステップ6: テスト

1. ローカル環境で動作確認：
```bash
npm run build
pm2 restart neoncrypt
```

2. Google Analyticsダッシュボードで「リアルタイム」を確認
3. サイトにアクセスして訪問者が表示されることを確認

---

## 🔍 Google Search Console セットアップ

### ステップ1: Search Consoleアクセス

1. [Google Search Console](https://search.google.com/search-console/)にアクセス
2. Googleアカウントでログイン
3. 「プロパティを追加」をクリック

### ステップ2: プロパティタイプ選択

**URLプレフィックス**を選択：
- 本番環境のURL全体を入力
- 例：`https://your-project.pages.dev`

### ステップ3: 所有権の確認

**方法1：HTMLタグ（推奨）**
1. 「HTMLタグ」を選択
2. 提供されるメタタグをコピー：
   ```html
   <meta name="google-site-verification" content="YOUR_VERIFICATION_CODE">
   ```
3. `src/index.tsx`のメインページの`<head>`セクションに追加
4. 既存のプレースホルダーを置き換え：
   ```typescript
   <meta name="google-site-verification" content="YOUR_VERIFICATION_CODE">
   ```

**方法2：HTMLファイルアップロード**
1. 指定されたHTMLファイルをダウンロード
2. `public/`フォルダに配置
3. デプロイ後に確認

### ステップ4: ビルドとデプロイ

```bash
# ビルド
npm run build

# ローカルテスト
pm2 restart neoncrypt

# Cloudflare Pagesにデプロイ
wrangler pages deploy dist --project-name neoncrypt-game
```

### ステップ5: 所有権確認

1. Search Consoleに戻る
2. 「確認」ボタンをクリック
3. 成功メッセージを確認

### ステップ6: サイトマップ送信（オプション）

1. Search Consoleダッシュボードを開く
2. 「サイトマップ」セクションに移動
3. サイトマップURLを追加：
   - 例：`https://your-project.pages.dev/sitemap.xml`
   - （サイトマップが存在する場合）

---

## 📈 確認事項

### Google Analytics確認
- [ ] 測定IDを5箇所すべてに設定
- [ ] リアルタイムレポートで訪問者を確認
- [ ] ページビューが記録されているか確認

### Google Search Console確認
- [ ] 所有権確認メタタグを設定
- [ ] 本番環境にデプロイ
- [ ] 所有権確認完了
- [ ] カバレッジレポートが表示されるか確認（数日後）

---

## 🚀 本番環境へのデプロイ

すべての設定が完了したら：

```bash
# 最終ビルド
npm run build

# Cloudflare Pagesにデプロイ
wrangler pages deploy dist --project-name neoncrypt-game

# または package.json のスクリプトを使用
npm run deploy:prod
```

---

## 🔧 トラブルシューティング

### Google Analytics
- **データが表示されない**
  - 測定IDが正しいか確認
  - ブラウザのコンソールでエラーがないか確認
  - Ad Blockerが無効になっているか確認

### Google Search Console
- **所有権確認が失敗する**
  - メタタグが`<head>`内にあるか確認
  - デプロイ済みか確認
  - ソースコードでメタタグが表示されるか確認

---

## 📚 参考リンク

- [Google Analytics 4 ヘルプ](https://support.google.com/analytics/answer/9304153)
- [Google Search Console ヘルプ](https://support.google.com/webmasters/)
- [Cloudflare Pages ドキュメント](https://developers.cloudflare.com/pages/)

---

## ⚠️ 重要な注意事項

1. **測定ID（G-XXXXXXXXXX）**は5箇所すべてに設定する必要があります
2. **Search Console確認コード**は本番環境にデプロイされている必要があります
3. **プライバシーポリシー**にGoogle Analyticsの使用を明記済み
4. ユーザーはGoogle Analytics Opt-outアドオンでトラッキングを無効にできます

---

完了後は、README.mdに測定IDとSearch Console確認状態を記録してください。
