import json, os, re, secrets, sqlite3, ssl, time, urllib.request
from contextlib import contextmanager
from datetime import datetime, timedelta

try:
    import pymysql
    from pymysql.cursors import DictCursor
except ImportError:
    pymysql = None
    DictCursor = None

try:
    import certifi
except ImportError:
    certifi = None

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "aman_stats.db")
USE_TIDB = bool(os.environ.get("TIDB_HOST", "").strip())

TOOL_LABELS = {
    "url_scan": "فحص الروابط",
    "file_scan": "فحص الملفات",
    "crypto": "التشفير وفك التشفير",
    "stego": "إخفاء/استخراج نص بصورة",
    "exif": "تنظيف خصوصية الصور",
    "phish": "كاشف رسائل النصب",
    "secret_link": "روابط سرية مشفّرة",
    "qr": "الباركود الأمني",
    "password": "كلمات المرور",
    "privacy_audit": "فحص المتصفح",
}

_DEVICE_MAP = {
    "SM-G715": "Samsung Galaxy XCover Pro",
    "SM-S938": "Samsung Galaxy S25 Ultra", "SM-S936": "Samsung Galaxy S25+", "SM-S931": "Samsung Galaxy S25",
    "SM-S928": "Samsung Galaxy S24 Ultra", "SM-S926": "Samsung Galaxy S24+", "SM-S921": "Samsung Galaxy S24",
    "SM-S918": "Samsung Galaxy S23 Ultra", "SM-S916": "Samsung Galaxy S23+", "SM-S911": "Samsung Galaxy S23",
    "SM-S908": "Samsung Galaxy S22 Ultra", "SM-S906": "Samsung Galaxy S22+", "SM-S901": "Samsung Galaxy S22",
    "SM-G998": "Samsung Galaxy S21 Ultra", "SM-G996": "Samsung Galaxy S21+", "SM-G991": "Samsung Galaxy S21",
    "SM-A556": "Samsung Galaxy A55", "SM-A546": "Samsung Galaxy A54", "SM-A536": "Samsung Galaxy A53",
    "SM-A356": "Samsung Galaxy A35", "SM-A346": "Samsung Galaxy A34", "SM-A155": "Samsung Galaxy A15",
    "24090RA29": "Redmi Note 14 Pro", "2312DRA50": "Redmi Note 13 Pro", "23129RAA4": "Redmi Note 13",
}

_AR_COUNTRIES = {
    "Yemen": "اليمن", "Saudi Arabia": "السعودية", "Egypt": "مصر",
    "United Arab Emirates": "الإمارات", "Jordan": "الأردن", "Oman": "عُمان",
    "Kuwait": "الكويت", "Qatar": "قطر", "Bahrain": "البحرين", "Iraq": "العراق",
    "Syria": "سوريا", "Lebanon": "لبنان", "Palestine": "فلسطين", "Morocco": "المغرب",
    "Algeria": "الجزائر", "Tunisia": "تونس", "Libya": "ليبيا", "Sudan": "السودان",
    "Turkey": "تركيا", "United States": "أمريكا", "United Kingdom": "بريطانيا",
}

_AR_CITIES = {
    "Sanaa": "صنعاء", "Sana'a": "صنعاء", "Ar Rawdah": "صنعاء", "Ar Rawḑah": "صنعاء",
    "'Amran": "عمران", "Amran": "عمران", "Aden": "عدن", "Taiz": "تعز", "Taizz": "تعز",
    "Ibb": "إب", "Al Hudaydah": "الحديدة", "Hodeidah": "الحديدة", "Mukalla": "المكلا",
    "Dhamar": "ذمار", "Hajjah": "حجة", "Marib": "مأرب", "Saada": "صعدة",
    "Riyadh": "الرياض", "Jeddah": "جدة", "Cairo": "القاهرة", "Dubai": "دبي",
}

_geo_cache, _ban_cache = {}, {}

