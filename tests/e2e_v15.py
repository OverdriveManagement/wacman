"""V1.5 dans le navigateur : actions & décisions, séance (quoi de neuf, relevé, e-mail), import d'un CR d'atelier,
faits marquants proposés, revue de stream (présentation), bilan de sprint, export PowerPoint par modèle."""
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
# état de départ : l'action témoin est ouverte
for a in req("GET", f"/api/accounts/{ACC}/e/action")[1]:
    if a["title"].startswith("Proposer 2 ou 3 créneaux") and a["status"] != "OPEN":
        req("PATCH", f"/api/accounts/{ACC}/e/action/{a['id']}", {"status": "OPEN"})
mts = {m["name"]: m for m in boot["meetingTypes"]}
coproj = next(t for t in boot["meetingTypes"] if "COPROJ" in t["name"].upper())
weekly = next(t for t in boot["meetingTypes"] if "weekly" in t["name"].lower())
strat = next((t for t in boot["meetingTypes"] if "TOPICS" in t["blocks"]), None)
sprint = next(s for s in boot["sprints"] if s["state"] == "CURRENT")
clip_js = """async () => { const items = await navigator.clipboard.read(); const out = {}; for (const it of items) for (const t of it.types) out[t] = await (await it.getType(t)).text(); return out; }"""


