import threading, secrets as _secrets, http.cookies as _cookies
import admin_store
admin_store.init_db()
import os
import http.server, json, os, socket, ssl, urllib.request, urllib.error, base64
from urllib.parse import urlparse

PORT = int(os.environ.get("PORT", 8080))
VT_KEY = os.environ.get("VT_API_KEY", "").strip()

def check_ssl(host):
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=5) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ss:
                cert = ss.getpeercert()
                issuer = dict(x[0] for x in cert.get("issuer", []))
                return {"valid": True, "issuer": issuer.get("organizationName") or issuer.get("commonName", "Trusted CA"), "expires": cert.get("notAfter", "")}
    except Exception as e:
        return {"valid": False, "error": str(e)}

def follow_redirects(url):
    try:
        req = urllib.request.Request(url, method="GET", headers={"User-Agent": "AmanOriginal-Scanner/2.0"})
        with urllib.request.urlopen(req, timeout=6) as r:
            return {"final_url": r.geturl(), "status": r.status}
    except urllib.error.HTTPError as e:
        return {"final_url": e.geturl(), "status": e.code}
    except Exception as e:
        return {"final_url": url, "status": 0, "error": str(e)}

def vt_request(path):
    if not VT_KEY:
        return None
    try:
        req = urllib.request.Request(f"https://www.virustotal.com/api/v3/{path}", headers={"x-apikey": VT_KEY, "accept": "application/json"})
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read().decode())
            stats = data.get("data", {}).get("attributes", {}).get("last_analysis_stats", {})
            return {"ok": True, "stats": stats}
    except urllib.error.HTTPError as e:
        return {"ok": False, "code": e.code}
    except Exception as e:
        return {"ok": False, "error": str(e)}

class Handler(http.server.SimpleHTTPRequestHandler):
    def _client_ip(self):
        fwd = self.headers.get("X-Forwarded-For", "")
        if fwd: return fwd.split(",")[0].strip()
        return (self.client_address[0] if self.client_address else "127.0.0.1")

    def _get_uid(self):
        raw = self.headers.get("Cookie", "")
        c = _cookies.SimpleCookie()
        try: c.load(raw)
        except Exception: pass
        if "aman_uid" in c and c["aman_uid"].value:
            return c["aman_uid"].value.strip()[:64], False
        return "usr_" + _secrets.token_hex(5), True

    def _send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        clean_path = self.path.split("?", 1)[0]
        if clean_path in ("/admin", "/admin/"):
            data = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "admin.html"), "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if clean_path in ("/", "/index.html"):
            ip = self._client_ip()
            ua = (self.headers.get("User-Agent") or "").lower()
            uid, is_new = self._get_uid()
            if ip not in ("127.0.0.1", "::1") and not any(b in ua for b in ("render", "go-http-client", "uptimerobot")):
                dev = admin_store.detect_device(self.headers)
                threading.Thread(target=admin_store.record_visit_or_action, args=(uid, ip, dev, "visits"), daemon=True).start()
            self._pending_uid = uid if is_new else None
            return super().do_GET()
        return super().do_GET()

    def end_headers(self):
        self.send_header("Accept-CH", "Sec-CH-UA-Model, Sec-CH-UA-Platform")
        if getattr(self, "_pending_uid", None):
            self.send_header("Set-Cookie", f"aman_uid={self._pending_uid}; Path=/; Max-Age=31536000; SameSite=Lax")
            self._pending_uid = None
        super().end_headers()

    def do_POST(self):
        clean_path = self.path.split("?", 1)[0]
        if clean_path in ("/api/admin/overview", "/api/admin/ban"):
            ln = int(self.headers.get("Content-Length", "0") or 0)
            body = json.loads(self.rfile.read(ln).decode("utf-8", "ignore") or "{}") if ln > 0 else {}
            if not admin_store.verify_admin_pin(body.get("pin", "")):
                return self._send_json(401, {"success": False, "error": "رمز الأدمن غير صحيح"})
            if clean_path == "/api/admin/ban":
                admin_store.set_user_ban(str(body.get("user_id", "")), bool(body.get("banned", True)), str(body.get("reason", "")))
            return self._send_json(200, {"success": True, "data": admin_store.get_overview()})
        ip = self._client_ip()
        uid, _ = self._get_uid()
        if admin_store.is_user_banned_cached(uid):
            return self._send_json(403, {"success": False, "error": "تم حظر وصولك من قبل الإدارة."})
        stat_f = "url_scans" if "url" in clean_path else ("hash_scans" if "hash" in clean_path else "visits")
        dev = admin_store.detect_device(self.headers)
        threading.Thread(target=admin_store.record_visit_or_action, args=(uid, ip, dev, stat_f), daemon=True).start()
        ln = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(ln) or b"{}")
        if self.path == "/api/scan-url":
            url = body.get("url", "").strip()
            p = urlparse(url)
            host = p.hostname or ""
            try: ip = socket.gethostbyname(host)
            except Exception: ip = "unresolved"
            redir = follow_redirects(url)
            ssl_info = check_ssl(host) if p.scheme == "https" and host else {"valid": False}
            vt_id = base64.urlsafe_b64encode(url.encode()).decode().rstrip("=")
            vt = vt_request(f"urls/{vt_id}")
            self._json(200, {"ip": ip, "redirect": redir, "ssl": ssl_info, "vt": vt, "has_vt_key": bool(VT_KEY)})
        elif self.path == "/api/scan-hash":
            vt = vt_request(f"files/{body.get('hash', '').strip()}")
            self._json(200, {"vt": vt, "has_vt_key": bool(VT_KEY)})
        else:
            self._json(404, {"error": "Not found"})

    def _json(self, code, payload):
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

os.chdir(os.path.dirname(os.path.abspath(__file__)))
print(f"🚀 أمان Pro Server شغال على http://localhost:{PORT} (VT Key: {'مفعل' if VT_KEY else 'فحص شبكة مباشر'})")
http.server.ThreadingHTTPServer(("", PORT), Handler).serve_forever()
