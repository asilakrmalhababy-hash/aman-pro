(function () {
  function getOrCreateUid() {
    let uid = '';
    try { uid = localStorage.getItem('aman_uid') || ''; } catch (_) {}
    if (!uid) {
      const m = document.cookie.match(/(?:^|;\s*)aman_uid=([^;]+)/);
      if (m) uid = decodeURIComponent(m[1]);
    }
    if (!uid) uid = 'dev_' + Math.random().toString(16).slice(2, 12);
    try { localStorage.setItem('aman_uid', uid); } catch (_) {}
    const sec = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = 'aman_uid=' + encodeURIComponent(uid) + '; path=/; max-age=31536000; SameSite=Lax' + sec;
    return uid;
  }

  const UID = getOrCreateUid();

  function showBanScreen() {
    document.body.innerHTML = '<div dir="rtl" style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#071311;color:#fff;font-family:system-ui;padding:24px;text-align:center;"><div style="max-width:400px;background:#0B1E1A;border:1px solid rgba(244,63,94,.4);border-radius:24px;padding:32px;"><div style="font-size:44px;margin-bottom:12px;">🚫</div><h2 style="margin:0 0 10px;color:#fb7185;font-size:20px;font-weight:800;">تم حظر وصولك</h2><p style="margin:0;font-size:14px;color:#94a3b8;line-height:1.7;">تم إيقاف وصول جهازك إلى منصة أمان zoro من قبل الإدارة.</p></div></div>';
  }

  function track(toolKey) {
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Aman-Uid': UID },
        body: JSON.stringify({ uid: UID, tool: toolKey }),
        keepalive: true
      }).then(r => r.json()).then(j => { if (j && j.banned) showBanScreen(); }).catch(() => {});
    } catch (_) {}
  }

  track('visit');

  function bindToolTracking() {
    const map = [
      ['#btn-phish-run', 'phish'],
      ['#btn-priv-run', 'privacy_audit'],
      ['#btn-exif-clean', 'exif'],
      ['#stg-btn-hide', 'stego'],
      ['#stg-btn-ext', 'stego']
    ];
    map.forEach(([sel, key]) => {
      const el = document.querySelector(sel);
      if (el && !el.dataset.trk) { el.dataset.trk = '1'; el.addEventListener('click', () => track(key)); }
    });
    const panelMap = { 'panel-url': 'url_scan', 'panel-file': 'file_scan', 'panel-crypto': 'crypto', 'panel-pass': 'password', 'panel-qr': 'qr', 'panel-secret': 'secret_link' };
    Object.keys(panelMap).forEach(pid => {
      const panel = document.getElementById(pid);
      if (!panel) return;
      panel.querySelectorAll('button').forEach(b => {
        if (b.dataset.trk) return;
        const tx = (b.textContent || '').trim();
        if (/(فحص|تشفير|توليد|إنشاء|تحليل|scan|encrypt|decrypt|generate|create)/i.test(tx)) {
          b.dataset.trk = '1';
          b.addEventListener('click', () => track(panelMap[pid]));
        }
      });
      if (pid === 'panel-file') {
        const fi = panel.querySelector('input[type="file"]');
        if (fi && !fi.dataset.trk) { fi.dataset.trk = '1'; fi.addEventListener('change', () => { if (fi.files && fi.files.length) track('file_scan'); }); }
      }
    });
  }

  window.addEventListener('load', () => setTimeout(bindToolTracking, 350));
})();