class _DB:
    def __init__(self, conn, is_mysql: bool):
        self._conn = conn
        self.is_mysql = is_mysql
    def _q(self, sql: str) -> str:
        return sql.replace("?", "%s") if self.is_mysql else sql
    def execute(self, sql: str, params=()):
        q = self._q(sql)
        if self.is_mysql:
            cur = self._conn.cursor()
            cur.execute(q, params)
            return cur
        return self._conn.execute(q, params)
    def fetchone(self, sql: str, params=()):
        cur = self.execute(sql, params)
        row = cur.fetchone()
        if self.is_mysql: cur.close()
        return row
    def fetchall(self, sql: str, params=()):
        cur = self.execute(sql, params)
        rows = cur.fetchall()
        if self.is_mysql: cur.close()
        return rows
    def commit(self):
        self._conn.commit()

@contextmanager
def _get_conn():
    if USE_TIDB:
        if pymysql is None: raise RuntimeError("PyMySQL missing")
        ssl_cfg = ssl.create_default_context(cafile=certifi.where()) if certifi else ssl.create_default_context()
        conn = pymysql.connect(
            host=os.environ["TIDB_HOST"].strip(),
            port=int(os.environ.get("TIDB_PORT", "4000")),
            user=os.environ["TIDB_USER"].strip(),
            password=os.environ["TIDB_PASSWORD"],
            database=os.environ.get("TIDB_DATABASE", "test").strip(),
            charset="utf8mb4", cursorclass=DictCursor, ssl=ssl_cfg,
            connect_timeout=8, read_timeout=12, write_timeout=12, autocommit=False,
        )
        db = _DB(conn, True)
        try: yield db
        except Exception: conn.rollback(); raise
        finally: conn.close()
    else:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        conn.row_factory = sqlite3.Row
        db = _DB(conn, False)
        try: yield db
        except Exception: conn.rollback(); raise
        finally: conn.close()

def init_db():
    with _get_conn() as db:
        if db.is_mysql:
            db.execute("CREATE TABLE IF NOT EXISTS aman_users (user_id VARCHAR(64) PRIMARY KEY, device_name VARCHAR(140) DEFAULT '', country VARCHAR(100) DEFAULT '', ip_address VARCHAR(64) DEFAULT '', first_seen VARCHAR(30) NOT NULL, last_seen VARCHAR(30) NOT NULL, actions_count INT NOT NULL DEFAULT 0, is_banned TINYINT NOT NULL DEFAULT 0, ban_reason VARCHAR(200) DEFAULT '') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4")
            db.execute("CREATE TABLE IF NOT EXISTS aman_user_tools (user_id VARCHAR(64) NOT NULL, tool_key VARCHAR(40) NOT NULL, uses_count INT NOT NULL DEFAULT 0, PRIMARY KEY (user_id, tool_key)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4")
        else:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE IF NOT EXISTS aman_users (user_id TEXT PRIMARY KEY, device_name TEXT DEFAULT '', country TEXT DEFAULT '', ip_address TEXT DEFAULT '', first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, actions_count INTEGER NOT NULL DEFAULT 0, is_banned INTEGER NOT NULL DEFAULT 0, ban_reason TEXT DEFAULT '')")
            db.execute("CREATE TABLE IF NOT EXISTS aman_user_tools (user_id TEXT NOT NULL, tool_key TEXT NOT NULL, uses_count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, tool_key))")
        db.commit()

def is_bot_request(ip: str, ua: str) -> bool:
    u = (ua or "").lower()
    if not u or ip in ("127.0.0.1", "::1") or ip.startswith("74.220.48."):
        return True
    return any(b in u for b in ("render", "go-http-client", "uptimerobot", "headless", "bot", "spider", "crawler", "curl/", "wget/", "python-requests"))

