#!/bin/bash
# =============================================================================
# Raccordement d'un autre compte Claude à WacMan
# -----------------------------------------------------------------------------
# À lancer par Florent sur son ordinateur, dans le dossier du dépôt :
#     bash tools/connect_claude_account.sh [identifiant-github-du-nouveau-compte]
#
# Ce que fait le script (rien n'est fait sans confirmation) :
#   1. vérifie que GitHub CLI (gh) est connecté et voit le dépôt OverdriveManagement/wacman ;
#   2. si le nouveau compte Claude utilise un autre identifiant GitHub, l'invite sur le dépôt (droit push) ;
#   3. ouvre, une par une, les pages où donner les accès (application GitHub Claude, Claude Code, connecteurs) ;
#   4. teste un jeton d'accès WacMan sur le serveur MCP de production et copie l'adresse du connecteur ;
#   5. affiche la liste de contrôle de ce qui reste à faire à la main.
#
# Le script ne lit, n'affiche ni n'enregistre aucun mot de passe. Le jeton WacMan est saisi en masqué,
# utilisé pour un seul test, puis copié dans le presse-papiers sans être affiché.
# Voir docs/PASSATION.md, partie « Connexions à établir », pour le détail de chaque étape.
# =============================================================================

REPO="OverdriveManagement/wacman"
API="${WACMAN_API:-https://wacman-api-production.up.railway.app}"
WEB="https://wacman.vercel.app"
NEW_GH_USER="$1"

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok() { printf '  [ok] %s\n' "$1"; }
warn() { printf '  [!] %s\n' "$1"; }
ask() { local r; read -r -p "  $1 [o/N] " r; [ "$r" = "o" ] || [ "$r" = "O" ] || [ "$r" = "oui" ]; }
open_url() {
  printf '  Ouverture : %s\n' "$1"
  if command -v open >/dev/null 2>&1; then open "$1"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1; else printf '  (ouvrez cette adresse dans le navigateur)\n'; fi
}
pause() { read -r -p "  Entrée quand c'est fait pour continuer... " _; }
to_clipboard() {
  if command -v pbcopy >/dev/null 2>&1; then printf '%s' "$1" | pbcopy; return 0; fi
  if command -v xclip >/dev/null 2>&1; then printf '%s' "$1" | xclip -selection clipboard; return 0; fi
  if command -v wl-copy >/dev/null 2>&1; then printf '%s' "$1" | wl-copy; return 0; fi
  if command -v clip.exe >/dev/null 2>&1; then printf '%s' "$1" | clip.exe; return 0; fi
  return 1
}

# -----------------------------------------------------------------------------
bold "1. GitHub : accès au dépôt $REPO"
if ! command -v gh >/dev/null 2>&1; then
  warn "GitHub CLI (gh) n'est pas installé (https://cli.github.com) : invitation éventuelle à faire sur github.com,"
  warn "page Settings, Collaborators du dépôt $REPO."
elif ! gh auth status >/dev/null 2>&1; then
  warn "gh n'est pas connecté (lancez « gh auth login » puis relancez ce script pour l'étape d'invitation)."
else
  ME=$(gh api user --jq .login 2>/dev/null)
  ok "gh connecté en tant que $ME"
  if gh repo view "$REPO" --json name >/dev/null 2>&1; then ok "le dépôt $REPO est visible avec ce compte"; else warn "le dépôt $REPO n'est pas visible avec $ME"; fi

  bold "2. GitHub : identifiant du nouveau compte Claude"
  if [ -z "$NEW_GH_USER" ]; then
    read -r -p "  Identifiant GitHub que le nouveau compte Claude utilisera (Entrée si c'est $ME) : " NEW_GH_USER
  fi
  if [ -n "$NEW_GH_USER" ] && [ "$NEW_GH_USER" != "$ME" ]; then
    if gh api "repos/$REPO/collaborators/$NEW_GH_USER" >/dev/null 2>&1; then
      ok "$NEW_GH_USER a déjà accès au dépôt"
    elif ask "Inviter $NEW_GH_USER sur $REPO avec le droit d'écriture (push) ?"; then
      if gh api -X PUT "repos/$REPO/collaborators/$NEW_GH_USER" -f permission=push >/dev/null; then
        ok "invitation envoyée : $NEW_GH_USER doit l'accepter (e-mail GitHub ou https://github.com/$REPO/invitations)"
      else
        warn "invitation refusée par GitHub (droits d'administrateur sur l'organisation OverdriveManagement nécessaires)"
      fi
    fi
  else
    ok "même identifiant GitHub ($ME) : pas d'invitation nécessaire"
  fi
fi

