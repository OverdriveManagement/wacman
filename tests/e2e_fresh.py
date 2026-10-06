"""Tests étiquette de fraîcheur."""
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


import re, datetime
statuses = [o for o in boot["options"] if o["kind"] == "CARD_STATUS"]
done_ids = {o["id"] for o in statuses if (o.get("meta") or {}).get("done")}
cs = cards()
check("contentUpdatedAt exposé", all("contentUpdatedAt" in c for c in cs))
by_ref = {c["ref"]: c for c in cs}
check("date Notion appliquée (#13)", by_ref[13]["contentUpdatedAt"].startswith("2026-10-02T15:04:10"), by_ref[13]["contentUpdatedAt"])
check("date Notion appliquée (#3)", by_ref[3]["contentUpdatedAt"].startswith("2026-10-04T06:41:13"), by_ref[3]["contentUpdatedAt"])

# règles de mise à jour, sur une carte de test
s, t = req("POST", f"/api/accounts/{ACC}/e/card", {"title": "Test fraîcheur", "statusId": statuses[0]["id"]})
cid = t["id"]
import subprocess
DB = open(ENV_FILE).read().split("DATABASE_URL=")[1].split("\n")[0].strip()
def age(days):
    subprocess.run(["psql", DB, "-qc", f"update cards set content_updated_at = now() - interval '{days} days' where id = '{cid}'"], check=True)
def cu():
    return req("GET", f"/api/accounts/{ACC}/e/card/{cid}")[1]["contentUpdatedAt"]
age(20); before = cu()
req("PATCH", f"/api/accounts/{ACC}/e/card/{cid}", {"position": 9999})
check("réordonnancement seul : date inchangée", cu() == before)
req("PATCH", f"/api/accounts/{ACC}/e/card/{cid}", {"title": "Test fraîcheur"})
check("même valeur : date inchangée", cu() == before)
req("POST", f"/api/accounts/{ACC}/cards/{cid}/move", {"statusId": statuses[0]["id"], "beforeId": None, "afterId": None})
check("déplacement dans la même colonne : date inchangée", cu() == before)
req("POST", f"/api/accounts/{ACC}/cards/{cid}/move", {"statusId": statuses[1]["id"]})
check("changement de colonne : date mise à jour", cu() != before)
age(20); before = cu()
req("PATCH", f"/api/accounts/{ACC}/e/card/{cid}", {"nextSteps": "Relancer"})
check("modification d'un texte : date mise à jour", cu() != before)
age(20)
s, r = req("PATCH", f"/api/accounts/{ACC}", {"settings": {"freshness": {"enabled": True, "hideDone": True, "levels": [{"maxDays": 7, "emoji": "x", "color": "green", "label": ""}, {"maxDays": 5, "emoji": "y", "color": "red", "label": ""}, {"maxDays": None, "emoji": "z", "color": "red", "label": ""}]}}})
check("paliers non croissants refusés", s == 400, str(s))

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
    page.goto(f"{BASE}/a/{ACC}")
    page.click("button[role=tab]:has-text('Par statut')")
    page.click("button:has-text('Tous')")
    page.wait_for_timeout(1200)
    tile = page.locator("[aria-roledescription^=carte]", has_text="Test fraîcheur").first
    tag = tile.locator("[data-testid=freshness]")
    check("étiquette sur la carte", tag.count() == 1 and "20 j" in tag.inner_text(), tag.inner_text() if tag.count() else "absente")
    check("palier ancien : picto rouge", "🔴" in tag.inner_text())
    tags = page.locator("[data-testid=freshness]").all_inner_texts()
    check("étiquettes affichées sur plusieurs cartes", len(tags) > 5, str(len(tags)))
    # carte terminée : pas d'étiquette
    done_card = next((c for c in cs if c["statusId"] in done_ids), None)
    if done_card:
        dt = page.locator("[aria-roledescription^=carte]", has_text=done_card["title"]).first
        check("pas d'étiquette sur une carte terminée", dt.locator("[data-testid=freshness]").count() == 0)
    # filtre
    page.click("button:has-text('Filtres')")
    page.click("button:has-text('Sans mise à jour depuis plus de 7 j')")
    page.wait_for_timeout(400)
    vis = page.locator("[aria-roledescription^=carte]").all_inner_texts()
    check("filtre « sans mise à jour » garde la carte ancienne", any("Test fraîcheur" in v for v in vis))
    check("filtre « sans mise à jour » masque les cartes récentes", not any(by_ref[3]["title"] in v for v in vis))
    page.click("button:has-text('Sans mise à jour depuis plus de 7 j')")
    page.click("button:has-text('Filtres')")
    page.screenshot(path=f"{OUT}/fresh_kanban.png")
    # paramétrage depuis le kanban
    check("hors mode édition : pas de bouton Fraîcheur", page.locator("button:has-text('Fraîcheur')").count() == 0)
    page.click("button[aria-pressed]:has-text('Mode édition')")
    page.click("button:has-text('Fraîcheur')")
    page.wait_for_selector("text=Fraîcheur des cartes")
    page.screenshot(path=f"{OUT}/fresh_modal.png")
    page.fill("input[aria-label='Nombre de jours du palier 2']", "30")
    page.fill("input[aria-label='Picto du palier 2']", "⏳")
    page.click("[role=dialog] button:has-text('Enregistrer')")
    page.wait_for_timeout(1200)
    t2 = tile.locator("[data-testid=freshness]").inner_text()
    check("nouveau palier appliqué (20 j devient ⏳)", "⏳" in t2, t2)
    f = req("GET", f"/api/accounts/{ACC}")[1]["account"]["settings"]["freshness"]
    check("paliers enregistrés", f["levels"][1]["maxDays"] == 30 and f["levels"][1]["emoji"] == "⏳", json.dumps(f["levels"]))
    page.click("button:has-text(\"Terminer l'édition\")")
    # fiche carte
    tile.click()
    page.wait_for_selector("[role=dialog]")
    page.locator("[role=dialog] summary:has-text('Détails'), [role=dialog] button:has-text('Détails')").first.click()
    page.wait_for_selector("text=Contenu modifié")
    check("fiche : date de modification du contenu", page.locator("[role=dialog] [data-testid=freshness]").count() == 1)
    page.keyboard.press("Escape")
    # page paramètres
    page.goto(f"{BASE}/a/{ACC}/settings")
    page.wait_for_selector("text=Fraîcheur des cartes")
    page.click("button:has-text('Valeurs par défaut')")
    page.click("button:has-text('Enregistrer les paliers')")
    page.wait_for_timeout(800)
    f = req("GET", f"/api/accounts/{ACC}")[1]["account"]["settings"]["freshness"]
    check("paramètres : valeurs par défaut rétablies", f["levels"][1]["maxDays"] == 14 and f["levels"][1]["emoji"] == "🟠")
    # mobile
    mob = b.new_context(viewport={"width": 390, "height": 844}, storage_state=ctx.storage_state())
    mp = mob.new_page()
    mp.goto(f"{BASE}/a/{ACC}")
    mp.wait_for_timeout(2000)
    w = mp.evaluate("document.documentElement.scrollWidth")
    check("mobile kanban sans défilement horizontal", w <= 392, f"scrollWidth={w}")
    mp.screenshot(path=f"{OUT}/fresh_mobile.png")
    mob.close()
    b.close()

req("DELETE", f"/api/accounts/{ACC}/e/card/{cid}")
print("\nerrors:", "\n".join(errors[:15]) or "none")
print("RESULT:", "ALL OK" if not fails else f"{len(fails)} FAIL: {fails}")
