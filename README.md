# シルファー パッケージ

シルファーはパッケージ化されたチャットツールです。
静的サイト（Cloudflare Pages）とサーバーレス関数（Cloudflare Workers）で、Dify Chat API と Google Cloud 音声APIを連携します。

## 目次

- [シルファー パッケージ](#シルファー-パッケージ)
  - [目次](#目次)
  - [概要](#概要)
  - [前提条件](#前提条件)
  - [セットアップ](#セットアップ)
    - [ステップ1: 依存パッケージのインストール](#ステップ1-依存パッケージのインストール)
    - [ステップ2: 対話形式セットアップ](#ステップ2-対話形式セットアップ)
    - [ステップ3: ローカル実行](#ステップ3-ローカル実行)
    - [ターミナル不要スクリプト](#ターミナル不要スクリプト)
  - [環境変数](#環境変数)
  - [デプロイ](#デプロイ)
  - [ドメイン設定](#ドメイン設定)
  - [ファイル構成](#ファイル構成)
  - [ライセンス](#ライセンス)

---

## 概要

本パッケージは、

* 静的サイト（`public/`）でチャットUIを表示
* Cloudflare Workers（`workers/`）でAPIリクエストをプロキシ・SSE配信
* Dify Chat APIを利用したメッセージ送受信
* Google Cloud Speech-to-Text / Text-to-Speech を統合

をワンストップで提供します。

## 前提条件

* Node.js (>=16) と npm
* Cloudflare アカウント（Pages と Workers の権限）
* Dify Chat / Knowledge API キー
* Google Cloud プロジェクト（Speech-to-Text/ Text-to-Speech API を有効化）

## セットアップ

以下、ターミナル／コマンドプロンプトを開いて順に実行してください。

### ステップ1: 依存パッケージのインストール

```bash
npm install
```

### ステップ2: 対話形式セットアップ

```bash
npm run setup
```

対話形式で必要な情報を入力し、

* `.env` の生成
* `workers/wrangler.toml` のプレースホルダー置換
* Wrangler Secret 登録 を自動で行います。

### ステップ3: ローカル実行

```bash
npm run start
```

Docker Compose でフロントエンドと Workers を同時に起動します。起動後、

```
http://localhost:8080
```

をブラウザで開き、動作を確認してください。

### ターミナル不要スクリプト

PC操作に不慣れな方向けに、プロジェクトルート以下のスクリプトを ダブルクリックで実行できるよう同梱しています。

* **Windows**: `setup.bat`
* **macOS/Linux**: `setup.sh` （実行権限付与: `chmod +x setup.sh`）

これらをダブルクリックするとステップ1～3をまとめて実行します。

## 環境変数

プロジェクトルートの `.env` に以下を設定してください（`.env.example`を参照）。

```dotenv
API_KEY=<Dify Chat APIキー>
KNOWLEDGE_API_KEY=<Dify Knowledge APIキー>
GCP_API_KEY=<Google Cloud APIキー>
DATASET_ID=<Dify Knowledge Dataset ID>
ALLOWED_ORIGINS=<静的サイトの許可ドメイン>
```

Workers上では同名の環境変数をWrangler Secretとして登録:

```bash
cd workers
wrangler secret put API_KEY
wrangler secret put KNOWLEDGE_API_KEY
wrangler secret put GCP_API_KEY
wrangler secret put DATASET_ID
wrangler secret put ALLOWED_ORIGINS
```

## デプロイ

1. **Cloudflare Pages** に `public/` をデプロイ
2. **Cloudflare Workers** に `workers/` をデプロイ
3. 必要に応じてカスタムドメインを割り当て

## ドメイン設定

* Pages：静的サイトのホストドメインを `ALLOWED_ORIGINS` に追加
* Workers：API用サブドメイン（`route`）を `wrangler.toml` の `route` に設定

## ファイル構成

```
sirupha-package/
├ public/
│  └ index.html        # チャットUI
├ workers/
│  ├ workers.js        # APIプロキシ実装
│  ├ wrangler.toml     # CF設定テンプレート
│  └ .env.example      # 環境変数サンプル
├ scripts/
│  └ setup.js          # 対話形式セットアップスクリプト
├ docker-compose.yml   # ローカル起動構成
├ setup.bat            # Windows用ワンクリックスクリプト
├ setup.sh             # macOS/Linux用ワンクリックスクリプト
├ package.json         # npmスクリプト／module設定
├ .env.example         # 環境変数サンプル
└ README.md            # 本ドキュメント
```

## ライセンス

MIT License

```
MIT License

Copyright (c) 2025 シルファー プロジェクト

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
