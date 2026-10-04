#!/bin/sh
# Les règles de balisage existent en double (API et interface) : elles doivent rester identiques.
cmp -s packages/core/src/markup.ts apps/web/lib/markup.ts || { echo "markup.ts diffère entre packages/core et apps/web"; exit 1; }
echo "markup.ts identique"
