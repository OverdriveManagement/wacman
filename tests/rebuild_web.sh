#!/bin/bash
# Reconstruit le front (next build, avec le contrôle des types et du lint) puis le relance sur le port 3000.
T=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$T/.." && pwd); mkdir -p "$T/out"
for p in $(pgrep next-server); do kill $p; done
sleep 1
cd "$ROOT/apps/web"
NEXT_PUBLIC_API_URL=http://localhost:4000 API_ORIGIN=http://localhost:4000 npx next build > "$T/out/build.log" 2>&1 || { echo "BUILD FAILED"; tail -30 "$T/out/build.log"; exit 1; }
(NEXT_PUBLIC_API_URL=http://localhost:4000 API_ORIGIN=http://localhost:4000 nohup npx next start -p 3000 > "$T/out/web.log" 2>&1 < /dev/null &)
for i in $(seq 1 30); do curl -s -o /dev/null localhost:3000/login && break; sleep 1; done
grep -E "warn|Warning" "$T/out/build.log" | head; echo "web prêt"
