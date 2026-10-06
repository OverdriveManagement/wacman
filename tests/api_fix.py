"""Vérifie les correctifs de la revue générale côté API (droits, validation, intégrité, import/export)."""
import os as _os
ENV_FILE = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "apps", "api", ".env.dev")
import json, urllib.request, http.cookiejar, threading, copy, subprocess

API = "http://localhost:4000"
ACC = "la-poste-pstng"
ENV = open(ENV_FILE).read()
PWD = ENV.split("BOOTSTRAP_ADMIN_PASSWORD=")[1].split("\n")[0].strip()
DB = ENV.split("DATABASE_URL=")[1].split("\n")[0].strip()
fails = []


def check(name, cond, extra=""):
    print(("OK  " if cond else "FAIL"), name, extra)
    if not cond:
        fails.append(name)


def client():
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

    def req(method, path, body=None, headers=None, raw=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        h = dict(headers or {})
        if data is not None:
            h["Content-Type"] = "application/json"
        r = urllib.request.Request(API + path, data=data, method=method, headers=h)
        try:
            with op.open(r) as res:
                t = res.read()
                ct = res.headers.get("content-type", "")
                return res.status, (json.loads(t) if t and "json" in ct else t)
        except urllib.error.HTTPError as e:
            t = e.read().decode()
            try:
                return e.code, json.loads(t)
            except Exception:
                return e.code, t

    return req


def login(req, email, pwd):
    s, r = req("POST", "/api/auth/login", {"email": email, "password": pwd})
    assert s == 200, (s, r)
    s, r2 = req("POST", "/api/auth/verify", {"challengeId": r["challengeId"], "code": r["devCode"]})
    assert s == 200, (s, r2)


req = client()
login(req, "florent@omgt.fr", PWD)
boot = req("GET", f"/api/accounts/{ACC}")[1]
opts = boot["options"]
by_kind = lambda k: [o for o in opts if o["kind"] == k]
cards = req("GET", f"/api/accounts/{ACC}/cards")[1]
card = cards[0]

# ---------------------------------------------------------------- jeton en lecture seule
s, tok = req("POST", "/api/auth/tokens", {"name": "test lecture", "readOnly": True})
check("création d'un jeton lecture seule", s == 200, str(s))
anon = client()
H = {"Authorization": f"Bearer {tok['token']}"}
s, _ = anon("GET", f"/api/accounts/{ACC}/cards", headers=H)
check("lecture seule : lecture autorisée", s == 200, str(s))
s, _ = anon("POST", f"/api/accounts/{ACC}/comments/card/{card['id']}", {"body": "test"}, headers=H)
check("lecture seule : commentaire refusé", s == 403, str(s))
s, _ = anon("PATCH", f"/api/accounts/{ACC}/e/card/{card['id']}", {"title": "x"}, headers=H)
check("lecture seule : modification refusée", s == 403, str(s))
s, r = anon("POST", "/api/mcp", {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, headers=H)
check("lecture seule : MCP toujours utilisable", s == 200 and "result" in r, str(s))
req("DELETE", f"/api/auth/tokens/{tok['id']}")

# ---------------------------------------------------------------- jeton assistant limité à l'assistant
s, at = req("GET", "/api/auth/assistant-token")
AH = {"Authorization": f"Bearer {at['token']}"}
s, _ = anon("GET", f"/api/accounts/{ACC}/cards", headers=AH)
check("jeton assistant refusé hors assistant", s == 401, str(s))
s, _ = anon("POST", "/api/auth/tokens", {"name": "pirate"}, headers=AH)
check("jeton assistant : pas de création de jeton permanent", s == 401, str(s))
s, _ = anon("GET", "/api/auth/assistant-token", headers=AH)
check("jeton assistant : pas d'auto-renouvellement", s == 401, str(s))

# ---------------------------------------------------------------- validations
alert = by_kind("ALERT_LEVEL")[0]
s, r = req("POST", f"/api/accounts/{ACC}/cards/{card['id']}/move", {"statusId": alert["id"]})
check("déplacement vers une valeur d'alerte refusé", s == 400, str((s, r)))
s, r = req("POST", f"/api/accounts/{ACC}/cards/{card['id']}/move", {"statusId": ""})
check("statut vide refusé proprement", s == 400, str(s))
s, r = req("PATCH", f"/api/accounts/{ACC}", {"settings": {"freshness": {"enabled": True, "hideDone": True, "levels": []}}})
check("paliers de fraîcheur vides : 400", s == 400, str(s))
s, r = req("PATCH", f"/api/accounts/{ACC}/e/card/{card['id']}", {"dueDate": "2026-02-30"})
check("date inexistante : 400", s == 400, str(s))
s, r = req("GET", "/api/accounts/------------------------------------")
check("compte mal formé : 404 et non 500", s == 404, str(s))
s, r = req("GET", f"/api/accounts/{ACC}/audit?limit=abc")
check("journal avec limite invalide : 200", s == 200, str(s))
s, r = req("GET", f"/api/accounts/{ACC}/e/stream?order=x")
check("filtre impossible : liste vide", s == 200 and r == [], str((s, r)))
s, r = req("GET", f"/api/accounts/{ACC}/e/card?sprintId=pas-un-id")
check("filtre identifiant invalide : liste vide", s == 200 and r == [], str(s))
risks = req("GET", f"/api/accounts/{ACC}/e/risk")[1]
if risks:
    s, r = req("PATCH", f"/api/accounts/{ACC}/e/risk/{risks[0]['id']}", {"openedAt": None})
    check("risque sans date d'ouverture : 400", s == 400, str(s))
    s, r = req("PATCH", f"/api/accounts/{ACC}/e/risk/{risks[0]['id']}", {"cardIds": [card["id"], card["id"]]})
    check("cartes liées en double : dédoublonnées", s == 200 and r.get("cardIds", []).count(card["id"]) == 1, str(s))
    req("PATCH", f"/api/accounts/{ACC}/e/risk/{risks[0]['id']}", {"cardIds": risks[0]["cardIds"]})
s, r = req("POST", f"/api/accounts/{ACC}/e/sprint", {"name": "Sprint test", "startDate": "2026-12-10", "endDate": "2026-12-01"})
check("sprint fin avant début : 400", s == 400, str(s))
cur = [sp for sp in boot["sprints"] if sp["state"] == "CURRENT"][0]
s, r = req("POST", f"/api/accounts/{ACC}/sprints/switch", {"fromSprintId": cur["id"], "toSprintId": cur["id"]})
check("bascule vers le même sprint refusée", s == 400, str(s))
s, r = req("POST", f"/api/accounts/{ACC}/e/contact", {"name": "Contact test", "userId": "00000000-0000-4000-8000-000000000000"})
check("contact relié à un utilisateur inconnu refusé", s == 400, str(s))

# séance : changement de date vers une date déjà prise
types = {m["name"]: m for m in boot["meetingTypes"]}
coproj = types["COPROJ LP"]
ms = req("GET", f"/api/accounts/{ACC}/meetings?typeId={coproj['id']}")[1]
if len(ms) >= 2:
    s, r = req("PATCH", f"/api/accounts/{ACC}/e/meeting/{ms[0]['id']}", {"date": ms[1]["date"]})
    check("date de séance déjà prise : 400", s == 400, str((s, r)))

# ---------------------------------------------------------------- séance recopiée : modèle de streams
s, st = req("POST", f"/api/accounts/{ACC}/e/stream", {"name": "Stream test copie", "inStatusTemplate": True, "active": True, "order": 99})
s, m = req("POST", f"/api/accounts/{ACC}/meetings", {"meetingTypeId": coproj["id"], "date": "2027-01-04", "mode": "previous"})
check("séance recopiée : ligne ajoutée pour un nouveau stream du modèle", s == 200 and any(x["streamId"] == st["id"] for x in m["statuses"]), str(s))
req("DELETE", f"/api/accounts/{ACC}/e/meeting/{m['id']}")
req("PATCH", f"/api/accounts/{ACC}/e/stream/{st['id']}", {"active": False})
s, m2 = req("POST", f"/api/accounts/{ACC}/meetings", {"meetingTypeId": coproj["id"], "date": "2027-01-05", "mode": "previous"})
check("séance recopiée : stream désactivé non repris", s == 200 and not any(x["streamId"] == st["id"] for x in m2["statuses"]), str(s))
req("DELETE", f"/api/accounts/{ACC}/e/meeting/{m2['id']}")
req("DELETE", f"/api/accounts/{ACC}/e/stream/{st['id']}")

# ---------------------------------------------------------------- statut de stream supprimé : retiré des séances
s, so = req("POST", f"/api/accounts/{ACC}/e/option", {"kind": "STREAM_STATUS", "label": "Statut test", "order": 99})
row = ms[0]["statuses"][0]
req("PATCH", f"/api/accounts/{ACC}/e/streamStatus/{row['id']}", {"statusIds": row["statusIds"] + [so["id"]]})
req("DELETE", f"/api/accounts/{ACC}/e/option/{so['id']}")
row2 = req("GET", f"/api/accounts/{ACC}/e/streamStatus/{row['id']}")[1]
check("statut supprimé retiré des lignes de séance", so["id"] not in row2["statusIds"] and row2["statusIds"] == row["statusIds"], str(row2["statusIds"]))

# ---------------------------------------------------------------- export puis import : commentaires et types conservés
s, cm = req("POST", f"/api/accounts/{ACC}/comments/card/{card['id']}", {"body": "Commentaire de test export"})
s, raw = req("GET", f"/api/accounts/{ACC}/export/account.json")
data = raw if isinstance(raw, dict) else json.loads(raw)
check("export : commentaires présents", any(c["body"] == "Commentaire de test export" for c in data["comments"]), str(len(data["comments"])))
check("export : état actif des types de séance", all("active" in t for t in data["meetingTypes"]))
copy_ = copy.deepcopy(data)
copy_["account"]["slug"] = "test-reimport"
copy_["account"]["name"] = "Test réimport"
s, r = req("POST", "/api/admin/import", copy_)
check("réimport d'un export complet", s == 200, str((s, r if s != 200 else "")))
if s == 200:
    s2, raw2 = req("GET", "/api/accounts/test-reimport/export/account.json")
    d2 = raw2 if isinstance(raw2, dict) else json.loads(raw2)
    check("réimport : même nombre de commentaires", len(d2["comments"]) == len(data["comments"]), f"{len(d2['comments'])} / {len(data['comments'])}")
    check("réimport : mêmes cartes", len(d2["cards"]) == len(data["cards"]))
    check("réimport : dates de contenu conservées", sorted(c["contentUpdatedAt"] for c in d2["cards"]) == sorted(c["contentUpdatedAt"] for c in data["cards"]))
    subprocess.run(["psql", DB, "-qc", "delete from accounts where slug='test-reimport'"], check=True)
req("DELETE", f"/api/accounts/{ACC}/comments/{cm['id']}")

# ---------------------------------------------------------------- MCP robuste
s, r = anon("POST", "/api/mcp", raw=b"null", headers={"Authorization": f"Bearer {req('POST', '/api/auth/tokens', {'name': 'mcp test'})[1]['token']}"})
check("MCP : corps null refusé proprement", s in (400, 401) and isinstance(r, dict), str((s, r)))

# ---------------------------------------------------------------- code de connexion : essais simultanés limités
c2 = client()
s, ch = c2("POST", "/api/auth/login", {"email": "florent@omgt.fr", "password": PWD})
results = []


def bad():
    results.append(client()("POST", "/api/auth/verify", {"challengeId": ch["challengeId"], "code": "000001" if ch["devCode"] != "000001" else "000002"})[0])


th = [threading.Thread(target=bad) for _ in range(12)]
[t.start() for t in th]
[t.join() for t in th]
s, r = c2("POST", "/api/auth/verify", {"challengeId": ch["challengeId"], "code": ch["devCode"]})
check("12 essais simultanés : le bon code ne passe plus", s == 401, str((s, results)))

# ---------------------------------------------------------------- mot de passe oublié : la connexion en cours reste valable
c3 = client()
s, ch = c3("POST", "/api/auth/login", {"email": "florent@omgt.fr", "password": PWD})
client()("POST", "/api/auth/forgot", {"email": "florent@omgt.fr"})
s, r = c3("POST", "/api/auth/verify", {"challengeId": ch["challengeId"], "code": ch["devCode"]})
check("demande de réinitialisation : connexion en cours toujours valable", s == 200, str(s))

# nettoyage des jetons de test
for t in req("GET", "/api/auth/tokens")[1]:
    if t["name"] in ("mcp test", "test lecture"):
        req("DELETE", f"/api/auth/tokens/{t['id']}")
print("RESULT:", "ALL OK" if not fails else f"{len(fails)} FAIL: {fails}")
