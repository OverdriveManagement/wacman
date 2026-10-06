#!/bin/bash
# Environnement local de test : PostgreSQL, faux serveur Claude (port 4900), API (4000), front (3000).
# Crée au besoin la base locale et apps/api/.env.dev (mot de passe local tiré au hasard, jamais affiché).
T=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$T/.." && pwd); mkdir -p "$T/out"
service postgresql start >/dev/null 2>&1
if ! sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='wacman'" 2>/dev/null | grep -q 1; then
  sudo -u postgres psql -qc "create role wacman login password 'wacman'" && sudo -u postgres createdb -O wacman wacman
fi
ENVF="$ROOT/apps/api/.env.dev"
if [ ! -f "$ENVF" ]; then
  printf 'DATABASE_URL=postgres://wacman:wacman@localhost:5432/wacman\nBOOTSTRAP_ADMIN_EMAIL=florent@omgt.fr\nBOOTSTRAP_ADMIN_PASSWORD=%s\n' "$(openssl rand -base64 18 | tr -d '/+=')Aa1" > "$ENVF"
  echo "apps/api/.env.dev créé (compte local florent@omgt.fr)"
fi
[ -d "$ROOT/node_modules" ] || (cd "$ROOT" && npm ci)
curl -s -m 5 -o /dev/null localhost:4900 || (cd "$T" && nohup node mock-anthropic.mjs > out/mock.log 2>&1 < /dev/null &)
bash "$T/restart_api.sh"
if ! curl -s -o /dev/null localhost:3000/login; then
  [ -d "$ROOT/apps/web/.next" ] || bash "$T/rebuild_web.sh"
  cd "$ROOT/apps/web" && (NEXT_PUBLIC_API_URL=http://localhost:4000 API_ORIGIN=http://localhost:4000 nohup npx next start -p 3000 > "$T/out/web.log" 2>&1 < /dev/null &)
  for i in $(seq 1 30); do curl -s -o /dev/null localhost:3000/login && break; sleep 1; done
fi
curl -s -m 5 -o /dev/null -w "mock %{http_code} " localhost:4900; curl -s -m 5 -o /dev/null -w "api %{http_code} " localhost:4000/api/health; curl -s -m 5 -o /dev/null -w "web %{http_code}\n" localhost:3000/login
