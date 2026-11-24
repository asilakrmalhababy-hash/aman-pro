(function () {
  function initStego() {
    const main = document.querySelector('main');
    const navTools = document.querySelector('#sidebar nav > div:last-child');
    if (!main || !navTools || document.getElementById('panel-stego')) return;

    const btn = document.createElement('button');
    btn.type = 'button'; btn.setAttribute('data-tab', 'stego');
    btn.className = 'nav-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition';
    btn.innerHTML = '<i data-lucide="eye-off" class="w-4 h-4 shrink-0"></i><span>إخفاء نص في صورة</span>';
    navTools.appendChild(btn);

    const sec = document.createElement('section');
    sec.id = 'panel-stego'; sec.className = 'tab-panel hidden fade-in space-y-5';
    sec.innerHTML = `
      <div class="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 max-w-2xl mx-auto">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">إخفاء رسالة سرية داخل صورة</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">تُخفى رسالتك داخل بكسلات الصورة بدون ما يتغير شكلها أبداً للعين (محلي 100%).</p>
          </div>
          <div class="flex rounded-xl bg-slate-100 dark:bg-slate-950 p-1 border border-slate-200 dark:border-slate-800 text-xs shrink-0">
            <button type="button" id="stego-tab-hide" class="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 font-bold transition">إخفاء نص</button>
            <button type="button" id="stego-tab-read" class="px-3 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 transition">استخراج نص</button>
          </div>
        </div>
        <div id="stego-drop" class="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 rounded-2xl p-6 text-center cursor-pointer transition bg-slate-50/70 dark:bg-slate-950/40">
          <input id="stego-file" type="file" accept="image/*,.amanimg" class="hidden" />
          <img id="stego-preview" class="hidden max-h-40 mx-auto rounded-xl mb-3 shadow-sm object-contain" alt="Preview" />
          <p id="stego-file-lbl" class="text-sm font-bold text-slate-800 dark:text-white">اضغط لاختيار صورة أو ملف سري (.amanimg)</p>
          <p class="text-[11px] text-slate-400 mt-1">عند إرسال الصورة في واتساب أرسلها كـ "مستند / Document" حتى لا يضغطها التطبيق.</p>
        </div>
        <div id="stego-hide-box" class="space-y-3">
          <textarea id="stego-msg" rows="3" placeholder="اكتب الرسالة السرية اللي تشتي تخفيها داخل الصورة..." class="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"></textarea>
          <input id="stego-pass-hide" type="password" placeholder="كلمة سر اختيارية لقفل الرسالة (أو اتركها فارغة)" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm" />
          <button id="btn-stego-hide" type="button" class="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition">إخفاء الرسالة وتجهيز الصورة</button>
          <div id="stego-dl-wrap" class="hidden p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-center space-y-2.5 fade-in">
            <div class="text-xs font-bold text-emerald-700 dark:text-emerald-300">تم إخفاء الرسالة بنجاح داخل الصورة!</div>
            <a id="stego-dl-btn" download="aman-pro-secret.png" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition">تحميل الصورة السرية (PNG خفيفة)</a>
          </div>
        </div>
        <div id="stego-read-box" class="hidden space-y-3">
          <input id="stego-pass-read" type="password" placeholder="كلمة السر (إذا كانت الرسالة مقفلة)" class="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm" />
          <button id="btn-stego-read" type="button" class="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition">استخراج الرسالة المخفية</button>
          <div id="stego-out-wrap" class="hidden p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 fade-in">
            <div class="text-xs font-bold text-teal-600 dark:text-teal-400">الرسالة المخفية داخل الصورة:</div>
            <div id="stego-out-txt" class="text-sm text-slate-900 dark:text-white whitespace-pre-wrap break-words"></div>
          </div>
        </div>
        <canvas id="stego-canvas" class="hidden"></canvas>
      </div>`;
    main.appendChild(sec);

    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'panel-stego'));
      const pt = document.getElementById('page-title'); if (pt) pt.textContent = 'إخفاء نص في صورة';
      const sb = document.getElementById('sidebar'), bd = document.getElementById('sidebar-backdrop');
      if (sb && window.innerWidth < 1024) sb.classList.add(document.documentElement.dir === 'rtl' ? 'translate-x-full' : '-translate-x-full');
      if (bd) bd.classList.add('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    const tH = document.getElementById('stego-tab-hide'), tR = document.getElementById('stego-tab-read');
    const bH = document.getElementById('stego-hide-box'), bR = document.getElementById('stego-read-box');
    const on = 'px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 font-bold transition';
    const off = 'px-3 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 transition';
    tH.addEventListener('click', () => { tH.className = on; tR.className = off; bH.classList.remove('hidden'); bR.classList.add('hidden'); });
    tR.addEventListener('click', () => { tR.className = on; tH.className = off; bR.classList.remove('hidden'); bH.classList.add('hidden'); });

    let loadedImg = null;
    const drop = document.getElementById('stego-drop'), inp = document.getElementById('stego-file');
    drop.addEventListener('click', () => inp.click());
    inp.addEventListener('change', () => {
      const f = inp.files[0]; if (!f) return;
      const blobUrl = URL.createObjectURL(f.name.endsWith('.amanimg') ? new Blob([f], {type:'image/png'}) : f);
      const img = new Image();
      img.onload = () => { loadedImg = img; const pv = document.getElementById('stego-preview'); pv.src = blobUrl; pv.classList.remove('hidden'); document.getElementById('stego-file-lbl').textContent = `${f.name} (${img.width}×${img.height})`; };
      img.src = blobUrl;
    });

    async function deriveKey(pass, salt) {
      const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }

    document.getElementById('btn-stego-hide').addEventListener('click', async () => {
      const msg = document.getElementById('stego-msg').value, pass = document.getElementById('stego-pass-hide').value;
      if (!loadedImg || !msg) return;
      const c = document.getElementById('stego-canvas'); const sc = Math.min(1, 720 / Math.max(loadedImg.width, loadedImg.height)); c.width = Math.round(loadedImg.width * sc); c.height = Math.round(loadedImg.height * sc);
      const ctx = c.getContext('2d'); ctx.drawImage(loadedImg, 0, 0, c.width, c.height);
      const imgData = ctx.getImageData(0, 0, c.width, c.height), d = imgData.data;
      let body = new TextEncoder().encode(msg), flag = 0;
      if (pass) {
        flag = 1; const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(pass, salt), enc = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, body));
        const comb = new Uint8Array(28 + enc.length); comb.set(salt, 0); comb.set(iv, 16); comb.set(enc, 28); body = comb;
      }
      const full = new Uint8Array(9 + body.length); full.set([65, 77, 78, 49, flag], 0);
      new DataView(full.buffer).setUint32(5, body.length); full.set(body, 9);
      const totalBits = full.length * 8; if (totalBits > Math.floor((d.length / 4) * 3)) return;
      let bitIdx = 0;
      for (let i = 0; i < d.length && bitIdx < totalBits; i += 4)
        for (let ch = 0; ch < 3 && bitIdx < totalBits; ch++) { d[i + ch] = (d[i + ch] & 0xFE) | ((full[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1); bitIdx++; }
      ctx.putImageData(imgData, 0, 0);
      document.getElementById('stego-dl-btn').href = c.toDataURL('image/png');
      document.getElementById('stego-dl-wrap').classList.remove('hidden');
    });

    document.getElementById('btn-stego-read').addEventListener('click', async () => {
      if (!loadedImg) return;
      const c = document.getElementById('stego-canvas'); c.width = loadedImg.width; c.height = loadedImg.height;
      const ctx = c.getContext('2d'); ctx.drawImage(loadedImg, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const readB = (cnt, off = 0) => {
        const out = new Uint8Array(cnt); let sB = off * 8, eB = sB + cnt * 8, idx = 0;
        for (let i = 0; i < d.length && idx < eB; i += 4)
          for (let ch = 0; ch < 3 && idx < eB; ch++) { if (idx >= sB) { const r = idx - sB; out[r >> 3] = (out[r >> 3] << 1) | (d[i + ch] & 1); } idx++; }
        return out;
      };
      const hdr = readB(9, 0), wrap = document.getElementById('stego-out-wrap'), txt = document.getElementById('stego-out-txt');
      wrap.classList.remove('hidden');
      if (hdr[0] !== 65 || hdr[1] !== 77 || hdr[2] !== 78 || hdr[3] !== 49) { txt.textContent = 'لم يتم العثور على رسالة سرية داخل هذه الصورة.'; return; }
      const flag = hdr[4], len = new DataView(hdr.buffer).getUint32(5), pay = readB(len, 9);
      try {
        if (flag === 1) {
          const pass = document.getElementById('stego-pass-read').value; if (!pass) { txt.textContent = 'هذه الصورة مقفلة بكلمة سر — أدخل كلمة السر أولاً.'; return; }
          const key = await deriveKey(pass, pay.slice(0, 16));
          txt.textContent = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: pay.slice(16, 28) }, key, pay.slice(28)));
        } else txt.textContent = new TextDecoder().decode(pay);
      } catch (e) { txt.textContent = 'كلمة السر غير صحيحة أو الصورة تعرضت للضغط.'; }
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initStego); else initStego();
})();