def no_overflow(page):
    return page.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1")


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 950}, permissions=["clipboard-read", "clipboard-write"], accept_downloads=True)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"console: {m.text[:200]}"))
    page.goto(f"{BASE}/login")
    page.fill("input[type=email]", "florent@omgt.fr")
    page.fill("input[type=password]", PWD)
    page.click("button:has-text('Continuer')")
    page.wait_for_selector("text=Mode développement")
    page.fill("input[autocomplete=one-time-code]", page.inner_text("text=Mode développement").split("code")[-1].strip())
    page.click("button:has-text('Se connecter')")
    page.wait_for_url(f"{BASE}/")

    # ------------------------------------------------------------ page Actions & décisions
    page.goto(f"{BASE}/a/{ACC}/dashboard")
    page.click("nav a:has-text('Actions & décisions')")
    page.wait_for_selector("h1:has-text('Actions & décisions')")
    page.wait_for_selector("text=Proposer 2 ou 3 créneaux")
    check("relevé : actions reprises affichées", page.locator("text=Passer la commande du pilote").count() >= 1)
    page.select_option("select[aria-label='Statut des actions']", "all")
    page.click("[role=tab]:has-text('Décisions')")
    page.wait_for_timeout(400)
    check("registre : décisions reprises affichées", page.locator("[data-decision-id]").count() >= 4, str(page.locator("[data-decision-id]").count()))
    page.screenshot(path=f"{OUT}/v15_followup.png")

    # ------------------------------------------------------------ import d'un CR d'atelier
    page.click("[role=tab]:has-text('Actions')")
    page.click("button:has-text(\"Importer un CR d'atelier\")")
    page.fill("input[placeholder='Ex. Atelier IPAM']", "Atelier IPAM test")
    page.fill("textarea[placeholder*='Collez ici']", "Atelier IPAM. La Poste envoie le plan d'adressage avant le 15 octobre. Wifirst organise la recette. Le lot 1 démarre le 20.")
    page.click("button:has-text('Analyser avec Claude')")
    page.wait_for_selector("[data-proposal=action]", timeout=15000)
    check("import : propositions affichées", page.locator("[data-proposal]").count() == 4, str(page.locator("[data-proposal]").count()))
    page.screenshot(path=f"{OUT}/v15_import.png")
    first = page.locator("[data-proposal=action]").first
    first.locator("input[aria-label='Intitulé']").fill("Envoyer le plan d'adressage IPAM (test V15)")
    first.locator("button:has-text('Créer')").click()
    page.wait_for_selector("text=✓ Créée")
    page.locator("[data-proposal=action]").nth(1).locator("button:has-text('Ignorer')").click()
    page.click("button:has-text('Créer les 2 restantes')")
    page.wait_for_timeout(1200)
    check("import : toutes traitées", page.locator("text=✓ Créée").count() == 3, str(page.locator("text=✓ Créée").count()))
    page.click("button:has-text('Terminer')")
    acts = req("GET", f"/api/accounts/{ACC}/e/action")[1]
    created = next((a for a in acts if a["title"] == "Envoyer le plan d'adressage IPAM (test V15)"), None)
    check("import : action créée avec l'origine", created is not None and created["party"] == "CLIENT" and "Atelier IPAM test" in created["note"], str(created))
    check("import : action ignorée non créée", not any(a["title"] == "Planifier l'atelier de recette" for a in acts))
    cards = req("GET", f"/api/accounts/{ACC}/cards")[1]
    card = next((c for c in cards if c["title"] == "Recette IPAM"), None)
    check("import : carte créée dans le sprint en cours", card is not None and card["sprintId"] == sprint["id"], str(card and card["sprintId"]))
    decs = req("GET", f"/api/accounts/{ACC}/e/decision")[1]
    dec = next((x for x in decs if x["title"] == "Le lot 1 démarre le 20 octobre"), None)
    check("import : décision prise créée", dec is not None and dec["status"] == "TAKEN", str(dec))
    if created:
        req("DELETE", f"/api/accounts/{ACC}/e/action/{created['id']}")
    if card:
        req("DELETE", f"/api/accounts/{ACC}/e/card/{card['id']}")
    if dec:
        req("DELETE", f"/api/accounts/{ACC}/e/decision/{dec['id']}")

    # ------------------------------------------------------------ séance COPROJ : quoi de neuf, relevé, e-mail
    page.goto(f"{BASE}/a/{ACC}/meetings/{coproj['id']}")
    page.wait_for_selector("text=Relevé des actions")
    page.wait_for_selector("[data-testid=whats-new]")
    page.click("[data-testid=whats-new] button")
    page.wait_for_timeout(300)
    check("quoi de neuf : panneau", "Quoi de neuf depuis le" in page.inner_text("[data-testid=whats-new]"))
    row = page.locator("[data-action-id]", has_text="Proposer 2 ou 3 créneaux").first
    row.locator("input[type=checkbox]").click()
    page.wait_for_timeout(800)
    a1 = next(a for a in req("GET", f"/api/accounts/{ACC}/e/action")[1] if a["title"].startswith("Proposer 2 ou 3 créneaux"))
    check("relevé : action cochée faite", a1["status"] == "DONE", a1["status"])
    req("PATCH", f"/api/accounts/{ACC}/e/action/{a1['id']}", {"status": "OPEN"})
    page.reload()
    page.wait_for_selector("text=Relevé des actions")
    page.click("button:has-text('Copier le CR')")
    page.wait_for_selector("text=avec sa mise en forme", timeout=8000)
    data = page.evaluate(clip_js)
    html = data.get("text/html", "")
    check("CR COPROJ : relevé des actions", "Relevé des actions" in html and "Proposer 2 ou 3 créneaux" in html)
    check("CR COPROJ : introduction du gabarit", "compte rendu du COPROJ PST NG du" in html)
    check("CR COPROJ : formule de fin", "N&#39;hésitez pas à revenir vers moi" in html or "N'hésitez pas à revenir vers moi" in html)
    open(f"{OUT}/v15_cr_coproj.html", "w").write(html)
    page.click("[aria-label='E-mail du compte rendu']")
    page.click("[role=menuitem]:has-text(\"Copier l'objet\")")
    page.wait_for_timeout(300)
    subj = page.evaluate("() => navigator.clipboard.readText()")
    check("objet du CR", subj.startswith("WIFIRST / PSTNG : CR COPROJ du ") and subj[-10:].count("/") == 2, subj)
    # export PowerPoint de la séance : modèle COPROJ présélectionné
    page.click("[aria-label='Options']")
    page.click("[role=menuitem]:has-text('Exporter la séance affichée')")
    page.wait_for_selector("[role=dialog] button[aria-pressed=true]:has-text('COPROJ')")
    with page.expect_download(timeout=30000) as dl:
        page.click("button:has-text('Télécharger le PowerPoint')")
    check("export PowerPoint COPROJ", "coproj" in dl.value.suggested_filename, dl.value.suggested_filename)
    page.keyboard.press("Escape")

    # ------------------------------------------------------------ séance à sujets : registre des décisions
    if strat:
        page.goto(f"{BASE}/a/{ACC}/meetings/{strat['id']}")
        page.wait_for_selector("text=Décisions prises en séance")
        check("séance à sujets : bloc décisions", True)

    # ------------------------------------------------------------ Program weekly : faits marquants proposés
    page.goto(f"{BASE}/a/{ACC}/meetings/{weekly['id']}")
    page.wait_for_selector("h3:has-text('Faits marquants')")
    before = len(req("GET", f"/api/accounts/{ACC}/meetings?typeId={weekly['id']}")[1][0]["highlights"])
    page.click("button:has-text('Proposer')")
    page.wait_for_selector("[data-proposal=highlight]", timeout=15000)
    page.locator("[data-proposal=highlight]").nth(1).locator("input[type=checkbox]").uncheck()
    page.click("button:has-text('Ajouter 1 fait marquant')")
    page.wait_for_timeout(800)
    m0 = req("GET", f"/api/accounts/{ACC}/meetings?typeId={weekly['id']}")[1][0]
    added = [h for h in m0["highlights"] if h["title"] == "Avancement du sprint"]
    check("faits marquants : un seul ajouté", len(m0["highlights"]) == before + 1 and len(added) == 1, f"{before} puis {len(m0['highlights'])}")
    for h in added:
        req("DELETE", f"/api/accounts/{ACC}/e/highlight/{h['id']}")

    # ------------------------------------------------------------ revue de stream
    page.click("nav a:has-text('Revue de stream')")
    page.wait_for_selector("h1:has-text('Revue de stream')")
    page.wait_for_selector("text=Dernier statut")
    check("revue de stream : sections", all(page.locator(f"h2:has-text('{t}')").count() for t in ["Dernier statut", "Livrables", "Actions", "Risques ouverts"]))
    page.screenshot(path=f"{OUT}/v15_stream.png", full_page=True)
    first_stream = page.input_value("select[aria-label=Stream]")
    page.click("button:has-text('Présenter')")
    page.wait_for_selector("[data-testid=presentation]")
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(600)
    check("présentation : flèche droite change de stream", page.input_value("[data-testid=presentation] select[aria-label=Stream]") != first_stream)
    check("présentation : adresse suit le stream", "?s=" in page.url, page.url)
    page.screenshot(path=f"{OUT}/v15_present.png")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    check("présentation : Échap quitte", page.locator("[data-testid=presentation]").count() == 0)

    # ------------------------------------------------------------ bilan de sprint
    page.goto(f"{BASE}/a/{ACC}/governance")
    page.click(f"a[href$='/sprints/{sprint['id']}']")
    page.wait_for_selector(f"h1:has-text('Bilan du {sprint['name']}')")
    check("bilan : chiffres", page.locator("text=Livrables au périmètre").count() == 1)
    page.click("button:has-text(\"Copier l'e-mail\")")
    page.wait_for_selector("text=Bilan copié", timeout=8000)
    data = page.evaluate(clip_js)
    check("bilan : e-mail mis en forme", "Synthèse" in data.get("text/html", "") and "Restant à terminer" in data.get("text/html", "") or "restant" in data.get("text/html", ""), data.get("text/html", "")[:120])
    page.screenshot(path=f"{OUT}/v15_sprint.png", full_page=True)
    with page.expect_download(timeout=30000) as dl:
        page.click("[aria-label='Autres exports du bilan']")
        page.click("[role=menuitem]:has-text('Diapositive PowerPoint')")
    check("bilan : diapositive PowerPoint", dl.value.suggested_filename.endswith(".pptx"), dl.value.suggested_filename)

    # ------------------------------------------------------------ impression : décisions et actions
    pr = ctx.new_page()
    pr.add_init_script("window.print = () => {}")
    ms = req("GET", f"/api/accounts/{ACC}/meetings?typeId={coproj['id']}")[1]
    pr.goto(f"{BASE}/print/{ACC}/meeting/{ms[0]['id']}")
    pr.wait_for_selector("h2:has-text('Relevé des actions')", timeout=10000)
    check("impression : relevé des actions", pr.locator("text=Proposer 2 ou 3 créneaux pour le comité").count() == 1, str(pr.locator("text=Proposer 2 ou 3 créneaux pour le comité").count()))
    pr.close()

    # ------------------------------------------------------------ mobile
    m = b.new_context(viewport={"width": 390, "height": 844}, storage_state=ctx.storage_state())
    mp = m.new_page()
    mp.on("pageerror", lambda e: errors.append(f"pageerror mobile: {e}"))
    for path, sel in [(f"/a/{ACC}/followup", "h1:has-text('Actions & décisions')"), (f"/a/{ACC}/streams", "text=Dernier statut"), (f"/a/{ACC}/sprints/{sprint['id']}", "text=Livrables au périmètre"), (f"/a/{ACC}/meetings/{coproj['id']}", "text=Relevé des actions")]:
        mp.goto(BASE + path)
        mp.wait_for_selector(sel)
        mp.wait_for_timeout(400)
        check(f"mobile sans défilement horizontal : {path.split('/')[3]}", no_overflow(mp))
        mp.screenshot(path=f"{OUT}/v15_m_{path.split('/')[3]}.png", full_page=True)
    m.close()
    b.close()

check("aucune erreur de page", not errors, str(errors[:5]))
print("RESULT", "OK" if not fails else f"{len(fails)} FAIL: {fails}")
