#!/usr/bin/env bash
# 删掉任意 plugins/<name> 后运行：./plugin-test.sh [--preview]
set -euo pipefail
cd "$(dirname "$0")"
exec node tools/plugin-test.mjs "$@"
