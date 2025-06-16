#!/usr/bin/env bash
echo "インストールを開始します..."
npm install
npm run setup
npm run start
read -p "終了するには Enter キーを押してください"