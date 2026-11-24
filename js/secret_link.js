(function () {
  async function deriveKey(pass, salt) {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  function b64uEnc(bytes) { let b = ''; bytes.forEach(x => { b += String.fromCharCode(x); }); return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64uDec(str) { const n = str.replace(/-/g, '+').replace(/_/g, '/'), b = atob(n + '='.repeat((4 - n.length % 4) % 4)), o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }

  function initSecretLink() {
    const main = document.querySelector('main');
    const navTools = document.querySelector('#sidebar nav > div:last-child');
    if (!main || !navTools || document.getElementById('panel-secretlink')) return;

    const btn = document.createElement('button');
    btn.type = 'button'; btn.setAttribute('data-tab', 'secretlink');
    btn.className = 'nav-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition';
    btn.innerHTML = '<i data-lucide="send" class="w-4 h-4 shrink-0"></i><span>رابط رسالة سرية</span>';
    navTools.appendChild(btn);

    const sec = document.createElement('section');
    sec.id = 'panel-secretlink'; sec.className = 'tab-panel hidden fade-in space-y-5';
    sec.innerHTML = `
      <div class="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 max-w-2xl mx-auto">
        <div>
          <h2 class="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">إنشاء رابط رسالة سرية (بدون سيرفر)</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">تُشفّر رسالتك بـ AES-256 داخل الرابط نفسه بعد علامة #، يعني حتى السيرفر ما يقدر يقرأها.</p>
        </div>
        <textarea id="sl-msg" rows="4" placeholder="اكتب رسالتك السرية هنا..." class="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"></textarea>
        <input id="sl-pass" type="password" placeholder="كلمة السر اللي بتعطيها للمستلم..." class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm" />
        <button id="btn-sl-create" type="button" class="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition">توليد الرابط السري المشفر</button>
        <div id="sl-out-wrap" class="hidden p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 fade-in">
          <div class="text-xs font-bold text-emerald-600 dark:text-emerald-400">رابطك السري جاهز للمشاركة:</div>
          <div id="sl-out-url" class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] mono break-all max-h-28 overflow-y-auto" dir="ltr"></div>
          <div class="grid grid-cols-2 gap-2.5">
            <button id="btn-sl-copy" type="button" class="py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition">نسخ الرابط</button>
            <a id="btn-sl-wa" target="_blank" rel="noopener noreferrer" class="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs text-center transition">مشاركة في واتساب</a>
          </div>
        </div>
      </div>`;
    main.appendChild(sec);

    const modal = document.createElement('div');
    modal.id = 'sl-unlock-modal';
    modal.className = 'fixed inset-0 z-50 hidden items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm fade-in';
    modal.innerHTML = `
      <div class="w-full max-w-md bg-white dark:bg-[#0e211d] border border-slate-200 dark:border-teal-500/25 rounded-3xl p-6 space-y-4 shadow-2xl">
        <div class="flex items-center justify-between"><h3 class="text-base font-extrabold text-slate-900 dark:text-white">لديك رسالة سرية مشفرة</h3><button id="sl-modal-close" type="button" class="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button></div>
        <p class="text-xs text-slate-500 dark:text-slate-400">أدخل كلمة السر لفك تشفير الرسالة محلياً:</p>
        <input id="sl-unlock-pass" type="password" placeholder="كلمة السر..." class="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm" />
        <button id="btn-sl-unlock" type="button" class="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition">فتح الرسالة الآن</button>
        <div id="sl-unlocked-box" class="hidden p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-sm text-slate-900 dark:text-white whitespace-pre-wrap break-words"></div>
      </div>`;
    document.body.appendChild(modal);

    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'panel-secretlink'));
      const pt = document.getElementById('page-title'); if (pt) pt.textContent = 'رابط رسالة سرية';
      const sb = document.getElementById('sidebar'), bd = document.getElementById('sidebar-backdrop');
      if (sb && window.innerWidth < 1024) sb.classList.add(document.documentElement.dir === 'rtl' ? 'translate-x-full' : '-translate-x-full');
      if (bd) bd.classList.add('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.getElementById('btn-sl-create').addEventListener('click', async () => {
      const msg = document.getElementById('sl-msg').value.trim(), pass = document.getElementById('sl-pass').value;
      if (!msg || !pass) return;
      const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey(pass, salt), enc = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(msg)));
      const comb = new Uint8Array(28 + enc.length); comb.set(salt, 0); comb.set(iv, 16); comb.set(enc, 28);
      const url = `${location.origin}${location.pathname}#secret=${b64uEnc(comb)}`;
      document.getElementById('sl-out-url').textContent = url;
      document.getElementById('btn-sl-wa').href = `https://wa.me/?text=${encodeURIComponent('أرسلت لك رسالة سرية مشفرة عبر أمان Pro:\n' + url)}`;
      document.getElementById('sl-out-wrap').classList.remove('hidden');
    });

    document.getElementById('btn-sl-copy').addEventListener('click', () => {
      const u = document.getElementById('sl-out-url').textContent;
      if (navigator.clipboard) navigator.clipboard.writeText(u);
    });

    function checkHash() { if (!location.hash.startsWith('#secret=')) return; modal.classList.remove('hidden'); modal.classList.add('flex'); document.getElementById('sl-unlocked-box').classList.add('hidden'); }
    document.getElementById('sl-modal-close').addEventListener('click', () => { modal.classList.add('hidden'); modal.classList.remove('flex'); history.replaceState(null, '', location.pathname); });
    document.getElementById('btn-sl-unlock').addEventListener('click', async () => {
      const pass = document.getElementById('sl-unlock-pass').value, box = document.getElementById('sl-unlocked-box');
      if (!pass || !location.hash.startsWith('#secret=')) return;
      try {
        const raw = b64uDec(location.hash.slice('#secret='.length)), key = await deriveKey(pass, raw.slice(0, 16));
        box.textContent = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(16, 28) }, key, raw.slice(28)));
        box.classList.remove('hidden');
      } catch (e) { box.textContent = 'كلمة السر غير صحيحة أو الرابط ناقص.'; box.classList.remove('hidden'); }
    });
    window.addEventListener('hashchange', checkHash); checkHash();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSecretLink); else initSecretLink();
})();
