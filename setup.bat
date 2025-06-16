@echo off
echo インストールを開始します...
npm install
call npm run setup
call npm run start
pause