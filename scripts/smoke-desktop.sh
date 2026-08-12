#!/usr/bin/env bash
# 冒烟：standalone → 资源 → release 打包(dmg) → 安装 → 启动 → 健康 → 退出 → 无残留
# 用法：bash scripts/smoke-desktop.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# 端口 3010 必须空闲（泄漏的 next-server 会占住它）
if lsof -ti :3010 > /dev/null 2>&1; then
  echo "FAIL: port 3010 already in use; kill the leftover next-server first"
  exit 1
fi

npm run build:standalone

mkdir -p standalone-resources
rm -rf standalone-resources/standalone
cp -R .next/standalone standalone-resources/

# 打包（tauri-cli 跑 release build + dmg bundle；cargo build 本身不产出 dmg）
npx @tauri-apps/cli build

DMG=$(ls src-tauri/target/release/bundle/dmg/AIHome_*.dmg | head -1)
echo "DMG: $DMG"

hdiutil attach "$DMG" -quiet -nobrowse -mountpoint /tmp/aihome-mnt
APP=/tmp/aihome-mnt/AIHome.app
open "$APP"

# 轮询健康就绪（首启 node + Next 冷启动，预留 30s）
HEALTH_OK=0
for i in $(seq 1 30); do
  if curl -sf -m 2 http://127.0.0.1:3010/api/health > /dev/null; then
    HEALTH_OK=1
    break
  fi
  sleep 1
done
if [ "$HEALTH_OK" != "1" ]; then
  echo "FAIL: health endpoint not reachable"
  osascript -e 'tell application "AIHome" to quit' || true
  hdiutil detach /tmp/aihome-mnt -quiet
  exit 1
fi
echo "PASS: health endpoint reachable"

# 功能级检查：/api/agents 会写 .aihome 扫描缓存——bundle 只读目录下必须仍能工作
if ! curl -sf -m 5 http://127.0.0.1:3010/api/agents > /dev/null; then
  echo "FAIL: /api/agents not working (writable runtime dir problem?)"
  osascript -e 'tell application "AIHome" to quit' || true
  hdiutil detach /tmp/aihome-mnt -quiet
  exit 1
fi
echo "PASS: /api/agents functional (writable runtime ok)"

osascript -e 'tell application "AIHome" to quit' || pkill -f AIHome
sleep 3

# 残留检查：Next 16 把进程名改成 "next-server (...)"，pgrep 路径匹配不到，改用端口
if lsof -ti :3010 > /dev/null 2>&1; then
  echo "FAIL: next-server still running after quit (port 3010 held)"
  hdiutil detach /tmp/aihome-mnt -quiet
  exit 1
fi
echo "PASS: no residual process"

# SIGTERM 场景：kill 命令退出也必须清理（信号加固验证）
open "$APP"
for i in $(seq 1 20); do
  curl -sf -m 2 http://127.0.0.1:3010/api/health > /dev/null && break
  sleep 1
done
APP_PID=$(pgrep -f "AIHome.app/Contents/MacOS/aihome" | head -1)
[ -n "$APP_PID" ] || { echo "FAIL: app not running for SIGTERM test"; hdiutil detach /tmp/aihome-mnt -quiet; exit 1; }
kill -TERM "$APP_PID"
sleep 3
if lsof -ti :3010 > /dev/null 2>&1; then
  echo "FAIL: next-server leaked after SIGTERM"
  hdiutil detach /tmp/aihome-mnt -quiet
  exit 1
fi
echo "PASS: no residual after SIGTERM"

hdiutil detach /tmp/aihome-mnt -quiet
echo "SMOKE OK"
