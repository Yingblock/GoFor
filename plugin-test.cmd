@echo off
rem 删掉任意 plugins\<name> 后运行：plugin-test.cmd [--preview]
cd /d "%~dp0"
node tools\plugin-test.mjs %*
