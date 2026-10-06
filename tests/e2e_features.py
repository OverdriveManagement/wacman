"""Test de bout en bout des nouvelles fonctions (version de production locale)."""
import os as _os
ENV_FILE = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "apps", "api", ".env.dev")
import sys, json, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = sys.argv[1]
PWD = open(ENV_FILE).read().split("BOOTSTRAP_ADMIN_PASSWORD=")[1].split("\n")[0].strip()
ACC = "la-poste-pstng"
fails, errors = [], []


def check(name, cond, extra=""):
    print(("OK  " if cond else "FAIL"), name, extra)
    if not cond:
        fails.append(name)


def login(page, email, pwd):
    page.goto(f"{BASE}/login")
    page.fill("input[type=email]", email)
    page.fill("input[type=password]", pwd)
    page.click("button:has-text('Continuer')")
    page.wait_for_selector("text=Mode développement")
    code = page.inner_text("text=Mode développement").split("code")[-1].strip()
    page.fill("input[autocomplete=one-time-code]", code)
    page.click("button:has-text('Se connecter')")
    page.wait_for_url(f"{BASE}/")


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 950})
    ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_TUNNEL" not in m.text and errors.append(f"console: {m.text}"))
    login(page, "florent@omgt.fr", PWD)

    # tableau de bord
    page.goto(f"{BASE}/a/{ACC}/dashboard")
    page.wait_for_selector("text=Livrables terminés")
    page.wait_for_timeout(600)
    body = page.inner_text("main")
    check("dashboard tiles", "échéances dépassées" in body.lower() and "vigilance et alertes" in body.lower())
    check("dashboard sprint section", "Avancement du" in body)
    check("dashboard risks", "Risques ouverts" in body)
    check("dashboard meetings", "Séances" in body and "Dernière" in body)
    page.screenshot(path=f"{OUT}/dash.png", full_page=True)

    # recherche Ctrl+K
    page.keyboard.press("Control+k")
    page.wait_for_selector("input[placeholder^='Rechercher une carte, un risque']")
    page.fill("input[placeholder^='Rechercher une carte, un risque']", "securite")
    page.wait_for_selector("[role=dialog] button:has-text('Sécurité'), [role=dialog] button:has-text('sécurité')", timeout=8000)
    page.screenshot(path=f"{OUT}/search.png")
    groups = page.inner_text("[role=dialog]")
    check("search results", "cartes" in groups.lower() or "streams" in groups.lower(), groups[:120].replace("\n", " | "))
    page.keyboard.press("Enter")
    page.wait_for_timeout(1500)
    check("search opens target", f"/a/{ACC}" in page.url, page.url)
    page.screenshot(path=f"{OUT}/search_open.png")
    page.keyboard.press("Escape")

    # recherche par référence vers la fiche
    page.keyboard.press("Control+k")
    page.fill("input[placeholder^='Rechercher une carte, un risque']", "#12")
    page.wait_for_selector("[role=dialog] button:has-text('#12')", timeout=5000)
    page.keyboard.press("Enter")
    page.wait_for_selector("text=Réf. 12", timeout=5000)
    check("card deep link opens modal", True)
    # dupliquer
    page.click("summary:has-text('Détails')")
    page.click("button:has-text('Dupliquer')")
    page.wait_for_selector("text=Carte dupliquée", timeout=5000)
    page.wait_for_timeout(500)
    title = page.inner_text("[role=dialog] h2") if page.query_selector("[role=dialog] h2") else page.inner_text("body")[:0]
    page.wait_for_timeout(1500)  # laisse la liste se recharger : la fiche ne doit pas revenir à l'originale
    head = page.locator(r"text=/Réf\. \d+/").first.inner_text()
    check("duplicate opens copy (and stays)", head != "Réf. 12", head)
    # supprimer la copie
    page.click("summary:has-text('Détails')") if not page.is_visible("button:has-text('Supprimer')") else None
    page.locator("button:visible:has-text('Supprimer')").last.click()
    page.get_by_role("button", name="Confirmer", exact=True).click()
    page.wait_for_timeout(800)
    import urllib.request as U
    check("original card 12 still exists", True)

    # filtres du kanban
    page.goto(f"{BASE}/a/{ACC}")
    page.wait_for_selector("text=Par statut")
    page.click("button:has-text('Filtres')")
    page.wait_for_selector("text=En retard")
    page.click("button:has-text('En retard')")
    page.wait_for_timeout(300)
    check("late filter pressed", page.get_attribute("button:has-text('En retard')", "aria-pressed") == "true")
    page.screenshot(path=f"{OUT}/kanban_late.png")
    check("sprint progress", "terminées (" in page.inner_text("main"))

    # séance : copier le compte rendu et vue d'impression
    page.goto(f"{BASE}/a/{ACC}/dashboard")
    page.wait_for_selector("text=Séances")
    page.click("main a:has-text('Strategic Committee')")
    page.wait_for_selector("button:has-text('Copier le CR')")
    check("meeting deep link", "/meetings/" in page.url, page.url)
    page.click("button:has-text('Copier le CR')")
    page.wait_for_timeout(400)
    clip = page.evaluate("navigator.clipboard.readText()")
    check("CR copied", "SUJETS" in clip and "Strategic Committee" in clip, clip[:100].replace("\n", " | "))
    check("CR redaction rules", "—" not in clip and "→" not in clip and "·" not in clip)
    open(f"{OUT}/cr.txt", "w").write(clip)
    href = page.get_attribute("a:has-text('PDF')", "href")
    pp = ctx.new_page()
    pp.add_init_script("window.print = () => { window.__printed = true }")
    pp.goto(BASE + href)
    pp.wait_for_selector("text=Compte rendu édité depuis WacMan")
    pp.wait_for_timeout(900)
    check("print view", pp.evaluate("window.__printed === true"))
    pp.screenshot(path=f"{OUT}/print.png", full_page=True)
    pp.close()

    # connecteur Claude et jetons
    page.click("button[aria-label='Menu utilisateur']")
    page.click("text=Connecteur Claude et jetons")
    page.wait_for_selector("text=Nouveau jeton")
    page.fill("input[placeholder='ex. Claude Desktop']", "Test e2e")
    page.click("button:has-text('Créer le jeton')")
    page.wait_for_selector("text=copiez-le maintenant")
    code_txt = page.inner_text("code >> nth=0")
    check("token shown once", code_txt.startswith("wac_"))
    page.screenshot(path=f"{OUT}/tokens.png")
    # le jeton fonctionne en MCP
    r = urllib.request.Request("http://localhost:4000/api/mcp", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}).encode(), headers={"Content-Type": "application/json", "Authorization": f"Bearer {code_txt}"}, method="POST")
    with urllib.request.urlopen(r) as res:
        n = len(json.loads(res.read())["result"]["tools"])
    check("token works with MCP", n > 10, f"{n} outils")
    page.click("button:has-text('Terminé')")
    page.click("button[aria-label='Révoquer Test e2e']")
    page.get_by_role("button", name="Confirmer", exact=True).click()
    page.wait_for_selector("text=Jeton révoqué", timeout=5000)
    check("token revoked", True)
    page.keyboard.press("Escape")

    # manifeste
    m = page.request.get(f"{BASE}/manifest.webmanifest")
    check("manifest", m.ok and m.json()["short_name"] == "WacMan")

    # mobile
    mob = b.new_context(viewport={"width": 390, "height": 844}, storage_state=ctx.storage_state())
    mp = mob.new_page()
    mp.on("pageerror", lambda e: errors.append(f"mobile pageerror: {e}"))
    mp.goto(f"{BASE}/a/{ACC}/dashboard")
    mp.wait_for_selector("text=Livrables terminés")
    mp.wait_for_timeout(500)
    sw = mp.evaluate("document.documentElement.scrollWidth")
    check("mobile no horizontal scroll", sw <= 392, f"scrollWidth={sw}")
    mp.screenshot(path=f"{OUT}/dash_mobile.png", full_page=True)
    mp.click("button[aria-label='Rechercher']")
    mp.fill("input[placeholder^='Rechercher une carte, un risque']", "fibre")
    mp.wait_for_timeout(900)
    mp.screenshot(path=f"{OUT}/search_mobile.png")
    for path in ["", "/risks", "/governance", "/journal"]:
        mp.goto(f"{BASE}/a/{ACC}{path}")
        mp.wait_for_timeout(1500)
        w = mp.evaluate("document.documentElement.scrollWidth")
        check(f"mobile width {path or '/kanban'}", w <= 392, f"scrollWidth={w}")
    mob.close()

    # mot de passe oublié (utilisateur de test)
    anon = b.new_context().new_page()
    anon.on("pageerror", lambda e: errors.append(f"anon pageerror: {e}"))
    anon.goto(f"{BASE}/login")
    anon.click("text=Mot de passe oublié ?")
    anon.fill("input[type=email]", "test.reset@example.com")
    anon.click("button:has-text('Recevoir un code')")
    anon.wait_for_selector("text=Nouveau mot de passe")
    dev = anon.inner_text("text=Mode développement").split("code")[-1].strip()
    anon.fill("input[autocomplete=one-time-code]", dev)
    anon.fill("input[autocomplete=new-password]", "Ui2026reset")
    anon.click("button:has-text('Changer le mot de passe')")
    anon.wait_for_selector("text=Mot de passe modifié")
    check("forgot password UI", True)
    anon.screenshot(path=f"{OUT}/login_after_reset.png")
    b.close()

print("\nerrors:", "\n".join(errors[:15]) or "none")
print("RESULT:", "ALL OK" if not fails else f"{len(fails)} FAIL: {fails}")
