(function () {
  const CRED_KEY = 'aman_bio_cred_id';
  const VAULT_KEY = 'aman_bio_vault_enc';
  const SALT_KEY = 'aman_bio_vault_salt';
  const META_KEY = 'aman_bio_vault_meta';
  let sessionUnlocked = false;
  let cachedCryptoKey = null;

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
    if (!window.PublicKeyCredential || !navigator.credentials) {
      return askFallbackPin(reasonText);
    }
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
    } catch (e) {
      return askFallbackPin(reasonText);
    }
  }

  function askFallbackPin(reasonText) {
    const saved = localStorage.getItem('aman_bio_pin_hash');
    const msg = saved
      ? `${reasonText}\nأدخل رمز الخزنة الاحتياطي (4+ خانات):`
      : 'المتصفح لم يدعم البصمة هنا (تأكد من HTTPS). أنشئ رمز خزنة احتياطي (4+ خانات):';
    const pin = prompt(msg);
    if (!pin || pin.trim().length < 4) return false;
    const p = pin.trim();
    if (!saved) {
      localStorage.setItem('aman_bio_pin_hash', btoa(p));
      return getVaultKey(p).then(() => true);
    }
    if (btoa(p) !== saved) {
      alert('الرمز غير صحيح!');
      return false;
    }
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
    } catch (_) {
      return { passwords: [], history: [] };
    }
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
    localStorage.setItem(META_KEY, JSON.stringify({
      pwCount: (data.passwords || []).length,
      histCount: (data.history || []).length
    }));
    renderMaskedChips();
  }

  async function saveOperationToVault(typeLabel, contentPreview, passwordUsed) {
    try {
      const credId = localStorage.getItem(CRED_KEY);
      if (!credId && !cachedCryptoKey) {
        let q = JSON.parse(sessionStorage.getItem('aman_pending_ops') || '[]');
        q.unshift({
          type: typeLabel,
          preview: String(contentPreview || '').slice(0, 140),
          pw: passwordUsed || '',
          time: new Date().toLocaleString('ar-YE')
        });
        sessionStorage.setItem('aman_pending_ops', JSON.stringify(q.slice(0, 20)));
        renderMaskedChips();
        return;
      }
      await getVaultKey(credId);
      const v = await readVault();
      if (passwordUsed && !v.passwords.includes(passwordUsed)) {
        v.passwords.unshift(passwordUsed);
        v.passwords = v.passwords.slice(0, 8);
      }
      v.history.unshift({
        type: typeLabel,
        preview: String(contentPreview || '').slice(0, 140),
        pw: passwordUsed ? '••••••' : '',
        time: new Date().toLocaleString('ar-YE')
      });
      v.history = v.history.slice(0, 40);
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
        if (op.pw && !v.passwords.includes(op.pw)) v.passwords.unshift(op.pw);
        v.history.unshift({ type: op.type, preview: op.preview, pw: op.pw ? '••••••' : '', time: op.time });
      });
      v.passwords = v.passwords.slice(0, 8);
      v.history = v.history.slice(0, 40);
      await writeVault(v);
      sessionStorage.removeItem('aman_pending_ops');
    } catch (_) {}
  }

  function getChipCount() {
    try {
      const meta = JSON.parse(localStorage.getItem(META_KEY) || '{}');
      const pend = JSON.parse(sessionStorage.getItem('aman_pending_ops') || '[]').filter(x => x.pw);
      const uniquePend = new Set(pend.map(x => x.pw)).size;
      return Math.max(meta.pwCount || 0, uniquePend);
    } catch (_) { return 0; }
  }

  function renderMaskedChips() {
    const box = document.getElementById('aman-saved-pw-chips');
    if (!box) return;
    const count = getChipCount();
    const isEn = document.documentElement.lang === 'en' || document.documentElement.dir === 'ltr';
    if (!count) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    box.classList.remove('hidden');
    let html = `<span class="text-[11px] text-slate-400 shrink-0">${isEn ? 'Saved:' : 'محفوظة:'}</span>`;
    for (let i = 0; i < Math.min(count, 5); i++) {
      html += `<button type="button" data-pw-idx="${i}" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-teal-500/10 text-teal-600 dark:text-teal-300 border border-teal-500/20 hover:bg-teal-500/20 transition" title="${isEn ? 'Verify fingerprint to fill' : 'ابصم لتعبئة كلمة السر'}"><span>🔐</span><span class="tracking-widest">••••••</span></button>`;
    }
    box.innerHTML = html;

    box.querySelectorAll('[data-pw-idx]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.getAttribute('data-pw-idx'), 10);
        const ok = await verifyBiometric(isEn ? 'Verify fingerprint to fill saved password' : 'ابصم لاستخدام كلمة السر المحفوظة');
        if (!ok) return;
        await flushPendingToVault();
        const v = await readVault();
        const pw = (v.passwords || [])[idx];
        const passInp = document.querySelector('#panel-crypto input[type="password"]') || document.querySelector('#panel-crypto input');
        if (pw && passInp) {
          passInp.value = pw;
          passInp.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });
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
              <span>🔑</span><span class="mono">${pw.slice(0, 2)}••••••</span><span class="text-[10px] opacity-70">(${isEn ? 'Copy' : 'نسخ'})</span>
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
          <span class="text-xs font-bold text-slate-500 dark:text-slate-400">${isEn ? 'Recent Operations' : 'سجل العمليات السابقة'}</span>
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

  function initBioVault() {
    const main = document.querySelector('main');
    const navRoot = document.querySelector('#sidebar nav');
    if (!main || !navRoot || document.getElementById('panel-my-vault')) return;

    const cryptoPanel = document.getElementById('panel-crypto');
    if (cryptoPanel) {
      const passInp = cryptoPanel.querySelector('input[type="password"]') ||
        Array.from(cryptoPanel.querySelectorAll('input')).find(i => (i.placeholder || '').includes('كلمة'));
      if (passInp && !document.getElementById('aman-saved-pw-chips')) {
        const chipsBox = document.createElement('div');
        chipsBox.id = 'aman-saved-pw-chips';
        chipsBox.className = 'hidden flex flex-wrap items-center gap-1.5 mt-2 px-1';
        passInp.parentNode.insertBefore(chipsBox, passInp.nextSibling);
        renderMaskedChips();
      }

      cryptoPanel.querySelectorAll('button').forEach(btn => {
        const tx = (btn.textContent || '').trim();
        if (tx.includes('تشفير') || tx.toLowerCase().includes('encrypt') || tx.toLowerCase().includes('decrypt')) {
          btn.addEventListener('click', () => {
            const ta = cryptoPanel.querySelector('textarea');
            const pInp = cryptoPanel.querySelector('input[type="password"]') ||
              Array.from(cryptoPanel.querySelectorAll('input')).find(i => (i.placeholder || '').includes('كلمة'));
            if (ta && ta.value.trim()) {
              saveOperationToVault(tx, ta.value.trim(), pInp ? pInp.value : '');
            }
          });
        }
      });
    }

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
      sessionUnlocked = false;
      document.getElementById('aman-vault-lock').classList.remove('hidden');
      document.getElementById('aman-vault-body').classList.add('hidden');
      document.getElementById('btn-lock-vault').classList.add('hidden');
    }

    async function unlockVaultFlow() {
      const ok = await verifyBiometric('ابصم للدخول إلى عملياتي وسجلي الخاص');
      if (!ok) return;
      sessionUnlocked = true;
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

  window.addEventListener('load', () => setTimeout(initBioVault, 150));
})();
