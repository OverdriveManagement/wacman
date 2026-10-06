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
mts = {m["name"]: m for m in boot["meetingTypes"]}
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 950}, permissions=["clipboard-read", "clipboard-write"])
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.goto(f"{BASE}/login")
    page.fill("input[type=email]", "florent@omgt.fr")
    page.fill("input[type=password]", PWD)
    page.click("button:has-text('Continuer')")
    page.wait_for_selector("text=Mode développement")
    page.fill("input[autocomplete=one-time-code]", page.inner_text("text=Mode développement").split("code")[-1].strip())
    page.click("button:has-text('Se connecter')")
    page.wait_for_url(f"{BASE}/")
    for name in ["COPROJ LP", "Program weekly", "Strategic Committee"]:
        page.goto(f"{BASE}/a/{ACC}/meetings/{mts[name]['id']}")
        page.wait_for_selector("button:has-text('Copier le CR')")
        page.click("button:has-text('Copier le CR')")
        page.wait_for_selector("text=avec sa mise en forme", timeout=8000)
        data = page.evaluate("""async () => { const items = await navigator.clipboard.read(); const out = {}; for (const it of items) for (const t of it.types) out[t] = await (await it.getType(t)).text(); return out; }""")
        html = data.get("text/html", "")
        check(f"{name} : HTML copié", "<table" in html or "Aucun" in html, str(list(data.keys())))
        check(f"{name} : texte de secours", len(data.get("text/plain", "")) > 50)
        slug = name.replace(" ", "_")
        open(f"{OUT}/cr_{slug}.html", "w").write(html)
        v = b.new_page(viewport={"width": 900, "height": 900})
        v.set_content(f"<html><body style='background:#fff;margin:20px'>{html}</body></html>")
        v.screenshot(path=f"{OUT}/cr_{slug}.png", full_page=True)
        v.close()
        page.wait_for_timeout(500)
    h = open(f"{OUT}/cr_COPROJ_LP.html").read()
    check("COPROJ : vue d'ensemble", "1. Vue d'ensemble" in h)
    check("COPROJ : synthèse par stream", "2. Synthèse par stream" in h)
    check("COPROJ : en-têtes bleus", "background-color:#1d4ed8" in h)
    check("COPROJ : statut nominal en vert", "#dcfce7" in h)
    check("COPROJ : libellé d'alerte", "Alertes &amp; prérequis LP :" in h)
    check("COPROJ : date en toutes lettres", "du 1er octobre 2026" in h, h[:400])
    check("COPROJ : signature", "Bonne journée,<br>Florent" in h)
    b.close()
print("\nerrors:", "\n".join(errors[:15]) or "none")
print("RESULT:", "ALL OK" if not fails else f"{len(fails)} FAIL: {fails}")
