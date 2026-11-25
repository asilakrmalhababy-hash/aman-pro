(function () {
  async function getCanvasHash() {
    try {
      const c = document.createElement('canvas');
      c.width = 220; c.height = 40;
      const ctx = c.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#0B4F43';
      ctx.fillRect(0, 0, 220, 40);
      ctx.fillStyle = '#2DD4BF';
      ctx.fillText('AmanPro-FP-Check-2026', 6, 10);
      const data = new TextEncoder().encode(c.toDataURL());
      const hashBuf = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hashBuf)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {
      return 'محمي / محجوب';
    }
  }

  function checkWebRTCLeak() {
    return new Promise(resolve => {
      const RTCPeer = window.RTCPeerConnection || window.webkitRTCPeerConnection;
      if (!RTCPeer) return resolve({ leaked: false, ips: [], status: 'محمي (WebRTC غير متاح)' });
      const ips = new Set();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        try { pc.close(); } catch (_) {}
        const list = Array.from(ips);
        const hasRealIp = list.some(ip => !ip.endsWith('.local'));
        resolve({
          leaked: hasRealIp,
          ips: list,
          status: hasRealIp ? `تم رصد IP عبر WebRTC (${list.join(', ')})` : 'آمن (محمي بـ mDNS أو بدون تسريب IP)'
        });
      };
      let pc;
      try {
        pc = new RTCPeer({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        pc.createDataChannel('');
        pc.onicecandidate = e => {
          if (!e || !e.candidate || !e.candidate.candidate) { finish(); return; }
          const m = e.candidate.candidate.match(/([0-9]{1,3}(?:\.[0-9]{1,3}){3}|[a-f0-9-]+\.local)/i);
          if (m) ips.add(m[1]);
        };
        pc.createOffer().then(o => pc.setLocalDescription(o)).catch(finish);
        setTimeout(finish, 1800);
      } catch (_) {
        resolve({ leaked: false, ips: [], status: 'محمي (WebRTC مقيد)' });
      }
    });
  }

  async function checkPermission(name) {
    try {
      if (!navigator.permissions) return 'غير معروف';
      const r = await navigator.permissions.query({ name });
      if (r.state === 'granted') return 'مسموح ⚠';
      if (r.state === 'denied') return 'مرفوض ✓';
      return 'عند الطلب ✓';
    } catch (_) {
      return 'غير مدعوم';
    }
  }

  async function runAudit() {
    const out = document.getElementById('priv-out');
    const btn = document.getElementById('btn-priv-run');
    if (!out) return;
    btn.disabled = true;
    btn.textContent = 'جاري فحص المتصفح والخصوصية...';
    out.classList.remove('hidden');
    out.innerHTML = '<div class="text-center py-6 text-xs text-teal-500 font-bold">جاري فحص WebRTC والأذونات وبصمة المتصفح محلياً...</div>';

    const [rtc, fpHash, pGeo, pCam, pMic, pNotif] = await Promise.all([
      checkWebRTCLeak(),
      getCanvasHash(),
      checkPermission('geolocation'),
      checkPermission('camera'),
      checkPermission('microphone'),
      checkPermission('notifications')
    ]);

    const isHttps = location.protocol === 'https:' || location.hostname === 'localhost';
    const dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1';
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'غير محدد';
    const cores = navigator.hardwareConcurrency || 'مخفي';
    const mem = navigator.deviceMemory ? navigator.deviceMemory + ' GB' : 'مخفي';
    const screenRes = `${screen.width}×${screen.height}`;
    const cookiesOn = navigator.cookieEnabled;

    let score = 100;
    const tips = [];
    if (!isHttps) { score -= 25; tips.push('الاتصال غير مشفّر (HTTP) — استخدم دائماً رابط HTTPS.'); }
    if (rtc.leaked) { score -= 22; tips.push('متصفحك يكشف IP عبر WebRTC — فعّل حماية WebRTC في المتصفح أو إضافة الـ VPN.'); }
    if (!dnt) { score -= 8; tips.push('خيار منع التتبع (Do Not Track) غير مفعّل في إعدادات المتصفح.'); }
    if (pGeo.includes('مسموح')) { score -= 12; tips.push('إذن الموقع الجغرافي مفتوح — يُنصح بتغييره إلى "عند الطلب".'); }
    if (pCam.includes('مسموح')) { score -= 8; tips.push('إذن الكاميرا مسموح تلقائياً — راجعه من إعدادات الموقع.'); }
    if (pMic.includes('مسموح')) { score -= 10; tips.push('إذن الميكروفون مسموح تلقائياً — يُفضّل جعله عند الطلب فقط.'); }
    if (fpHash !== 'محمي / محجوب') { score -= 7; tips.push('بصمة Canvas فريدة لجهازك — متصفحات مثل Brave أو Firefox تعزلها بشكل أقوى.'); }
    score = Math.max(15, Math.min(100, score));

    const color = score >= 80 ? 'text-emerald-500' : (score >= 55 ? 'text-amber-500' : 'text-rose-500');
    const bar = score >= 80 ? 'bg-emerald-500' : (score >= 55 ? 'bg-amber-500' : 'bg-rose-500');
    const label = score >= 80 ? 'خصوصية ممتازة' : (score >= 55 ? 'خصوصية متوسطة — يمكن تقويتها' : 'خصوصية ضعيفة — انتبه للتسريبات');

    const row = (k, v, warn) => `
      <div class="flex items-center justify-between gap-2 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
        <span class="text-slate-500 dark:text-slate-400 font-semibold">${k}</span>
        <span class="font-bold mono text-left ${warn ? 'text-amber-500' : 'text-slate-800 dark:text-slate-100'}" dir="ltr">${v}</span>
      </div>`;

    out.innerHTML = `
      <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-extrabold ${color}">${label}</span>
          <span class="text-xl font-black mono ${color}">${score}%</span>
        </div>
        <div class="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div class="h-full ${bar} transition-all" style="width:${score}%"></div>
        </div>
        <div class="space-y-2">
          <div class="text-xs font-extrabold text-teal-600 dark:text-teal-400">1. الشبكة وتسريب WebRTC</div>
          ${row('تشفير الاتصال (HTTPS)', isHttps ? 'آمن ✓' : 'غير مشفّر ⚠', !isHttps)}
          ${row('تسريب WebRTC / VPN', rtc.status, rtc.leaked)}
          ${row('منع التتبع (Do Not Track)', dnt ? 'مفعّل ✓' : 'غير مفعّل', !dnt)}
          ${row('ملفات الكوكيز', cookiesOn ? 'مفعّلة' : 'محجوبة ✓', false)}
        </div>
        <div class="space-y-2">
          <div class="text-xs font-extrabold text-teal-600 dark:text-teal-400">2. بصمة جهازك الظاهرة للمواقع</div>
          ${row('بصمة الرسم (Canvas ID)', fpHash, false)}
          ${row('الشاشة / الأنوية / الذاكرة', `${screenRes} | ${cores} CPU | ${mem}`, false)}
          ${row('المنطقة الزمنية واللغة', `${tz} (${navigator.language})`, false)}
        </div>
        <div class="space-y-2">
          <div class="text-xs font-extrabold text-teal-600 dark:text-teal-400">3. الأذونات الحساسة</div>
          ${row('الموقع الجغرافي (GPS)', pGeo, pGeo.includes('مسموح'))}
          ${row('الكاميرا', pCam, pCam.includes('مسموح'))}
          ${row('الميكروفون', pMic, pMic.includes('مسموح'))}
          ${row('الإشعارات', pNotif, false)}
        </div>
        ${tips.length ? `<div class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1.5">
          <div class="text-xs font-extrabold text-amber-500">توصيات لتقوية خصوصيتك:</div>
          ${tips.map(t => `<p class="text-[11px] text-slate-600 dark:text-slate-300">• ${t}</p>`).join('')}
        </div>` : '<div class="text-xs font-bold text-emerald-500">✓ إعدادات متصفحك ممتازة ولم تُرصد تسريبات واضحة!</div>'}
      </div>`;

    btn.disabled = false;
    btn.textContent = 'إعادة الفحص الآن';
  }

  function initPrivacyAudit() {
    const main = document.querySelector('main');
    const navTools = document.querySelector('#sidebar nav > div:last-child');
    if (!main || !navTools || document.getElementById('panel-privacy-audit')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-tab', 'privacy-audit');
    btn.className = 'nav-item hidden w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition';
    btn.innerHTML = '<i data-lucide="radar" class="w-4 h-4 shrink-0"></i><span>فحص المتصفح والخصوصية</span>';
    navTools.appendChild(btn);

    const sec = document.createElement('section');
    sec.id = 'panel-privacy-audit';
    sec.className = 'tab-panel hidden fade-in space-y-5';
    sec.innerHTML = `
      <div class="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 max-w-2xl mx-auto">
        <div>
          <h2 class="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">فاحص خصوصية المتصفح وبصمة الجهاز</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">يفحص تسريب الـ VPN (WebRTC)، الأذونات الحساسة، وبصمة جهازك الظاهرة للمواقع محلياً 100%.</p>
        </div>
        <button id="btn-priv-run" type="button" class="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition">بدء فحص المتصفح الآن</button>
        <div id="priv-out" class="hidden fade-in"></div>
      </div>`;
    main.appendChild(sec);

    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'panel-privacy-audit'));
      const pt = document.getElementById('page-title'); if (pt) pt.textContent = 'فحص المتصفح والخصوصية';
      const sb = document.getElementById('sidebar'), bd = document.getElementById('sidebar-backdrop');
      if (sb && window.innerWidth < 1024) sb.classList.add(document.documentElement.dir === 'rtl' ? 'translate-x-full' : '-translate-x-full');
      if (bd) bd.classList.add('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.getElementById('btn-priv-run').addEventListener('click', runAudit);

    setTimeout(() => {
      const scanGrid = document.querySelector('#panel-hub-scan .grid');
      if (scanGrid && !scanGrid.querySelector('[data-hub-go="privacy-audit"]')) {
        const phishCard = scanGrid.querySelector('[data-hub-go="phish"]');
        if (phishCard) {
          phishCard.className = 'group w-full p-6 min-h-[148px] rounded-3xl bg-white dark:bg-[#0B1E1A] border border-slate-200 dark:border-teal-900/60 hover:border-teal-500 transition flex flex-col items-center justify-between gap-5 shadow-sm text-center';
          phishCard.innerHTML = '<i data-lucide="message-square-warning" class="w-7 h-7 text-teal-600 dark:text-teal-400 mt-1"></i><span class="text-base font-extrabold text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition leading-snug">كاشف رسائل النصب</span>';
        }
        const card = document.createElement('button');
        card.type = 'button';
        card.setAttribute('data-hub-go', 'privacy-audit');
        card.className = 'group w-full p-6 min-h-[148px] rounded-3xl bg-white dark:bg-[#0B1E1A] border border-slate-200 dark:border-teal-900/60 hover:border-teal-500 transition flex flex-col items-center justify-between gap-5 shadow-sm text-center';
        card.innerHTML = '<i data-lucide="radar" class="w-7 h-7 text-teal-600 dark:text-teal-400 mt-1"></i><span class="text-base font-extrabold text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition leading-snug">فحص المتصفح والخصوصية</span>';
        card.addEventListener('click', () => btn.click());
        scanGrid.appendChild(card);
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    }, 180);

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  window.addEventListener('load', () => setTimeout(initPrivacyAudit, 100));
})();
