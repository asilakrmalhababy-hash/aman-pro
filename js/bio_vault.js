(function () {
  const CRED_KEY = 'aman_bio_cred_id';
  const VAULT_KEY = 'aman_bio_vault_enc';
  const SALT_KEY = 'aman_bio_vault_salt';
  const META_KEY = 'aman_bio_vault_meta';
  let cachedCryptoKey = null;

  function maskPw(pw) {
    const s = String(pw || '');
    if (s.length <= 4) return '••••';
    return s.slice(0, 2) + '••••' + s.slice(-2);
  }

  function b64uToBuf(b64u) {
    const pad = '='.repeat((4 - (b64u.length % 4)) % 4);
    const b64 = (b64u + pad).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }

  function bufToB64u(buf) {
    const arr = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function getVaultKey(secretSeed) {
    if (cachedCryptoKey) return cachedCryptoKey;
    let saltB64 = localStorage.getItem(SALT_KEY);
    if (!saltB64) {
      const s = new Uint8Array(16);
      crypto.getRandomValues(s);
      saltB64 = bufToB64u(s.buffer);
      localStorage.setItem(SALT_KEY, saltB64);
    }
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(secretSeed), 'PBKDF2', false, ['deriveKey']);
    cachedCryptoKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64uToBuf(saltB64), iterations: 100000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    return cachedCryptoKey;
  }

  async function verifyBiometric(reasonText) {
    if (!window.PublicKeyCredential || !navigator.credentials) return askFallbackPin(reasonText);
    try {
      let credId = localStorage.getItem(CRED_KEY);
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      if (!credId) {
        const userId = new Uint8Array(16);
        crypto.getRandomValues(userId);
        const cred = await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: 'Aman zoro', id: location.hostname || 'localhost' },
            user: { id: userId, name: 'aman-user', displayName: 'Aman zoro User' },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
            authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
            timeout: 60000
          }
        });
        if (!cred) return false;
        credId = bufToB64u(cred.rawId);
        localStorage.setItem(CRED_KEY, credId);
        await getVaultKey(credId);
        return true;
      } else {
        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge,
            allowCredentials: [{ type: 'public-key', id: b64uToBuf(credId) }],
            userVerification: 'required',
            timeout: 60000
          }
        });
        if (!assertion) return false;
        await getVaultKey(credId);
        return true;
      }
    } catch (_) {
      return askFallbackPin(reasonText);
    }
  }

  function askFallbackPin(reasonText) {
    const saved = localStorage.getItem('aman_bio_pin_hash');
    const msg = saved
      ? `${reasonText}\nأدخل رمز الخزنة الاحتياطي (4+ خانات):`
      : 'أنشئ رمز خزنة احتياطي (4+ خانات) لحماية سجلك:';
    const pin = prompt(msg);
    if (!pin || pin.trim().length < 4) return false;
    const p = pin.trim();
    if (!saved) {
      localStorage.setItem('aman_bio_pin_hash', btoa(p));
      return getVaultKey(p).then(() => true);
    }
    if (btoa(p) !== saved) { alert('الرمز غير صحيح!'); return false; }
    return getVaultKey(p).then(() => true);
  }

  async function readVault() {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw || !cachedCryptoKey) return { passwords: [], history: [] };
    try {
      const obj = JSON.parse(raw);
      const dec = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: b64uToBuf(obj.iv) },
        cachedCryptoKey,
        b64uToBuf(obj.ct)
      );
      return JSON.parse(new TextDecoder().decode(dec));
    } catch (_) { return { passwords: [], history: [] }; }
  }

  async function writeVault(data) {
    if (!cachedCryptoKey) {
      const credId = localStorage.getItem(CRED_KEY);
      if (credId) await getVaultKey(credId);
      else return;
    }
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const enc = new TextEncoder().encode(JSON.stringify(data));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cachedCryptoKey, enc);
    localStorage.setItem(VAULT_KEY, JSON.stringify({ iv: bufToB64u(iv.buffer), ct: bufToB64u(ct) }));
    const hints = (data.passwords || []).map(maskPw);
    localStorage.setItem(META_KEY, JSON.stringify({ hints, histCount: (data.history || []).length }));
    renderSavedPwPopover();
  }

  async function saveOperationToVault(typeLabel, contentPreview, passwordUsed) {
    try {
      const credId = localStorage.getItem(CRED_KEY);
      const nowStr = new Date().toLocaleString('ar-YE');
      if (!credId && !cachedCryptoKey) {
        let q = JSON.parse(sessionStorage.getItem('aman_pending_ops') || '[]');
        q.unshift({ type: typeLabel, preview: String(contentPreview || '').slice(0, 140), pw: passwordUsed || '', time: nowStr });
        sessionStorage.setItem('aman_pending_ops', JSON.stringify(q.slice(0, 30)));
        renderSavedPwPopover();
        return;
      }
      await getVaultKey(credId);
      const v = await readVault();
      if (passwordUsed && passwordUsed.length >= 4 && !v.passwords.includes(passwordUsed)) {
        v.passwords.unshift(passwordUsed);
        v.passwords = v.passwords.slice(0, 8);
      }
      v.history.unshift({ type: typeLabel, preview: String(contentPreview || '').slice(0, 140), pw: passwordUsed ? maskPw(passwordUsed) : '', time: nowStr });
      v.history = v.history.slice(0, 60);
      await writeVault(v);
    } catch (_) {}
  }

  async function flushPendingToVault() {
    const raw = sessionStorage.getItem('aman_pending_ops');
    if (!raw || !cachedCryptoKey) return;
    try {
      const q = JSON.parse(raw);
      if (!q.length) return;
      const v = await readVault();
      q.reverse().forEach(op => {
        if (op.pw && op.pw.length >= 4 && !v.passwords.includes(op.pw)) v.passwords.unshift(op.pw);
        v.history.unshift({ type: op.type, preview: op.preview, pw: op.pw ? maskPw(op.pw) : '', time: op.time });
      });
      v.passwords = v.passwords.slice(0, 8);
      v.history = v.history.slice(0, 60);
      await writeVault(v);
      sessionStorage.removeItem('aman_pending_ops');
    } catch (_) {}
  }

  function getSavedHints() {
    try {
      const meta = JSON.parse(localStorage.getItem(META_KEY) || '{}');
      const hints = Array.isArray(meta.hints) ? [...meta.hints] : [];
      const pend = JSON.parse(sessionStorage.getItem('aman_pending_ops') || '[]');
      pend.forEach(x => {
        if (x.pw && x.pw.length >= 4) {
          const h = maskPw(x.pw);
          if (!hints.includes(h)) hints.unshift(h);
        }
      });
      return hints.slice(0, 8);
    } catch (_) { return []; }
  }

  function renderSavedPwPopover() {
    const wrap = document.getElementById('aman-pw-popover-wrap');
    if (!wrap) return;
    const hints = getSavedHints();
    const isEn = document.documentElement.lang === 'en' || document.documentElement.dir === 'ltr';
    if (!hints.length) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    const trig = document.getElementById('aman-pw-pop-btn');
    const menu = document.getElementById('aman-pw-pop-menu');
    if (trig) trig.innerHTML = `<span>🔐</span><span>${isEn ? 'Saved Passwords' : 'كلمات السر المحفوظة'} (${hints.length})</span><span class="text-[10px] opacity-70">▾</span>`;
    if (menu) {
      menu.innerHTML = hints.map((h, i) => `
        <button type="button" data-pw-idx="${i}" class="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-100 hover:bg-teal-500/15 transition">
          <span class="mono tracking-wider text-teal-600 dark:text-teal-300" dir="ltr">${h}</span>
          <span class="text-[10px] text-slate-400">${isEn ? '👆 Fingerprint' : '👆 ابصم للتعبئة'}</span>
        </button>`).join('');

      menu.querySelectorAll('[data-pw-idx]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = parseInt(btn.getAttribute('data-pw-idx'), 10);
          menu.classList.add('hidden');
          const ok = await verifyBiometric(isEn ? 'Verify fingerprint to fill saved password' : 'ابصم لاستخدام كلمة السر المحفوظة');
          if (!ok) return;
          await flushPendingToVault();
          const v = await readVault();
          const pw = (v.passwords || [])[idx];
          const passInp = document.querySelector('#panel-crypto input[type="password"]') || document.querySelector('#panel-crypto input');
          if (pw && passInp) {
            passInp.value = pw;
            passInp.dispatchEvent(new Event('input', { bubbles: true }));
            const cpBtn = document.getElementById('aman-copy-filled-pw');
            if (cpBtn) cpBtn.classList.remove('hidden');
          }
        });
      });
    }
  }

  function renderVaultHistory(v) {
    const body = document.getElementById('aman-vault-body');
    if (!body) return;
    const isEn = document.documentElement.lang === 'en' || document.documentElement.dir === 'ltr';
    const hist = v.history || [];
    const pws = v.passwords || [];

    const pwHtml = pws.length
      ? `<div class="space-y-2">
          <div class="text-xs font-bold text-slate-500 dark:text-slate-400">${isEn ? 'Saved Passwords' : 'كلمات السر المحفوظة'}</div>
          <div class="flex flex-wrap gap-2">${pws.map((pw, i) => `
            <button type="button" data-copy-vpw="${i}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-teal-500/10 text-teal-600 dark:text-teal-300 border border-teal-500/20 hover:bg-teal-500/20 transition">
              <span>🔑</span><span class="mono" dir="ltr">${maskPw(pw)}</span><span class="text-[10px] opacity-70">(${isEn ? 'Copy' : 'نسخ'})</span>
            </button>`).join('')}
          </div>
        </div>`
      : '';

    const histHtml = hist.length
      ? hist.map(item => `
          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-teal-900/40 space-y-1">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-extrabold text-teal-600 dark:text-teal-400">${item.type}</span>
              <span class="text-[10px] text-slate-400" dir="ltr">${item.time}</span>
            </div>
            <p class="text-xs text-slate-700 dark:text-slate-300 break-all mono">${item.preview || '—'}</p>
          </div>`).join('')
      : `<div class="text-center py-8 text-xs text-slate-400">${isEn ? 'No saved operations yet.' : 'لا توجد عمليات محفوظة في سجلك بعد.'}</div>`;

    body.innerHTML = `
      ${pwHtml}
      <div class="space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 dark:text-slate-400">${isEn ? 'All Recent Operations' : 'سجل كل عملياتك السابقة'} (${hist.length})</span>
          ${hist.length || pws.length ? `<button type="button" id="btn-clear-vault" class="text-[11px] font-bold text-rose-500 hover:underline">${isEn ? 'Clear All' : 'مسح السجل'}</button>` : ''}
        </div>
        ${histHtml}
      </div>`;

    body.querySelectorAll('[data-copy-vpw]').forEach(b => {
      b.addEventListener('click', async () => {
        const pw = pws[parseInt(b.getAttribute('data-copy-vpw'), 10)];
        if (pw) {
          try { await navigator.clipboard.writeText(pw); } catch (_) {}
          b.innerHTML = `<span>✓</span><span>${isEn ? 'Copied!' : 'تم النسخ'}</span>`;
        }
      });
    });

    const clr = document.getElementById('btn-clear-vault');
    if (clr) {
      clr.addEventListener('click', async () => {
        await writeVault({ passwords: [], history: [] });
        renderVaultHistory({ passwords: [], history: [] });
      });
    }
  }

  function hookAllToolsForHistory() {
    const cryptoPanel = document.getElementById('panel-crypto');
    if (cryptoPanel) {
      cryptoPanel.querySelectorAll('button').forEach(btn => {
        const tx = (btn.textContent || '').trim();
        if (/(تشفير|فك|encrypt|decrypt|encode|decode)/i.test(tx)) {
          btn.addEventListener('click', () => {
            const ta = cryptoPanel.querySelector('textarea');
            const pInp = cryptoPanel.querySelector('input[type="password"]') ||
              Array.from(cryptoPanel.querySelectorAll('input')).find(i => (i.placeholder || '').includes('كلمة'));
            if (ta && ta.value.trim()) saveOperationToVault(tx, ta.value.trim(), pInp ? pInp.value : '');
          });
        }
      });
    }
    const urlPanel = document.getElementById('panel-url');
    if (urlPanel) {
      urlPanel.querySelectorAll('button').forEach(btn => {
        if (/(فحص|scan|check)/i.test(btn.textContent || '')) {
          btn.addEventListener('click', () => {
            const inp = urlPanel.querySelector('input');
            if (inp && inp.value.trim()) saveOperationToVault('فحص رابط', inp.value.trim(), '');
          });
        }
      });
    }
    const fileInp = document.querySelector('#panel-file input[type="file"]');
    if (fileInp) {
      fileInp.addEventListener('change', () => {
        const f = fileInp.files && fileInp.files[0];
        if (f) saveOperationToVault('فحص ملف / صورة', `${f.name} (${(f.size / 1024).toFixed(1)} KB)`, '');
      });
    }
    const stgH = document.getElementById('stg-btn-hide'), stgE = document.getElementById('stg-btn-ext');
    if (stgH) stgH.addEventListener('click', () => {
      const t = document.getElementById('stg-text'), p = document.getElementById('stg-pass-h');
      if (t && t.value.trim()) saveOperationToVault('إخفاء نص في صورة', t.value.trim(), p ? p.value : '');
    });
    if (stgE) stgE.addEventListener('click', () => saveOperationToVault('استخراج نص من صورة', 'صورة مشفّرة', ''));
    const exBtn = document.getElementById('btn-exif-clean');
    if (exBtn) exBtn.addEventListener('click', () => {
      const lbl = document.getElementById('exif-lbl');
      saveOperationToVault('تنظيف خصوصية صورة (EXIF)', lbl ? lbl.textContent : 'صورة', '');
    });
    const phBtn = document.getElementById('btn-phish-run');
    if (phBtn) phBtn.addEventListener('click', () => {
      const inp = document.getElementById('phish-inp');
      if (inp && inp.value.trim()) saveOperationToVault('فحص رسالة نصب', inp.value.trim(), '');
    });
    const prBtn = document.getElementById('btn-priv-run');
    if (prBtn) prBtn.addEventListener('click', () => saveOperationToVault('فحص خصوصية المتصفح', 'فحص WebRTC وبصمة الجهاز', ''));
    const secPanel = document.getElementById('panel-secret');
    if (secPanel) {
      secPanel.querySelectorAll('button').forEach(b => {
        if (/(توليد|إنشاء|create|generate)/i.test(b.textContent || '')) {
          b.addEventListener('click', () => saveOperationToVault('إنشاء رابط سري مشفّر', 'رابط مشفّر عبر واتساب', ''));
        }
      });
    }
    const qrPanel = document.getElementById('panel-qr');
    if (qrPanel) {
      qrPanel.querySelectorAll('button').forEach(b => {
        if (/(توليد|إنشاء|تحميل|generate|download)/i.test(b.textContent || '')) {
          b.addEventListener('click', () => {
            const inp = qrPanel.querySelector('input, textarea');
            if (inp && inp.value.trim()) saveOperationToVault('الباركود الأمني (QR)', inp.value.trim(), '');
          });
        }
      });
    }
  }

  function initBioVault() {
    const main = document.querySelector('main');
    const navRoot = document.querySelector('#sidebar nav');
    if (!main || !navRoot || document.getElementById('panel-my-vault')) return;

    const cryptoPanel = document.getElementById('panel-crypto');
    if (cryptoPanel) {
      const passInp = cryptoPanel.querySelector('input[type="password"]') ||
        Array.from(cryptoPanel.querySelectorAll('input')).find(i => (i.placeholder || '').includes('كلمة'));
      if (passInp && !document.getElementById('aman-pw-popover-wrap')) {
        const wrap = document.createElement('div');
        wrap.id = 'aman-pw-popover-wrap';
        wrap.className = 'hidden relative mt-2';
        wrap.innerHTML = `
          <div class="flex items-center gap-2 flex-wrap">
            <button type="button" id="aman-pw-pop-btn" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-teal-500/12 text-teal-600 dark:text-teal-300 border border-teal-500/25 hover:bg-teal-500/20 transition"></button>
            <button type="button" id="aman-copy-filled-pw" class="hidden inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-teal-300 border border-slate-300/60 dark:border-teal-800/60 hover:bg-teal-500/20 transition">📋 نسخ كلمة السر</button>
          </div>
          <div id="aman-pw-pop-menu" class="hidden absolute right-0 mt-1.5 w-64 p-1.5 rounded-2xl bg-white dark:bg-[#0B1E1A] border border-slate-200 dark:border-teal-800/70 shadow-2xl z-50 space-y-1"></div>`;
        passInp.parentNode.insertBefore(wrap, passInp.nextSibling);

        document.getElementById('aman-pw-pop-btn').addEventListener('click', e => {
          e.stopPropagation();
          document.getElementById('aman-pw-pop-menu').classList.toggle('hidden');
        });
        const cpBtn = document.getElementById('aman-copy-filled-pw');
        if (cpBtn) {
          cpBtn.addEventListener('click', async () => {
            if (!passInp.value) return;
            try { await navigator.clipboard.writeText(passInp.value); } catch (_) {}
            const en = document.documentElement.lang === 'en' || document.documentElement.dir === 'ltr';
            cpBtn.textContent = en ? '✓ Copied!' : '✓ تم النسخ!';
            setTimeout(() => { cpBtn.textContent = en ? '📋 Copy Password' : '📋 نسخ كلمة السر'; }, 2200);
          });
          passInp.addEventListener('input', () => {
            cpBtn.classList.toggle('hidden', !passInp.value);
          });
        }
        document.addEventListener('click', () => {
          const m = document.getElementById('aman-pw-pop-menu');
          if (m) m.classList.add('hidden');
        });
        renderSavedPwPopover();
      }
    }

    hookAllToolsForHistory();

    const visibleGroups = Array.from(navRoot.children).filter(el => el.tagName === 'DIV' && !el.classList.contains('hidden'));
    const toolsGroup = visibleGroups[visibleGroups.length - 1] || navRoot;

    const navBtn = document.createElement('button');
    navBtn.type = 'button';
    navBtn.setAttribute('data-tab', 'my-vault');
    navBtn.className = 'nav-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition';
    navBtn.innerHTML = '<i data-lucide="fingerprint" class="w-4 h-4 shrink-0"></i><span>عملياتي وسجلي الخاص</span>';
    toolsGroup.appendChild(navBtn);

    const sec = document.createElement('section');
    sec.id = 'panel-my-vault';
    sec.className = 'tab-panel hidden fade-in space-y-5 max-w-2xl mx-auto';
    sec.innerHTML = `
      <div class="bg-white dark:bg-[#0B1E1A] rounded-3xl border border-slate-200 dark:border-teal-900/60 p-6 space-y-5 shadow-sm">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">عملياتي وسجلي الخاص</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">محفوظة ومشفّرة داخل جهازك فقط — لا تفتح إلا ببصمتك.</p>
          </div>
          <button type="button" id="btn-lock-vault" class="hidden px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">قفل ✕</button>
        </div>
        <div id="aman-vault-lock" class="py-8 text-center space-y-4">
          <div class="w-16 h-16 mx-auto rounded-2xl bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center">
            <i data-lucide="fingerprint" class="w-9 h-9"></i>
          </div>
          <p class="text-sm font-bold text-slate-700 dark:text-slate-200">ابصم للدخول إلى سجلك الخاص وكلمات سرك</p>
          <button type="button" id="btn-unlock-vault" class="px-6 py-3 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition inline-flex items-center gap-2">
            <i data-lucide="fingerprint" class="w-4 h-4"></i>
            <span>ابصم للدخول</span>
          </button>
        </div>
        <div id="aman-vault-body" class="hidden space-y-5"></div>
      </div>`;
    main.appendChild(sec);

    function showVaultLock() {
      document.getElementById('aman-vault-lock').classList.remove('hidden');
      document.getElementById('aman-vault-body').classList.add('hidden');
      document.getElementById('btn-lock-vault').classList.add('hidden');
    }

    async function unlockVaultFlow() {
      const ok = await verifyBiometric('ابصم للدخول إلى عملياتي وسجلي الخاص');
      if (!ok) return;
      await flushPendingToVault();
      const v = await readVault();
      document.getElementById('aman-vault-lock').classList.add('hidden');
      document.getElementById('aman-vault-body').classList.remove('hidden');
      document.getElementById('btn-lock-vault').classList.remove('hidden');
      renderVaultHistory(v);
    }

    navBtn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b === navBtn));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'panel-my-vault'));
      const pt = document.getElementById('page-title');
      if (pt) pt.textContent = 'عملياتي وسجلي الخاص';
      const sb = document.getElementById('sidebar');
      const bd = document.getElementById('sidebar-backdrop');
      if (sb && window.innerWidth < 1024) sb.classList.add(document.documentElement.dir === 'rtl' ? 'translate-x-full' : '-translate-x-full');
      if (bd) bd.classList.add('hidden');
      showVaultLock();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.getElementById('btn-unlock-vault').addEventListener('click', unlockVaultFlow);
    document.getElementById('btn-lock-vault').addEventListener('click', showVaultLock);

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  window.addEventListener('load', () => setTimeout(initBioVault, 220));
})();
