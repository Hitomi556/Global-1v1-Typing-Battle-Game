# Firebase Realtime Database セットアップガイド

NeonCryptでリアルタイムマッチング機能を有効にするには、Firebase Realtime Databaseの設定が必要です。

## ステップ1: Firebaseプロジェクトの作成

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力（例: neoncrypt-game）
4. Google Analyticsは無効でOK
5. 「プロジェクトを作成」をクリック

## ステップ2: Realtime Databaseの有効化

1. Firebaseコンソールで「構築」→「Realtime Database」をクリック
2. 「データベースを作成」をクリック
3. ロケーションを選択（例: asia-southeast1）
4. セキュリティルールで「テストモードで開始」を選択
5. 「有効にする」をクリック

## ステップ3: セキュリティルールの設定

Realtime Databaseの「ルール」タブで以下のルールを設定：

```json
{
  "rules": {
    "matching": {
      ".read": true,
      ".write": true,
      "$matchId": {
        ".indexOn": ["difficulty", "status", "timestamp"]
      }
    },
    "rooms": {
      ".read": true,
      ".write": true,
      "$roomCode": {
        ".indexOn": ["status", "createdAt"]
      }
    },
    "games": {
      ".read": true,
      ".write": true,
      "$gameId": {
        ".indexOn": ["status", "createdAt"]
      }
    }
  }
}
```

**注意**: これはテスト用の設定です。本番環境では適切な認証とセキュリティルールを設定してください。

## ステップ4: Firebase設定の取得

1. Firebaseコンソールで歯車アイコン→「プロジェクトの設定」をクリック
2. 「全般」タブをスクロールして「マイアプリ」セクションを探す
3. 「ウェブアプリにFirebaseを追加」（</> アイコン）をクリック
4. アプリのニックネームを入力（例: neoncrypt-web）
5. Firebase Hostingは設定不要
6. 「アプリを登録」をクリック
7. 表示されるFirebase SDK設定をコピー

設定は以下のような形式です：

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};
```

## ステップ5: NeonCryptに設定を適用

1. `/home/user/webapp/public/static/app.js` を開く
2. ファイルの先頭付近にある `FIREBASE_CONFIG` オブジェクトを見つける
3. ステップ4でコピーした設定値を貼り付ける

変更前：
```javascript
const FIREBASE_CONFIG = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_AUTH_DOMAIN",
  databaseURL: "REPLACE_WITH_YOUR_DATABASE_URL",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_APP_ID"
};
```

変更後：
```javascript
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};
```

## ステップ6: アプリケーションの再起動

```bash
cd /home/user/webapp
npm run build
pm2 restart neoncrypt
```

## 動作確認

1. ブラウザでアプリケーションを開く
2. ブラウザの開発者ツール（F12）を開く
3. Consoleタブを確認
4. 「Firebase initialized successfully」が表示されればOK
5. Random Matchをクリックして、「searching...」→「matched!」または「vs AI」が表示されることを確認

## トラブルシューティング

### Firebase not configured エラー
- `FIREBASE_CONFIG`の値が正しく設定されているか確認
- すべての値が "REPLACE_WITH_..." から実際の値に置き換えられているか確認

### Permission denied エラー
- Realtime Databaseのセキュリティルールが正しく設定されているか確認
- ルールで `.read: true` と `.write: true` が設定されているか確認

### マッチングが動作しない
- Firebaseコンソールで「Realtime Database」を開き、データが書き込まれているか確認
- `matching/` と `games/` ノードにデータが表示されるはずです

## 無料枠の制限

Firebase Realtime Databaseの無料枠（Sparkプラン）：
- 同時接続: 100人まで
- ストレージ: 1GB
- ダウンロード: 10GB/月
- アップロード: データ量無制限

通常のゲーム使用では無料枠で十分です。

## セキュリティ（本番環境用）

本番環境では以下のセキュリティルールを使用することを推奨：

```json
{
  "rules": {
    "matching": {
      ".read": true,
      ".write": "auth != null",
      "$matchId": {
        ".validate": "newData.hasChildren(['userId', 'nickname', 'difficulty', 'status', 'timestamp'])"
      }
    },
    "games": {
      "$gameId": {
        ".read": true,
        ".write": "auth != null",
        "player1": {
          ".write": "auth.uid == data.child('id').val()"
        },
        "player2": {
          ".write": "auth.uid == data.child('id').val()"
        }
      }
    }
  }
}
```

ただし、これには Firebase Authentication の設定が必要です。
