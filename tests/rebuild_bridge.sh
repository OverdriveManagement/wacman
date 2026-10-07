#!/bin/bash
# Reconstruit le front WiBridge (next build, avec le contrôle des types et du lint) puis le relance sur le port 3001.
# Seul le serveur qui écoute sur le port 3001 est arrêté (le front WacMan du port 3000 reste en place).
T=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$T/.." && pwd); mkdir -p "$T/out"
fuser -k 3001/tcp >/dev/null 2>&1
sleep 1
cd "$ROOT/apps/bridge"
NEXT_PUBLIC_API_URL=http://localhost:4000 API_ORIGIN=http://localhost:4000 npx next build > "$T/out/build_bridge.log" 2>&1 || { echo "BUILD FAILED"; tail -40 "$T/out/build_bridge.log"; exit 1; }
(NEXT_PUBLIC_API_URL=http://localhost:4000 API_ORIGIN=http://localhost:4000 nohup npx next start -p 3001 > "$T/out/bridge.log" 2>&1 < /dev/null &)
for i in $(seq 1 30); do curl -s -o /dev/null localhost:3001/login && break; sleep 1; done
grep -E "warn|Warning" "$T/out/build_bridge.log" | head; echo "bridge prêt"
