#!/bin/bash
# Rejoue toutes les suites (API relancée avant chacune pour remettre à zéro les limites de connexion).
# Usage : bash tests/run_all.sh [suite.py ...]   (sans argument : toutes)
T=$(cd "$(dirname "$0")" && pwd); mkdir -p "$T/out/shots"
cd "$T"
SUITES=${*:-api_test.py api_fix.py e2e_v12.py e2e_features.py e2e_assistant.py e2e_fresh.py e2e_cr.py e2e_tour.py api_v15.py e2e_v15.py bridge_api.py bridge_e2e.py}
for t in $SUITES; do
  bash restart_api.sh; sleep 2
  echo "=== $t"
  timeout 590 python3 "$t" "$T/out/shots" > "$T/out/$t.log" 2>&1
  grep -E "^FAIL|RESULT|Traceback|HAS_FINAL|ERRORBOX" "$T/out/$t.log" | head -12
done
echo "=== FIN"
