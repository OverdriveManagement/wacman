"""Tests de l'API locale : tableau de bord, recherche, duplication, mot de passe oublié, jetons, MCP."""
import os as _os
ENV_FILE = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "apps", "api", ".env.dev")
import json, urllib.request, http.cookiejar

B = "http://localhost:4000"
PWD = open(ENV_FILE).read().split("BOOTSTRAP_ADMIN_PASSWORD=")[1].split("\n")[0].strip()
ACC = "la-poste-pstng"
fails = []


def mk():
    cj = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def req(op, method, path, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(B + path, data=data, method=method, headers={**({"Content-Type": "application/json"} if body is not None else {}), **(headers or {})})
    try:
        with op.open(r) as res:
            t = res.read().decode()
            return res.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try:
            return e.code, json.loads(t)
        except Exception:
            return e.code, t


def check(name, cond, extra=""):
    print(("OK  " if cond else "FAIL"), name, extra)
    if not cond:
        fails.append(name)


def login(op, email, pwd):
    s, r = req(op, "POST", "/api/auth/login", {"email": email, "password": pwd})
    assert s == 200, r
    s, r = req(op, "POST", "/api/auth/verify", {"challengeId": r["challengeId"], "code": r["devCode"]})
    assert s == 200, r


admin = mk()
login(admin, "florent@omgt.fr", PWD)

# tableau de bord
s, d = req(admin, "GET", f"/api/accounts/{ACC}/dashboard")
check("dashboard 200", s == 200, str(d)[:200] if s != 200 else "")
if s == 200:
    check("dashboard sprint", d["sprint"] is not None and d["sprint"]["total"] >= 0, f"sprint={d['sprint']['name'] if d['sprint'] else None} total={d['sprint']['total'] if d['sprint'] else ''} done={d['sprint']['done'] if d['sprint'] else ''}")
    check("dashboard risks", d["risks"]["total"] == 18, f"open={d['risks']['open']}")
    check("dashboard meetings", len(d["meetings"]) == 3, json.dumps(d["meetings"])[:200])
    print("    overdue", d["overdueCount"], "dueSoon", len(d["dueSoon"]), "alerts", d["alerts"], "mine", None if d["mine"] is None else len(d["mine"]))

# recherche
s, a = req(admin, "GET", f"/api/accounts/{ACC}/search?q=deploiement")
s2, b = req(admin, "GET", f"/api/accounts/{ACC}/search?q=D%C3%A9ploiement")
na = sum(len(a[k]) for k in ["cards", "risks", "topics", "highlights", "contacts", "streams"])
nb = sum(len(b[k]) for k in ["cards", "risks", "topics", "highlights", "contacts", "streams"])
check("search accents", s == 200 and na > 0 and na == nb, f"{na} vs {nb}")
s, r = req(admin, "GET", f"/api/accounts/{ACC}/search?q=%2312")
check("search by ref", s == 200 and any(c["ref"] == 12 for c in r["cards"]), str([c["ref"] for c in r["cards"]]))
s, r = req(admin, "GET", f"/api/accounts/{ACC}/search?q=50%25")
check("search escape", s == 200)

# duplication
s, cards = req(admin, "GET", f"/api/accounts/{ACC}/cards")
src = cards[0]
s, dup = req(admin, "POST", f"/api/accounts/{ACC}/cards/{src['id']}/duplicate", {})
check("duplicate", s == 200 and dup["title"].endswith("(copie)") and dup["ref"] != src["ref"] and dup["streamId"] == src["streamId"], f"ref {dup.get('ref')} pos {dup.get('position')} src pos {src['position']}")
s, _ = req(admin, "DELETE", f"/api/accounts/{ACC}/e/card/{dup['id']}")
check("cleanup duplicate", s == 200)

# contrôle de type de valeur de liste
alert = next(o for o in req(admin, "GET", f"/api/accounts/{ACC}")[1]["options"] if o["kind"] == "ALERT_LEVEL")
s, r = req(admin, "PATCH", f"/api/accounts/{ACC}/e/card/{src['id']}", {"statusId": alert["id"]})
check("wrong option kind rejected", s == 400, str(r)[:120])
s, r = req(admin, "PATCH", f"/api/accounts/{ACC}/e/card/{src['id']}", {"statusId": "En cours"})
check("non-uuid ref rejected 400", s == 400, str(r)[:120])

# mot de passe oublié sur un utilisateur de test
s, r = req(admin, "POST", "/api/admin/users", {"email": "test.reset@example.com", "name": "Test Reset", "password": "Initial2026x"})
check("create test user", s in (200, 400), str(r)[:100])
anon = mk()
s, r = req(anon, "POST", "/api/auth/forgot", {"email": "inconnu@example.com"})
check("forgot unknown hides", s == 200 and "challengeId" in r and "devCode" not in r)
s, r = req(anon, "POST", "/api/auth/forgot", {"email": "test.reset@example.com"})
check("forgot known", s == 200 and "devCode" in r)
s2, r2 = req(anon, "POST", "/api/auth/reset", {"challengeId": r["challengeId"], "code": "000000" if r["devCode"] != "000000" else "111111", "password": "Nouveau2026x"})
check("reset wrong code", s2 == 400)
s2, r2 = req(anon, "POST", "/api/auth/reset", {"challengeId": r["challengeId"], "code": r["devCode"], "password": "court"})
check("reset weak pwd", s2 == 400)
s2, r2 = req(anon, "POST", "/api/auth/reset", {"challengeId": r["challengeId"], "code": r["devCode"], "password": "Nouveau2026x"})
check("reset ok", s2 == 200, str(r2))
s2, r2 = req(anon, "POST", "/api/auth/reset", {"challengeId": r["challengeId"], "code": r["devCode"], "password": "Encore2026xx"})
check("reset code single use", s2 == 400)
s, r = req(anon, "POST", "/api/auth/verify", {"challengeId": r["challengeId"], "code": r["devCode"]})
check("reset code not usable for login", s == 401)
u = mk()
try:
    login(u, "test.reset@example.com", "Nouveau2026x")
    check("login with new password", True)
except AssertionError as e:
    check("login with new password", False, str(e))

# jetons d'accès
s, t = req(admin, "POST", "/api/auth/tokens", {"name": "Test MCP"})
check("token create", s == 200 and t["token"].startswith("wac_"))
tok = t["token"]
s, ro = req(admin, "POST", "/api/auth/tokens", {"name": "Lecture", "readOnly": True, "expiresInDays": 30})
check("token ro create", s == 200)
s, lst = req(admin, "GET", "/api/auth/tokens")
check("token list hides secret", s == 200 and all("token" not in x and "tokenHash" not in x for x in lst), str(len(lst)))
bare = mk()
H = {"Authorization": f"Bearer {tok}"}
s, r = req(bare, "GET", f"/api/accounts/{ACC}/dashboard", headers=H)
check("REST with token", s == 200)
s, r = req(bare, "POST", "/api/auth/tokens", {"name": "x"}, headers=H)
check("token cannot mint token", s == 403)

# MCP
def mcp(body, path="/api/mcp", headers=H):
    return req(bare, "POST", path, body, headers)

s, r = mcp({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}}})
check("mcp initialize", s == 200 and r["result"]["protocolVersion"] == "2025-06-18" and r["result"]["serverInfo"]["name"] == "wacman")
s, r = mcp({"jsonrpc": "2.0", "method": "notifications/initialized"})
check("mcp notification 202", s == 202)
s, r = mcp({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
names = [t["name"] for t in r["result"]["tools"]]
check("mcp tools/list", "list_accounts" in names and "create_item" in names and "get_dashboard" in names, ",".join(names))
s, r = mcp({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "list_accounts", "arguments": {}}})
check("mcp list_accounts", ACC in r["result"]["content"][0]["text"])
s, r = mcp({"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "search", "arguments": {"account": ACC, "query": "securite"}}})
check("mcp search", not r["result"].get("isError"), r["result"]["content"][0]["text"][:80])
s, r = mcp({"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "get_overview", "arguments": {}}})
check("mcp missing account -> isError", r["result"].get("isError") is True)
s, r = mcp({"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"name": "list_accounts", "arguments": {}}}, path=f"/api/mcp/{tok}", headers={})
check("mcp path token", s == 200 and ACC in r["result"]["content"][0]["text"])
s, r = mcp({"jsonrpc": "2.0", "id": 7, "method": "bogus"})
check("mcp unknown method", r.get("error", {}).get("code") == -32601)
HR = {"Authorization": f"Bearer {ro['token']}"}
s, r = mcp({"jsonrpc": "2.0", "id": 8, "method": "tools/list"}, headers=HR)
check("mcp ro hides write tools", "create_item" not in [t["name"] for t in r["result"]["tools"]])
s, r = mcp({"jsonrpc": "2.0", "id": 9, "method": "tools/call", "params": {"name": "add_comment", "arguments": {"account": ACC, "entityType": "card", "entityId": src["id"], "body": "x"}}}, headers=HR)
check("mcp ro refuses write", r["result"].get("isError") is True, r["result"]["content"][0]["text"][:80])
s, r = req(bare, "PATCH", f"/api/accounts/{ACC}/e/card/{src['id']}", {"title": src["title"]}, headers=HR)
check("REST ro refuses write", s == 403)
s, r = req(bare, "POST", "/api/admin/import", {"x": 1}, headers=HR)
check("ro token not superadmin", s == 403)
# révocation
for x in req(admin, "GET", "/api/auth/tokens")[1]:
    req(admin, "DELETE", f"/api/auth/tokens/{x['id']}")
s, r = mcp({"jsonrpc": "2.0", "id": 10, "method": "tools/list"})
check("revoked token 401", s == 401)
s, r = mcp({"jsonrpc": "2.0", "id": 11, "method": "tools/list"}, headers={})
check("no token 401", s == 401)

print("\nRESULT:", "ALL OK" if not fails else f"{len(fails)} FAIL: {fails}")
