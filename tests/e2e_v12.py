"""Tests de bout en bout V1.2 : kanban par sprint, Program weekly (faits marquants, alertes, planning), paramétrage en place, mise en forme."""
import os as _os
ENV_FILE = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "apps", "api", ".env.dev")
import sys, json, urllib.request, http.cookiejar
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
API = "http://localhost:4000"
OUT = sys.argv[1]
PWD = open(ENV_FILE).read().split("BOOTSTRAP_ADMIN_PASSWORD=")[1].split("\n")[0].strip()
ACC = "la-poste-pstng"
fails, errors = [], []


def check(name, cond, extra=""):
    print(("OK  " if cond else "FAIL"), name, extra)
    if not cond:
        fails.append(name)


# client API (cookie) pour vérifier et nettoyer
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method, headers={"Content-Type": "application/json"} if body is not None else {})
    try:
        with op.open(r) as res:
            t = res.read().decode()
            return res.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


s, r = req("POST", "/api/auth/login", {"email": "florent@omgt.fr", "password": PWD})
req("POST", "/api/auth/verify", {"challengeId": r["challengeId"], "code": r["devCode"]})
boot = req("GET", f"/api/accounts/{ACC}")[1]


def cards():
    return req("GET", f"/api/accounts/{ACC}/cards")[1]


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 950})
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_TUNNEL" not in m.text and errors.append(f"console: {m.text}"))
    page.goto(f"{BASE}/login")
    page.fill("input[type=email]", "florent@omgt.fr")
    page.fill("input[type=password]", PWD)
    page.click("button:has-text('Continuer')")
    page.wait_for_selector("text=Mode développement")
    page.fill("input[autocomplete=one-time-code]", page.inner_text("text=Mode développement").split("code")[-1].strip())
    page.click("button:has-text('Se connecter')")
    page.wait_for_url(f"{BASE}/")

    # ------------------------------------------------------------- kanban
    page.goto(f"{BASE}/a/{ACC}")
    page.wait_for_selector("text=Par statut")
    page.wait_for_timeout(800)
    body = page.inner_text("main")
    check("kanban sans faits marquants ni alertes", "Derniers faits marquants" not in body and "Cartes en vigilance ou en alerte" not in body)
    check("onglets de sprint", "Sprint 1" in body and "Sans sprint" in body)
    page.screenshot(path=f"{OUT}/k_status.png")

    check("hors mode édition : pas de bouton de structure", page.locator("button[aria-label='Créer un sprint']").count() == 0 and page.locator("button[aria-label^='Options de la colonne']").count() == 0)
    check("hors mode édition : déplacement possible", page.locator("[aria-roledescription^=carte]").count() > 5)
    page.click("button[aria-pressed]:has-text('Mode édition')")
    page.wait_for_selector("text=Terminer l'édition")
    # créer un sprint depuis le kanban
    page.click("button[aria-label='Créer un sprint']")
    page.wait_for_selector("text=Nouveau sprint")
    page.fill("[role=dialog] input >> nth=0", "Sprint Test")
    page.click("button:has-text('Créer le sprint')")
    page.wait_for_selector("button:has-text('Sprint Test')")
    sp = next((x for x in req("GET", f"/api/accounts/{ACC}")[1]["sprints"] if x["name"] == "Sprint Test"), None)
    check("sprint créé en place, enchaîné au dernier", sp is not None and sp["startDate"] is not None, str(sp and (sp["startDate"], sp["endDate"])))
    page.click("button[aria-label='Options du Sprint Test']")
    page.click("[role=menu] >> text=Modifier le sprint")
    page.click("[role=dialog] button:has-text('Supprimer')")
    page.get_by_role("button", name="Confirmer", exact=True).click()
    page.wait_for_timeout(800)
    check("sprint supprimé", not any(x["name"] == "Sprint Test" for x in req("GET", f"/api/accounts/{ACC}")[1]["sprints"]))

    # ajouter une colonne
    page.locator("button[aria-label='Ajouter une colonne']").last.click()
    page.wait_for_selector("text=Colonne du kanban")
    page.fill("[role=dialog] input >> nth=1", "Recette")
    page.click("[role=dialog] button:has-text('Enregistrer')")
    page.wait_for_timeout(800)
    opt = next((o for o in req("GET", f"/api/accounts/{ACC}")[1]["options"] if o["label"] == "Recette"), None)
    check("colonne créée en place", opt is not None and opt["kind"] == "CARD_STATUS")
    page.screenshot(path=f"{OUT}/k_newcol.png")
    if opt:
        req("DELETE", f"/api/accounts/{ACC}/e/option/{opt['id']}")

    # menu d'un couloir (le mode édition reste actif dans la page)
    page.locator("button[aria-label^='Options du stream']").first.click()
    page.click("[role=menu] >> text=Modifier le stream")
    page.wait_for_selector("text=Couloir du kanban et du planning")
    check("fenêtre stream depuis le couloir", True)
    page.keyboard.press("Escape")

    # vue par sprint et glisser vers « Non planifiées »
    page.click("[role=tab]:has-text('Par sprint')")
    page.locator("text=Non planifiées").last.wait_for()
    page.wait_for_timeout(500)
    page.screenshot(path=f"{OUT}/k_sprints.png")
    before = {c["id"]: c for c in cards()}
    tile = page.locator("[aria-roledescription^=carte]").first
    title = tile.inner_text().split("\n")[0]
    target = page.locator("[id^='cell']").first  # pas d'id DOM : on vise l'en-tête Non planifiées
    hb = page.locator("text=Non planifiées").last.bounding_box()
    tb = tile.bounding_box()
    page.mouse.move(tb["x"] + 20, tb["y"] + 10)
    page.mouse.down()
    page.mouse.move(tb["x"] + 40, tb["y"] + 30, steps=5)
    # cellule de la même ligne sous la colonne « Non planifiées »
    page.mouse.move(hb["x"] + 40, tb["y"] + 15, steps=15)
    page.mouse.up()
    page.wait_for_timeout(1200)
    after = {c["id"]: c for c in cards()}
    moved = [cid for cid in after if before[cid]["sprintId"] != after[cid]["sprintId"]]
    check("glisser vers Non planifiées change le sprint", len(moved) == 1 and after[moved[0]]["sprintId"] is None, f"{title} {moved}")
    for cid in moved:
        req("PATCH", f"/api/accounts/{ACC}/e/card/{cid}", {"sprintId": before[cid]["sprintId"]})

    # fiche carte : début prévu, nouveau contact en place, case à cocher
    c0 = cards()[0]
    req("PATCH", f"/api/accounts/{ACC}/e/card/{c0['id']}", {"description": "[ ] tâche à cocher\n- puce **grasse**"})
    page.goto(f"{BASE}/a/{ACC}?card={c0['id']}")
    page.wait_for_selector("text=Vigilance / Alerte")
    check("propriétés de la carte en étiquettes", page.locator("[role=dialog] select").count() == 0)
    page.click("[role=dialog] button[aria-label='Cocher']")
    page.wait_for_timeout(700)
    d = req("GET", f"/api/accounts/{ACC}/e/card/{c0['id']}")[1]["description"]
    check("case à cocher cliquable", d.startswith("[x] tâche"), d[:30])
    page.locator("[role=dialog] button[aria-label^='Porteur'], [role=dialog] button[aria-label='Ajouter : Porteur']").first.click()
    page.click("#wacman-popover >> text=+ Nouveau contact…")
    page.fill("#wacman-popover input", "Contact Test")
    page.click("#wacman-popover button:has-text('Créer')")
    page.wait_for_timeout(900)
    ct = next((x for x in req("GET", f"/api/accounts/{ACC}")[1]["contacts"] if x["name"] == "Contact Test"), None)
    d2 = req("GET", f"/api/accounts/{ACC}/e/card/{c0['id']}")[1]
    check("nouveau contact créé et affecté", ct is not None and d2["ownerId"] == ct["id"])
    # barre de mise en forme dans une cellule
    page.locator("[role=dialog] div.label:has-text('Point d\\'avancement') + div").click()
    page.wait_for_selector("[role=toolbar][aria-label='Mise en forme']")
    ta = page.locator("[role=dialog] textarea").first
    ta.fill("texte important")
    ta.evaluate("el => el.setSelectionRange(6, 15)")
    page.click("[role=toolbar] button[aria-label='Gras (Ctrl+B)']")
    page.keyboard.press("Control+Enter")
    page.wait_for_timeout(700)
    pn = req("GET", f"/api/accounts/{ACC}/e/card/{c0['id']}")[1]["progressNote"]
    check("bouton Gras", pn == "texte **important**", pn)
    page.screenshot(path=f"{OUT}/card_modal.png")
    req("PATCH", f"/api/accounts/{ACC}/e/card/{c0['id']}", {"ownerId": c0["ownerId"], "description": c0["description"], "progressNote": c0["progressNote"]})
    if ct:
        req("DELETE", f"/api/accounts/{ACC}/e/contact/{ct['id']}")
    page.keyboard.press("Escape")

    # ------------------------------------------------------------- Program weekly
    pw = next(t for t in boot["meetingTypes"] if t["name"] == "Program weekly")
    page.goto(f"{BASE}/a/{ACC}/meetings/{pw['id']}")
    page.wait_for_selector("text=Planning des livrables par stream")
    page.wait_for_timeout(1200)
    body = page.inner_text("main")
    check("PW : faits marquants, alertes, planning", "Faits marquants" in body and "Cartes en vigilance ou en alerte" in body and "Planning des livrables" in body)
    check("PW : sélecteur de séance", page.locator("select[aria-label^='Séance']").count() == 1)
    page.screenshot(path=f"{OUT}/pw_full.png", full_page=True)
    check("faits marquants sans listes déroulantes", page.locator("article select").count() == 0)
    # ajout discret d'un fait marquant
    page.click("button[aria-label='Ajouter un fait marquant']")
    page.fill("input[aria-label='Nouveau fait marquant']", "FM rapide test")
    page.keyboard.press("Enter")
    page.wait_for_selector("text=FM rapide test")
    mt = req("GET", f"/api/accounts/{ACC}/meetings?typeId={pw['id']}")[1][0]
    hl = next((h for h in mt["highlights"] if h["title"] == "FM rapide test"), None)
    check("ajout rapide d'un fait marquant", hl is not None)
    # édition directe du détail avec italique
    page.locator("article:has-text('FM rapide test') >> text=Détail du fait marquant…").click()
    ta = page.locator("article:has-text('FM rapide test') textarea")
    ta.fill("à suivre")
    ta.evaluate("el => el.setSelectionRange(0, 8)")
    page.click("article:has-text('FM rapide test') [role=toolbar] button[aria-label='Italique (Ctrl+I)']")
    page.locator("h3:has-text('Faits marquants')").click()
    page.wait_for_timeout(800)
    hl2 = next(h for h in req("GET", f"/api/accounts/{ACC}/meetings?typeId={pw['id']}")[1][0]["highlights"] if h["id"] == hl["id"])
    check("édition directe du détail avec mise en forme", hl2["detail"] == "*à suivre*", hl2["detail"])
    # étiquette vide : pastille discrète, puis choix du type
    page.click("article:has-text('FM rapide test') button[aria-label='Ajouter : Type']")
    page.locator("#wacman-popover button").first.click()
    page.wait_for_timeout(700)
    hl3 = next(h for h in req("GET", f"/api/accounts/{ACC}/meetings?typeId={pw['id']}")[1][0]["highlights"] if h["id"] == hl["id"])
    check("pastille d'étiquette vide puis choix", hl3["typeId"] is not None)
    req("DELETE", f"/api/accounts/{ACC}/e/highlight/{hl['id']}")
    # alertes : ouverture de la carte depuis le module
    page.reload()
    page.wait_for_selector("text=Planning des livrables par stream")
    page.locator("table.data tbody tr").first.click()
    page.wait_for_selector("[role=dialog] >> text=Réf.")
    check("carte ouverte depuis les alertes", True)
    page.keyboard.press("Escape")
    # planning : titre cliquable et glisser une barre
    bars = page.locator("div.cursor-grab.rounded-full")
    check("barres de planning", bars.count() > 5, str(bars.count()))
    cs = {c["id"]: c for c in cards()}
    bar = bars.nth(2)
    bar.scroll_into_view_if_needed()
    bb = bar.bounding_box()
    page.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2)
    page.mouse.down()
    page.mouse.move(bb["x"] + bb["width"] / 2 + 34, bb["y"] + bb["height"] / 2, steps=6)
    page.mouse.move(bb["x"] + bb["width"] / 2 + 66, bb["y"] + bb["height"] / 2, steps=6)
    page.mouse.up()
    page.wait_for_timeout(1200)
    cs2 = {c["id"]: c for c in cards()}
    ch = [(cid, cs[cid]["startDate"], cs2[cid]["startDate"], cs[cid]["dueDate"], cs2[cid]["dueDate"]) for cid in cs if (cs[cid]["startDate"], cs[cid]["dueDate"]) != (cs2[cid]["startDate"], cs2[cid]["dueDate"])]
    check("glisser une barre replanifie la carte (+3 jours)", len(ch) == 1, str(ch))
    for cid, s0, _, d0, _ in ch:
        req("PATCH", f"/api/accounts/{ACC}/e/card/{cid}", {"startDate": s0, "dueDate": d0})
    page.screenshot(path=f"{OUT}/pw_planning.png")
    page.locator("button[title^='#']").first.click()
    page.wait_for_selector("[role=dialog] >> text=Vigilance / Alerte")
    check("titre du planning ouvre la carte", True)
    page.keyboard.press("Escape")

    # menu latéral rétractable
    page.click("button[aria-label='Réduire le menu']")
    page.wait_for_timeout(300)
    w = page.evaluate("document.querySelector('aside').getBoundingClientRect().width")
    check("menu réduit aux pictos", w < 80, f"largeur {w}")
    page.screenshot(path=f"{OUT}/collapsed.png")
    page.click("button[aria-label='Déplier le menu']")

    # mobile
    mob = b.new_context(viewport={"width": 390, "height": 844}, storage_state=ctx.storage_state())
    mp = mob.new_page()
    mp.on("pageerror", lambda e: errors.append(f"mobile pageerror: {e}"))
    for path, name in [("", "kanban"), (f"/meetings/{pw['id']}", "pw")]:
        mp.goto(f"{BASE}/a/{ACC}{path}")
        mp.wait_for_timeout(2000)
        w = mp.evaluate("document.documentElement.scrollWidth")
        check(f"mobile {name} sans défilement horizontal", w <= 392, f"scrollWidth={w}")
        mp.screenshot(path=f"{OUT}/m_{name}.png", full_page=True)
    mob.close()
    b.close()

print("\nerrors:", "\n".join(errors[:15]) or "none")
print("RESULT:", "ALL OK" if not fails else f"{len(fails)} FAIL: {fails}")
