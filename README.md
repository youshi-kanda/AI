# AI面接官チャットシステム

画像のような感じでチャットのやり取りを行う面接官システムです。
チャットの内容はDifyと連携させて内容を表示させます。

## 機能

- 🎭 アニメスタイルのキャラクター表示（姫宮先輩）
- 💬 リアルタイムチャット機能
- 🤖 Dify API連携によるAI応答生成
- 📱 レスポンシブデザイン（スマートフォン対応）
- ⌨️ 入力中インジケーター表示
- 💾 会話履歴の保存

## ファイル構成

```
AI/
├── enhanced_chat_interview.html  # メインのチャット画面
├── dify_integration.js          # Dify API連携モジュール
├── dist/                        # デプロイ用ビルドフォルダ
│   ├── index.html              # メインHTML（enhanced_chat_interview.htmlのコピー）
│   └── dify_integration.js     # API連携スクリプト
└── README.md                    # このファイル
```

## セットアップ

### 1. Dify API設定

`enhanced_chat_interview.html`内の以下の部分を編集してください：

```javascript
this.difyClient = new DifyAPIClient(
    'your-dify-api-key-here', // 実際のAPIキーに置き換え
    'https://api.dify.ai/v1'   // 実際のDifyエンドポイントに置き換え
);
```

### 2. 使用方法

1. `enhanced_chat_interview.html`をWebブラウザで開く
2. チャット入力欄にメッセージを入力
3. 送信ボタンをクリックまたはEnterキーで送信
4. AI面接官（姫宮先輩）からの応答を待つ

## 技術仕様

- **フロントエンド**: HTML5, CSS3, JavaScript (ES6+)
- **API連携**: Dify REST API
- **デザイン**: ビジュアルノベル風インターフェース
- **文字エンコーディング**: UTF-8（日本語対応）

## カスタマイズ

### キャラクター変更
- CSS内の`.character-area`背景画像を変更
- `.character-name`のテキストを変更

### スタイル調整
- CSS変数を使用してカラーテーマを変更可能
- レスポンシブブレークポイントの調整

### API設定
- `dify_integration.js`でAPI設定をカスタマイズ
- エラーハンドリングとフォールバック応答の調整

## 注意事項

- APIキーは本番環境では環境変数として管理してください
- CORS設定が必要な場合があります
- Dify APIの利用制限にご注意ください

## ライセンス

このプロジェクトは教育・研究目的で作成されています。

## 開発者

- Link to Devin run: https://app.devin.ai/sessions/4d3ebb46f07f4c328597a46593f0c3ce
- Requested by: 島野将 (m.shimano@tunagu.tech)