# -----------------------------------------------------------------------------
bold "3. Application GitHub Claude sur l'organisation OverdriveManagement"
echo "  Sans elle, Claude Code (dans le navigateur) ne voit pas un dépôt privé."
echo "  Choisissez OverdriveManagement, puis « Only select repositories » et wacman (ou tous les dépôts)."
if ask "Ouvrir la page d'installation ?"; then open_url "https://github.com/apps/claude/installations/new"; pause; fi

bold "4. Claude Code dans le nouveau compte Claude"
echo "  Connectez-vous à claude.ai/code avec le NOUVEAU compte, reliez GitHub, gardez l'environnement Default (réseau Trusted)."
echo "  Sur un plan Team ou Enterprise, un propriétaire de l'organisation doit d'abord activer le connecteur GitHub"
echo "  (Admin settings, Connectors)."
if ask "Ouvrir claude.ai/code ?"; then open_url "https://claude.ai/code"; pause; fi

bold "5. Connecteurs Railway et Vercel dans le nouveau compte Claude"
echo "  Customize, Connectors : ajoutez Railway et Vercel, et connectez-vous avec VOS comptes Railway et Vercel"
echo "  (ceux qui portent le projet Railway « wacman » et le projet Vercel « wacman » de l'équipe Flogger Forge)."
echo "  Ajoutez aussi, si besoin : Notion (ancien espace La Poste - PSTNG), Gmail (CR envoyés), Google Drive (decks)."
if ask "Ouvrir la page des connecteurs ?"; then open_url "https://claude.ai/customize/connectors"; pause; fi

# -----------------------------------------------------------------------------
bold "6. Connecteur WacMan (serveur MCP) pour lire et modifier le contenu des comptes"
echo "  Dans WacMan : menu utilisateur, « Connecteur Claude et jetons », créez un jeton nommé par exemple"
echo "  « Claude <nom du compte> », sans lecture seule si le nouveau compte doit pouvoir modifier."
echo "  Attention : sur une offre Team ou Enterprise, le connecteur est partagé avec toute l'organisation et l'adresse"
echo "  contient le jeton ; préférez alors un jeton en lecture seule (docs/PASSATION.md, partie 11.4)."
if ask "Ouvrir WacMan ?"; then open_url "$WEB"; fi
read -r -s -p "  Collez le jeton (wac_...) puis Entrée (rien ne s'affiche ; Entrée seule pour passer) : " TOKEN; echo
if [ -n "$TOKEN" ]; then
  case "$TOKEN" in wac_*) ;; *) warn "un jeton WacMan commence par wac_";; esac
  RES=$(curl -s -m 20 -X POST "$API/api/mcp" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_accounts","arguments":{}}}')
  if printf '%s' "$RES" | grep -q '"account'; then
    ok "jeton valide, comptes accessibles :"
    printf '%s' "$RES" | grep -o 'account[^,]*' | sed 's/[\\"]//g; s/^/      /'
    URL="$API/api/mcp/$TOKEN"
    if to_clipboard "$URL"; then
      ok "adresse du connecteur copiée dans le presse-papiers (elle contient le jeton : ne la partagez pas)"
    else
      warn "presse-papiers indisponible : l'adresse est $API/api/mcp/ suivie du jeton"
    fi
    echo "  Dans le nouveau compte Claude : Customize, Connectors, « + Add », « Add custom connector »,"
    echo "  nom « WacMan », adresse collée, authentification « No sign in »."
    echo "  (Team ou Enterprise : un propriétaire l'ajoute dans Organization settings, Connectors.)"
  else
    warn "le jeton n'a pas été accepté : $(printf '%s' "$RES" | head -c 200)"
  fi
  unset TOKEN URL RES
fi

# -----------------------------------------------------------------------------
bold "7. Ce qui reste à faire à la main"
cat <<'TXT'
  [ ] Nouveau compte Claude : créer un projet « WacMan » et y déposer docs/PASSATION.md (instructions du projet :
      « Lis docs/PASSATION.md et CLAUDE.md du dépôt OverdriveManagement/wacman avant toute évolution »).
  [ ] Première session Claude Code sur le dépôt wacman : coller le message de démarrage (fin de docs/PASSATION.md).
  [ ] Pour les tests locaux : télécharger la sauvegarde JSON du compte La Poste (WacMan, Paramètres du compte,
      Données, « Sauvegarde complète du compte ») et la joindre à la session ; elle n'est pas versionnée.
  [ ] Facultatif : révoquer plus tard dans WacMan les jetons inutilisés (menu utilisateur, Connecteur Claude et jetons).
  Les secrets de production (Anthropic, Resend, session) restent dans Railway : rien à transmettre au nouveau compte.
TXT
echo
