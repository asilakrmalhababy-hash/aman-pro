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
    def do_POST(self):
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
