#!/usr/bin/env node
// File: scripts/setup.js
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import prompts from 'prompts';

(async () => {
  console.log('=== シルファー パッケージ セットアップ ===');
  const questions = [
    { type: 'text', name: 'apiKey',      message: 'Dify Chat API Key:' },
    { type: 'text', name: 'knowledgeKey',message: 'Dify Knowledge API Key:' },
    { type: 'text', name: 'datasetId',   message: 'Dify Dataset ID:' },
    { type: 'text', name: 'gcpKey',      message: 'Google Cloud API Key:' },
    { type: 'text', name: 'origins',     message: 'Allowed Origins (comma-separated):' },
    { type: 'text', name: 'accountId',   message: 'Cloudflare Account ID:' },
    { type: 'text', name: 'zoneId',      message: 'Cloudflare Zone ID:' },
    { type: 'text', name: 'projectName', message: 'Cloudflare Project Name:' },
    { type: 'text', name: 'apiSubdomain',message: 'Cloudflare API Subdomain (e.g., api.example.com):' }
  ];

  const responses = await prompts(questions);

  // .env ファイル生成
  const envContent = `API_KEY=${responses.apiKey}
KNOWLEDGE_API_KEY=${responses.knowledgeKey}
GCP_API_KEY=${responses.gcpKey}
DATASET_ID=${responses.datasetId}
ALLOWED_ORIGINS=${responses.origins}
`;
  fs.writeFileSync(path.resolve('.env'), envContent);
  console.log('.env を生成しました');

  // wrangler.toml テンプレート変換
  const tmpl = fs.readFileSync('workers/wrangler.toml', 'utf8');
  const wranglerConfig = tmpl
    .replace('<CF_PROJECT_NAME>', responses.projectName)
    .replace('<YOUR_ACCOUNT_ID>',  responses.accountId)
    .replace('<API_SUBDOMAIN>',    responses.apiSubdomain)
    .replace('<YOUR_ZONE_ID>',     responses.zoneId);
  fs.writeFileSync('workers/wrangler.toml', wranglerConfig);
  console.log('workers/wrangler.toml を更新しました');

  try {
    execSync('which wrangler', { stdio: 'pipe' });
  } catch (error) {
    console.log('Wrangler CLI をインストール中...');
    try {
      execSync('npm install -g wrangler', { stdio: 'inherit' });
      console.log('Wrangler CLI のインストールが完了しました');
    } catch (installError) {
      console.error('Wrangler CLI のインストールに失敗しました:', installError.message);
      console.log('手動でインストールしてください: npm install -g wrangler');
      console.log('ローカル開発は Docker Compose で可能です: npm run start');
      return;
    }
  }

  // Wrangler Secret 登録 (key mapping fix)
  const secretMappings = {
    'API_KEY': responses.apiKey,
    'KNOWLEDGE_API_KEY': responses.knowledgeKey,
    'GCP_API_KEY': responses.gcpKey,
    'DATASET_ID': responses.datasetId,
    'ALLOWED_ORIGINS': responses.origins
  };

  console.log('Cloudflare Secrets を設定中...');
  Object.entries(secretMappings).forEach(([key, value]) => {
    try {
      execSync(`cd workers && echo "${value}" | wrangler secret put ${key}`, { stdio: 'inherit' });
      console.log(`${key} を Wrangler Secret として登録しました`);
    } catch (error) {
      console.error(`Failed to set secret ${key}:`, error.message);
      console.log('注意: Cloudflare認証が必要です。wrangler login を実行してください。');
      console.log('ローカル開発では Docker Compose を使用してください: npm run start');
    }
  });

  console.log('セットアップ完了：npm run start で環境を起動できます');
})();
