#!/bin/sh
# Les règles de balisage existent en trois copies (API, WacMan, WiBridge) : elles doivent rester identiques.
for f in apps/web/lib/markup.ts apps/bridge/lib/markup.ts; do
  cmp -s packages/core/src/markup.ts "$f" || { echo "markup.ts diffère entre packages/core et $f"; exit 1; }
done
echo "markup.ts identique (core, web, bridge)"
