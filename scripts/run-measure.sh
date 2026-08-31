#!/usr/bin/env bash
# 性能度量 runner：单进程起生产服务 → 每路由独立浏览器进程测量 → 合并 → 收尾。
# 规避：跨 bash 调用后台进程不存活、端口残留、headless 浏览器连续导航卡死、
#       管道把输出截断掩盖问题。
# 用法: bash scripts/run-measure.sh [--port 3211] [--out docs/perf/after.json] [--repeat 3]
set -euo pipefail

PORT=3211
OUT=docs/perf/after.json
REPEAT=3
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --repeat) REPEAT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

cd "$(dirname "$0")/.."

# 清理该端口残留
lsof -ti:"$PORT" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
sleep 1

# 启动生产服务
PORT_LOG=/tmp/aihome-measure-$PORT.log
nohup npm run start -- -p "$PORT" > "$PORT_LOG" 2>&1 &
SRV_PID=$!

# 等健康
UP=0
for i in $(seq 1 20); do
  sleep 1
  if curl -s -o /dev/null -m 3 -w "%{http_code}" "http://127.0.0.1:$PORT/board" | grep -q 200; then
    UP=1; echo "[runner] server up on :$PORT after ${i}s"
    break
  fi
done
if [ "$UP" != "1" ]; then
  echo "[runner] server failed to start"; tail -20 "$PORT_LOG"; kill "$SRV_PID" 2>/dev/null || true; exit 1
fi

# 逐路由独立浏览器进程测量（隔离 headless 连续导航卡死；失败单路由跳过）
ROWS=/tmp/measure-rows.jsonl
ERR=/tmp/measure-run.err
> "$ROWS"; > "$ERR"
while IFS= read -r r; do
  [ -z "$r" ] && continue
  echo "[runner] measuring $r"
  if REPEAT="$REPEAT" node scripts/measure-perf.mjs \
      --base "http://127.0.0.1:$PORT" --out /tmp/measure-one.json --only "$r" \
      > /tmp/measure-one.out 2>>"$ERR"; then
    node -e "const d=require('/tmp/measure-one.json'); const p=d.pages[0]; if(p) process.stdout.write(JSON.stringify(p)+'\n')" >> "$ROWS"
  else
    echo "[runner]   FAILED $r (skipped)"
  fi
done < <(node scripts/measure-perf.mjs --list-routes)

# 合并
node -e "
const fs=require('fs');
const rows=fs.readFileSync('$ROWS','utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));
if(!rows.length){console.error('no rows measured');process.exit(1);}
fs.writeFileSync('$OUT', JSON.stringify({generatedAt:new Date().toISOString(), base:'http://127.0.0.1:$PORT', pages:rows}, null, 2));
console.log('[runner] merged '+rows.length+' routes → $OUT');
"
if [ -s "$ERR" ]; then echo "[runner] stderr notes (tail):"; tail -5 "$ERR"; fi

# 收尾
kill "$SRV_PID" 2>/dev/null || true
lsof -ti:"$PORT" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
echo "[runner] cleanup ok"