def friendly_model(raw: str) -> str:
    m = raw.strip(); up = m.upper()
    for code, name in _DEVICE_MAP.items():
        if up.startswith(code): return name
    if up.startswith("SM-S"): return f"Samsung Galaxy S ({m})"
    if up.startswith("SM-A"): return f"Samsung Galaxy A ({m})"
    if up.startswith("SM-N"): return f"Samsung Galaxy Note ({m})"
    if up.startswith(("SM-G", "SM-")): return f"Samsung Galaxy ({m})"
    if up.startswith("RMX"): return f"Realme ({m})"
    if up.startswith("CPH"): return f"OPPO ({m})"
    if up.startswith(("INFINIX", "X6")): return f"Infinix ({m})"
    if up.startswith(("TECNO", "KF", "KG", "KI", "KJ", "KL")): return f"TECNO ({m})"
    return m

def detect_device(headers) -> str:
    ua = headers.get("User-Agent") or ""
    ch_model = (headers.get("Sec-CH-UA-Model") or "").strip().strip('"').strip("'")
    if ch_model and ch_model.lower() not in ("k", "unknown"): return f"📱 {friendly_model(ch_model)}"
    if "iPhone" in ua:
        m = re.search(r"OS\s+(\d+)[_\.]", ua)
        return f"📱 iPhone (iOS {m.group(1)})" if m else "📱 iPhone"
    if "iPad" in ua: return "📱 iPad"
    if "Android" in ua:
        m = re.search(r"Android\s+[^;)]+;\s*([^;)]+)", ua)
        if m:
            model = m.group(1).split("Build/")[0].strip()
            if model and model.lower() not in ("k", "wv", "mobile"): return f"📱 {friendly_model(model)}"
        return "📱 جوال Android"
    if "Windows" in ua: return "💻 كمبيوتر Windows"
    if "Macintosh" in ua or "Mac OS" in ua: return "💻 جهاز Mac"
    return "🌐 متصفح ويب"

def lookup_geo(ip: str) -> str:
    if not ip or ip.startswith(("127.", "10.", "192.168.", "::1", "localhost")): return "محلي"
    if ip in _geo_cache: return _geo_cache[ip]
    label = ""
    for url in (f"http://ip-api.com/json/{ip}?fields=status,country,city&lang=ar", f"https://ipwho.is/{ip}"):
        try:
            with urllib.request.urlopen(url, timeout=2.0) as resp:
                d = json.loads(resp.read().decode("utf-8", "ignore"))
                if d.get("status") == "success" or d.get("success") is True:
                    c = _AR_COUNTRIES.get((d.get("country") or "").strip(), (d.get("country") or "").strip())
                    ct = _AR_CITIES.get((d.get("city") or "").strip(), (d.get("city") or "").strip())
                    label = f"{c} ({ct})" if (c and ct and ct != c) else (c or ct)
                    break
        except Exception: continue
    if len(_geo_cache) > 2000: _geo_cache.clear()
    if label: _geo_cache[ip] = label
    return label

def is_user_banned_cached(uid: str, ip: str = "") -> bool:
    key = f"{uid}|{ip}"
    if not uid and not ip: return False
    now = time.time(); rec = _ban_cache.get(key)
    if rec and (now - rec[1]) < 10.0: return rec[0]
    try:
        with _get_conn() as db:
            row = db.fetchone(
                "SELECT 1 FROM aman_users WHERE is_banned = 1 AND (user_id = ? OR (ip_address != '' AND ip_address = ?)) LIMIT 1",
                (uid or "", ip or ""),
            )
            banned = bool(row)
    except Exception: banned = False
    if len(_ban_cache) > 3000: _ban_cache.clear()
    _ban_cache[key] = (banned, now)
    return banned

