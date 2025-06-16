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

  // Wrangler Secret 登録
  ['API_KEY','KNOWLEDGE_API_KEY','GCP_API_KEY','DATASET_ID','ALLOWED_ORIGINS']
    .forEach(key => {
      execSync(`cd workers && wrangler secret put ${key} --secret "${responses[key.toLowerCase()]}"`);
      console.log(`${key} を Wrangler Secret として登録しました`);
    });

  console.log('セットアップ完了：npm run start で環境を起動できます');
})();
