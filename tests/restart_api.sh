#!/bin/bash
# Relance l'API locale (tsx watch) avec le faux serveur Claude ; remet aussi à zéro les limites de tentatives.
T=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$T/.." && pwd); mkdir -p "$T/out"
for p in $(pgrep -f "tsx.*server.ts"); do kill $p 2>/dev/null; done
sleep 1
cd "$ROOT"
set -a; . apps/api/.env.dev; set +a
ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://localhost:4900 WEB_ORIGINS=http://localhost:3000 nohup npm run dev:api > "$T/out/api.log" 2>&1 < /dev/null &
for i in $(seq 1 30); do curl -s localhost:4000/api/health >/dev/null && break; sleep 1; done
