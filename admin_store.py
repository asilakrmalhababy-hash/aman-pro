import os, re, secrets, sqlite3, time
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

_DEVICE_MAP = {
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
    "Sanaa": "صنعاء", "Sana'a": "صنعاء", "'Amran": "عمران", "Amran": "عمران",
    "Aden": "عدن", "Taiz": "تعز", "Taizz": "تعز", "Ibb": "إب",
    "Al Hudaydah": "الحديدة", "Hodeidah": "الحديدة", "Mukalla": "المكلا",
    "Dhamar": "ذمار", "Hajjah": "حجة", "Marib": "مأرب", "Saada": "صعدة",
    "Riyadh": "الرياض", "Jeddah": "جدة", "Cairo": "القاهرة", "Dubai": "دبي",
}
_geo_cache, _ban_cache, _visit_cooldown = {}, {}, {}

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
        ssl_cfg = {"ca": certifi.where()} if certifi else {"ssl": {}}
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
            db.execute("CREATE TABLE IF NOT EXISTS aman_stats (id INT PRIMARY KEY, url_scans INT NOT NULL DEFAULT 0, hash_scans INT NOT NULL DEFAULT 0, visits INT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4")
            db.execute("INSERT IGNORE INTO aman_stats (id) VALUES (1)")
            db.execute("CREATE TABLE IF NOT EXISTS aman_users (user_id VARCHAR(64) PRIMARY KEY, device_name VARCHAR(140) DEFAULT '', country VARCHAR(100) DEFAULT '', ip_address VARCHAR(64) DEFAULT '', first_seen VARCHAR(30) NOT NULL, last_seen VARCHAR(30) NOT NULL, actions_count INT NOT NULL DEFAULT 0, is_banned TINYINT NOT NULL DEFAULT 0, ban_reason VARCHAR(200) DEFAULT '') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4")
        else:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE IF NOT EXISTS aman_stats (id INTEGER PRIMARY KEY CHECK (id = 1), url_scans INTEGER NOT NULL DEFAULT 0, hash_scans INTEGER NOT NULL DEFAULT 0, visits INTEGER NOT NULL DEFAULT 0)")
            db.execute("INSERT OR IGNORE INTO aman_stats (id) VALUES (1)")
            db.execute("CREATE TABLE IF NOT EXISTS aman_users (user_id TEXT PRIMARY KEY, device_name TEXT DEFAULT '', country TEXT DEFAULT '', ip_address TEXT DEFAULT '', first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, actions_count INTEGER NOT NULL DEFAULT 0, is_banned INTEGER NOT NULL DEFAULT 0, ban_reason TEXT DEFAULT '')")
        db.commit()

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
    import json, urllib.request
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

def is_user_banned_cached(uid: str) -> bool:
    if not uid: return False
    now = time.time(); rec = _ban_cache.get(uid)
    if rec and (now - rec[1]) < 20.0: return rec[0]
    try:
        with _get_conn() as db:
            row = db.fetchone("SELECT is_banned FROM aman_users WHERE user_id = ?", (uid,))
            banned = bool(row and row["is_banned"] == 1)
    except Exception: banned = False
    if len(_ban_cache) > 3000: _ban_cache.clear()
    _ban_cache[uid] = (banned, now)
    return banned

def record_visit_or_action(uid: str, ip: str, device: str, stat_field: str = "visits"):
    if stat_field not in ("url_scans", "hash_scans", "visits"): stat_field = "visits"
    if stat_field == "visits":
        now = time.time()
        if (now - _visit_cooldown.get(uid, 0.0)) < 1800.0: return
        if len(_visit_cooldown) > 5000: _visit_cooldown.clear()
        _visit_cooldown[uid] = now
    country = lookup_geo(ip) or "غير محدد"
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with _get_conn() as db:
        db.execute(f"UPDATE aman_stats SET {stat_field} = {stat_field} + 1 WHERE id = 1")
        if db.is_mysql:
            db.execute(
                "INSERT INTO aman_users (user_id, device_name, country, ip_address, first_seen, last_seen, actions_count) VALUES (?, ?, ?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE device_name=VALUES(device_name), country=CASE WHEN VALUES(country)!='غير محدد' THEN VALUES(country) ELSE country END, ip_address=VALUES(ip_address), last_seen=VALUES(last_seen), actions_count=actions_count+1",
                (uid[:64], device[:140], country[:100], ip[:64], now_str, now_str),
            )
        else:
            db.execute(
                "INSERT INTO aman_users (user_id, device_name, country, ip_address, first_seen, last_seen, actions_count) VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(user_id) DO UPDATE SET device_name=excluded.device_name, country=CASE WHEN excluded.country!='غير محدد' THEN excluded.country ELSE aman_users.country END, ip_address=excluded.ip_address, last_seen=excluded.last_seen, actions_count=aman_users.actions_count+1",
                (uid[:64], device[:140], country[:100], ip[:64], now_str, now_str),
            )
        db.commit()

def verify_admin_pin(pin: str) -> bool:
    return secrets.compare_digest(str(pin or ""), os.environ.get("AMAN_ADMIN_PIN", "aman2026"))

def set_user_ban(uid: str, banned: bool, reason: str = ""):
    _ban_cache.pop(uid, None)
    with _get_conn() as db:
        db.execute("UPDATE aman_users SET is_banned = ?, ban_reason = ? WHERE user_id = ?", (1 if banned else 0, (reason or "")[:200], uid))
        db.commit()

def get_overview() -> dict:
    cutoff = (datetime.now() - timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")
    with _get_conn() as db:
        st = db.fetchone("SELECT url_scans, hash_scans, visits FROM aman_stats WHERE id = 1") or {"url_scans": 0, "hash_scans": 0, "visits": 0}
        counts = db.fetchone("SELECT COUNT(*) AS total_users, COALESCE(SUM(CASE WHEN last_seen >= ? AND is_banned = 0 THEN 1 ELSE 0 END), 0) AS active_users, COALESCE(SUM(CASE WHEN is_banned = 1 THEN 1 ELSE 0 END), 0) AS banned_users FROM aman_users", (cutoff,))
        users = [dict(r) for r in db.fetchall("SELECT * FROM aman_users ORDER BY last_seen DESC LIMIT 150")]
    return {
        "stats": dict(st),
        "total_users": int(counts["total_users"] or 0),
        "active_users": int(counts["active_users"] or 0),
        "banned_users": int(counts["banned_users"] or 0),
        "users": users,
        "db_mode": "TiDB Cloud" if USE_TIDB else "SQLite",
    }
