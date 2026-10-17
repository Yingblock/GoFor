#!/usr/bin/env bash
# 打一个 Windows 便携版：把 Electron 的 win32-x64 运行时与 web 产物拼在一起。
#
# 为什么不用 electron-builder：它在 Linux 上打 NSIS 安装包需要 wine，
# 而"绿色版文件夹"只需要复制文件，零额外依赖。用户解压后双击 GoFor.exe 即可。
#
# 注意：这是**一次性打包实验**，不是产品架构。
# 桌面端的正式方案是 PWA（Windows 用浏览器/Edge 安装），见 docs/DESIGN.md §7。
set -euo pipefail

ELECTRON_VERSION="${ELECTRON_VERSION:-v33.0.0}"
OUT_DIR="${OUT_DIR:-release}"
STAGE="/tmp/gofor-win-stage"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="GoFor-win-x64"

echo "==> 构建 web 产物"
(cd "$REPO_ROOT/apps/web" && pnpm build >/dev/null)

echo "==> 下载 Electron $ELECTRON_VERSION (win32-x64)"
mkdir -p "$STAGE"
if [ ! -f "/tmp/electron-$ELECTRON_VERSION-win32-x64.zip" ]; then
  curl -sSL -o "/tmp/electron-$ELECTRON_VERSION-win32-x64.zip" \
    "https://github.com/electron/electron/releases/download/$ELECTRON_VERSION/electron-$ELECTRON_VERSION-win32-x64.zip"
fi

echo "==> 解包并组装"
rm -rf "$STAGE" && mkdir -p "$STAGE"
python3 - "$STAGE" <<'PY'
import sys, zipfile
with zipfile.ZipFile(f"/tmp/electron-{__import__('os').environ.get('ELECTRON_VERSION','v33.0.0')}-win32-x64.zip") as z:
    z.extractall(sys.argv[1])
PY

# Electron 默认把 app 放在 resources/app
APP_DIR="$STAGE/resources/app"
rm -rf "$APP_DIR" && mkdir -p "$APP_DIR"
cp "$REPO_ROOT/tools/package-windows/main.cjs" "$APP_DIR/"
cp "$REPO_ROOT/tools/package-windows/package.json" "$APP_DIR/"
cp -r "$REPO_ROOT/apps/web/dist" "$APP_DIR/dist"

# 只保留中英文语言包：全留会多 40MB，全删则 Chromium 启动可能异常
mkdir -p "$STAGE/locales"
python3 - "$STAGE" <<'PYEOF'
import sys, os, zipfile, shutil
stage = sys.argv[1]
src = "/tmp/electron-v33.0.0-win32-x64.zip"
locales = os.path.join(stage, "locales")
keep = {"en-US.pak", "zh-CN.pak"}
for name in os.listdir(locales):
    if name not in keep:
        os.remove(os.path.join(locales, name))
with zipfile.ZipFile(src) as z:
    for entry in z.namelist():
        base = os.path.basename(entry)
        if entry.startswith("locales/") and base in keep:
            with z.open(entry) as fin, open(os.path.join(locales, base), "wb") as fout:
                shutil.copyfileobj(fin, fout)
print("locales:", sorted(os.listdir(locales)))
PYEOF

mv "$STAGE/electron.exe" "$STAGE/GoFor.exe"

echo "==> 打包 zip"
mkdir -p "$REPO_ROOT/$OUT_DIR"
rm -f "$REPO_ROOT/$OUT_DIR/$NAME.zip"
python3 - "$STAGE" "$REPO_ROOT/$OUT_DIR/$NAME.zip" "$NAME" <<'PY'
import sys, os, zipfile
stage, out, name = sys.argv[1], sys.argv[2], sys.argv[3]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for root, _dirs, files in os.walk(stage):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, stage)
            z.write(full, os.path.join(name, rel))
PY

ls -lh "$REPO_ROOT/$OUT_DIR/$NAME.zip"