def track_user_event(uid: str, ip: str, device: str, tool_key: str = "visit"):
    if not uid: return
    uid = uid.strip()[:64]
    country = lookup_geo(ip) or "غير محدد"
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    is_tool = tool_key in TOOL_LABELS
    inc = 1 if is_tool else 0
    with _get_conn() as db:
        if db.is_mysql:
            db.execute(
                "INSERT INTO aman_users (user_id, device_name, country, ip_address, first_seen, last_seen, actions_count) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE device_name=CASE WHEN VALUES(device_name) NOT IN ('📱 جوال Android','🌐 متصفح ويب') THEN VALUES(device_name) ELSE device_name END, country=CASE WHEN VALUES(country)!='غير محدد' THEN VALUES(country) ELSE country END, ip_address=VALUES(ip_address), last_seen=VALUES(last_seen), actions_count=actions_count+VALUES(actions_count)",
                (uid, device[:140], country[:100], ip[:64], now_str, now_str, inc),
            )
            if is_tool:
                db.execute("INSERT INTO aman_user_tools (user_id, tool_key, uses_count) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE uses_count = uses_count + 1", (uid, tool_key))
        else:
            db.execute(
                "INSERT INTO aman_users (user_id, device_name, country, ip_address, first_seen, last_seen, actions_count) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET device_name=CASE WHEN excluded.device_name NOT IN ('📱 جوال Android','🌐 متصفح ويب') THEN excluded.device_name ELSE aman_users.device_name END, country=CASE WHEN excluded.country!='غير محدد' THEN excluded.country ELSE aman_users.country END, ip_address=excluded.ip_address, last_seen=excluded.last_seen, actions_count=aman_users.actions_count+excluded.actions_count",
                (uid, device[:140], country[:100], ip[:64], now_str, now_str, inc),
            )
            if is_tool:
                db.execute("INSERT INTO aman_user_tools (user_id, tool_key, uses_count) VALUES (?, ?, 1) ON CONFLICT(user_id, tool_key) DO UPDATE SET uses_count = aman_user_tools.uses_count + 1", (uid, tool_key))
        db.commit()

def record_visit_or_action(uid: str, ip: str, device: str, stat_field: str = "visits"):
    m = {"url_scans": "url_scan", "hash_scans": "file_scan", "visits": "visit"}
    track_user_event(uid, ip, device, m.get(stat_field, "visit"))

def verify_admin_pin(pin: str) -> bool:
    return secrets.compare_digest(str(pin or ""), os.environ.get("AMAN_ADMIN_PIN", "aman2026"))

def set_user_ban(uid: str, banned: bool, reason: str = ""):
    _ban_cache.clear()
    with _get_conn() as db:
        db.execute("UPDATE aman_users SET is_banned = ?, ban_reason = ? WHERE user_id = ?", (1 if banned else 0, (reason or "")[:200], uid))
        db.commit()

def reset_all_stats():
    _ban_cache.clear()
    with _get_conn() as db:
        db.execute("DELETE FROM aman_user_tools")
        db.execute("DELETE FROM aman_users")
        db.commit()

def get_overview() -> dict:
    cutoff = (datetime.now() - timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")
    with _get_conn() as db:
        counts = db.fetchone("SELECT COUNT(*) AS total_users, COALESCE(SUM(CASE WHEN last_seen >= ? AND is_banned = 0 THEN 1 ELSE 0 END), 0) AS active_users, COALESCE(SUM(CASE WHEN is_banned = 1 THEN 1 ELSE 0 END), 0) AS banned_users, COALESCE(SUM(actions_count), 0) AS total_actions FROM aman_users", (cutoff,))
        users = [dict(r) for r in db.fetchall("SELECT * FROM aman_users ORDER BY last_seen DESC LIMIT 150")]
        tool_rows = db.fetchall("SELECT user_id, tool_key, uses_count FROM aman_user_tools")
    by_user = {}
    for tr in tool_rows:
        by_user.setdefault(tr["user_id"], {})[tr["tool_key"]] = int(tr["uses_count"] or 0)
    for u in users:
        u["tools"] = by_user.get(u["user_id"], {})
    return {
        "total_users": int(counts["total_users"] or 0),
        "active_users": int(counts["active_users"] or 0),
        "banned_users": int(counts["banned_users"] or 0),
        "total_actions": int(counts["total_actions"] or 0),
        "tool_labels": TOOL_LABELS,
        "users": users,
        "db_mode": "TiDB Cloud" if USE_TIDB else "SQLite",
    }
