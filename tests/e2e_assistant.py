"""Test de bout en bout de l'assistant en local (API simulée)."""
import os as _os
ENV_FILE = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "apps", "api", ".env.dev")
import json, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
PWD = open(ENV_FILE).read().split("BOOTSTRAP_ADMIN_PASSWORD=")[1].split("\n")[0].strip()

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1400, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"console: {m.text}"))
    page.goto(f"{BASE}/login")
    page.fill("input[type=email]", "florent@omgt.fr")
    page.fill("input[type=password]", PWD)
    page.click("button:has-text('Continuer')")
    page.wait_for_selector("text=Mode développement")
    code = page.inner_text("text=Mode développement").split("code")[-1].strip()
    page.fill("input[autocomplete=one-time-code]", code)
    page.click("button:has-text('Se connecter')")
    page.wait_for_url(f"{BASE}/")
    page.goto(f"{BASE}/a/la-poste-pstng")
    page.wait_for_selector("text=Kanban")
    page.click("aside button:has-text('Assistant Claude')")
    page.fill("textarea[placeholder='Votre demande…']", "Résume les cartes en alerte")
    page.keyboard.press("Enter")
    page.wait_for_timeout(6000)
    page.screenshot(path=f"{OUT}/assistant.png")
    body = page.inner_text("body")
    print("HAS_FINAL", "Voici la synthèse" in body, "ERRORBOX", "Application error" in body)
    print("\n".join(errors[:20]) or "no errors")
    b.close()
