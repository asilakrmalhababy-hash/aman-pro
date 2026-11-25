(function () {
  const PREFIX = 'AMANIMG1:';

  function bufToB64u(buf) {
    const arr = new Uint8Array(buf);
    let bin = '';
    const chunk = 8192;
    for (let i = 0; i < arr.length; i += chunk) {
      bin += String.fromCharCode.apply(null, arr.subarray(i, i + chunk));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64uToBuf(b64u) {
    const clean = b64u.trim().replace(/\s+/g, '');
    const pad = '='.repeat((4 - (clean.length % 4)) % 4);
    const b64 = (clean + pad).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  async function deriveAesKey(pass, salt, usage) {
    const enc = new TextEncoder();
    const km = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      km,
      { name: 'AES-GCM', length: 256 },
      false,
      [usage]
    );
  }

  function compressImageToTargetBytes(img, targetMaxBytes) {
    return new Promise(resolve => {
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      const presets = targetMaxBytes <= 3500
        ? [
            { maxDim: 260, q: 0.48 },
            { maxDim: 220, q: 0.40 },
            { maxDim: 180, q: 0.34 },
            { maxDim: 150, q: 0.28 }
          ]
        : [
            { maxDim: 520, q: 0.62 },
            { maxDim: 420, q: 0.52 },
            { maxDim: 340, q: 0.45 }
          ];

      let idx = 0;
      function tryNext() {
        const p = presets[idx];
        const scale = Math.min(1, p.maxDim / Math.max(img.width, img.height));
        c.width = Math.max(40, Math.round(img.width * scale));
        c.height = Math.max(40, Math.round(img.height * scale));
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);

        c.toBlob(blob => {
          if (!blob) {
            c.toBlob(jblob => jblob.arrayBuffer().then(ab => resolve({ bytes: new Uint8Array(ab), mime: 'image/jpeg' })), 'image/jpeg', p.q);
            return;
          }
          if (blob.size <= targetMaxBytes || idx === presets.length - 1) {
            blob.arrayBuffer().then(ab => resolve({ bytes: new Uint8Array(ab), mime: blob.type || 'image/webp' }));
          } else {
            idx++;
            tryNext();
          }
        }, 'image/webp', p.q);
      }
      tryNext();
    });
  }

  function initImgTextCrypto() {
    const cryptoPanel = document.getElementById('panel-crypto');
    if (!cryptoPanel || document.getElementById('aman-imgtxt-card')) return;

    const card = document.createElement('div');
    card.id = 'aman-imgtxt-card';
    card.className = 'bg-white dark:bg-[#0B1E1A] rounded-3xl border border-slate-200 dark:border-teal-900/60 p-5 sm:p-6 space-y-4 shadow-sm max-w-2xl mx-auto mt-5';
    card.innerHTML = `
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 class="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">تشفير الصورة كنص مضغوط (إرسال واتساب كنص)</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">يحوّل صورتك إلى كود نصي مشفّر بـ AES-256 ترسله لصديقك كرسالة عادية ويفكّه لصورة!</p>
        </div>
        <div class="flex p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold">
          <button type="button" id="itx-m-enc" class="px-3 py-1.5 rounded-lg bg-teal-600 text-white transition">صورة ← نص</button>
          <button type="button" id="itx-m-dec" class="px-3 py-1.5 rounded-lg text-slate-500 transition">نص ← صورة</button>
        </div>
      </div>

      <div id="itx-enc-box" class="space-y-3">
        <div id="itx-drop" class="border-2 border-dashed border-slate-300 dark:border-teal-900/60 hover:border-teal-500 rounded-2xl p-5 text-center cursor-pointer transition bg-slate-50/70 dark:bg-slate-950/40">
          <input id="itx-file" type="file" accept="image/*" class="hidden" />
          <img id="itx-prev" class="hidden max-h-36 mx-auto rounded-xl mb-2 object-contain" alt="Preview" />
          <p id="itx-lbl" class="text-xs sm:text-sm font-bold text-slate-800 dark:text-white">اضغط لاختيار صورة لتحويلها لنص مشفّر</p>
        </div>
        <div class="grid grid-cols-2 gap-2 text-xs font-bold">
          <button type="button" id="itx-q-compact" class="p-2.5 rounded-xl border border-teal-500 bg-teal-500/15 text-teal-600 dark:text-teal-300 transition">مضغوط جداً (~2500 حرف)</button>
          <button type="button" id="itx-q-clear" class="p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-500 transition">جودة أعلى (~8000 حرف)</button>
        </div>
        <input id="itx-pass-e" type="password" class="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm outline-none focus:border-teal-500" placeholder="كلمة سر لتشفير الصورة..." />
        <button type="button" id="itx-btn-enc" class="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition">تشفير وتحويل الصورة إلى نص</button>
      </div>

      <div id="itx-dec-box" class="hidden space-y-3">
        <textarea id="itx-code-in" rows="4" dir="ltr" class="w-full p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs mono outline-none focus:border-teal-500" placeholder="الصق الكود المشفّر الذي يبدأ بـ AMANIMG1:... هنا"></textarea>
        <input id="itx-pass-d" type="password" class="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm outline-none focus:border-teal-500" placeholder="كلمة السر لفك الصورة..." />
        <button type="button" id="itx-btn-dec" class="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition">فك التشفير وعرض الصورة</button>
      </div>

      <div id="itx-out" class="hidden p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 fade-in"></div>
    `;
    cryptoPanel.appendChild(card);

    let loadedImg = null;
    let targetBytes = 2400;

    const mEnc = document.getElementById('itx-m-enc'), mDec = document.getElementById('itx-m-dec');
    const bEnc = document.getElementById('itx-enc-box'), bDec = document.getElementById('itx-dec-box');
    const qC = document.getElementById('itx-q-compact'), qH = document.getElementById('itx-q-clear');
    const out = document.getElementById('itx-out');

    mEnc.onclick = () => {
      mEnc.className = 'px-3 py-1.5 rounded-lg bg-teal-600 text-white transition';
      mDec.className = 'px-3 py-1.5 rounded-lg text-slate-500 transition';
      bEnc.classList.remove('hidden'); bDec.classList.add('hidden'); out.classList.add('hidden');
    };
    mDec.onclick = () => {
      mDec.className = 'px-3 py-1.5 rounded-lg bg-teal-600 text-white transition';
      mEnc.className = 'px-3 py-1.5 rounded-lg text-slate-500 transition';
      bDec.classList.remove('hidden'); bEnc.classList.add('hidden'); out.classList.add('hidden');
    };
    qC.onclick = () => {
      targetBytes = 2400;
      qC.className = 'p-2.5 rounded-xl border border-teal-500 bg-teal-500/15 text-teal-600 dark:text-teal-300 transition';
      qH.className = 'p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-500 transition';
    };
    qH.onclick = () => {
      targetBytes = 7500;
      qH.className = 'p-2.5 rounded-xl border border-teal-500 bg-teal-500/15 text-teal-600 dark:text-teal-300 transition';
      qC.className = 'p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-500 transition';
    };

    const drop = document.getElementById('itx-drop'), fi = document.getElementById('itx-file');
    drop.onclick = () => fi.click();
    fi.onchange = () => {
      const f = fi.files && fi.files[0]; if (!f) return;
      const url = URL.createObjectURL(f), img = new Image();
      img.onload = () => {
        loadedImg = img;
        const pv = document.getElementById('itx-prev'); pv.src = url; pv.classList.remove('hidden');
        document.getElementById('itx-lbl').textContent = `${f.name.slice(0, 26)} (${img.width}×${img.height})`;
        out.classList.add('hidden');
      };
      img.src = url;
    };

    document.getElementById('itx-btn-enc').onclick = async () => {
      out.classList.remove('hidden');
      if (!loadedImg) { out.innerHTML = '<p class="text-xs text-rose-500 font-bold">اختر صورة أولاً.</p>'; return; }
      const pass = document.getElementById('itx-pass-e').value;
      if (!pass) { out.innerHTML = '<p class="text-xs text-rose-500 font-bold">أدخل كلمة سر لتشفير الصورة.</p>'; return; }
      out.innerHTML = '<p class="text-xs text-teal-500 font-bold">جاري ضغط الصورة وتشفيرها إلى نص...</p>';
      try {
        const { bytes, mime } = await compressImageToTargetBytes(loadedImg, targetBytes);
        const mimeTag = mime.includes('webp') ? 1 : 0;
        const plain = new Uint8Array(1 + bytes.length);
        plain[0] = mimeTag;
        plain.set(bytes, 1);

        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveAesKey(pass, salt, 'encrypt');
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
        const pkt = new Uint8Array(28 + ct.length);
        pkt.set(salt, 0); pkt.set(iv, 16); pkt.set(ct, 28);
        const codeStr = PREFIX + bufToB64u(pkt.buffer);

        out.innerHTML = `
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-bold text-emerald-500">✓ تم التحويل والتشفير بنجاح!</span>
            <span class="text-[11px] font-bold text-teal-400 mono">${codeStr.length.toLocaleString()} حرف</span>
          </div>
          <textarea id="itx-res-txt" rows="3" readonly dir="ltr" class="w-full p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] mono">${codeStr}</textarea>
          <div class="flex gap-2">
            <button type="button" id="itx-copy-btn" class="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition">📋 نسخ النص المشفّر</button>
            <a href="https://wa.me/?text=${encodeURIComponent(codeStr)}" target="_blank" rel="noopener" class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition">واتساب</a>
          </div>`;

        document.getElementById('itx-copy-btn').onclick = async function () {
          try { await navigator.clipboard.writeText(codeStr); } catch (_) {}
          this.textContent = '✓ تم النسخ للحافظة!';
          setTimeout(() => { this.textContent = '📋 نسخ النص المشفّر'; }, 2500);
        };
      } catch (e) {
        out.innerHTML = `<p class="text-xs text-rose-500 font-bold">خطأ: ${e.message}</p>`;
      }
    };

    document.getElementById('itx-btn-dec').onclick = async () => {
      out.classList.remove('hidden');
      const raw = (document.getElementById('itx-code-in').value || '').trim();
      const pass = document.getElementById('itx-pass-d').value;
      if (!raw.startsWith(PREFIX)) {
        out.innerHTML = '<p class="text-xs text-rose-500 font-bold">النص غير صالح — يجب أن يبدأ بـ AMANIMG1:</p>';
        return;
      }
      if (!pass) { out.innerHTML = '<p class="text-xs text-rose-500 font-bold">أدخل كلمة السر لفك الصورة.</p>'; return; }
      try {
        const pkt = b64uToBuf(raw.slice(PREFIX.length));
        const salt = pkt.slice(0, 16), iv = pkt.slice(16, 28), ct = pkt.slice(28);
        const key = await deriveAesKey(pass, salt, 'decrypt');
        const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
        const mime = plain[0] === 1 ? 'image/webp' : 'image/jpeg';
        const ext = plain[0] === 1 ? 'webp' : 'jpg';
        const blob = new Blob([plain.slice(1)], { type: mime });
        const url = URL.createObjectURL(blob);
        out.innerHTML = `
          <div class="text-xs font-bold text-emerald-500 text-center">✓ تم فك تشفير الصورة بنجاح!</div>
          <img src="${url}" class="max-h-72 mx-auto rounded-2xl shadow-md object-contain" alt="Decrypted Image" />
          <div class="text-center">
            <a href="${url}" download="aman-decrypted.${ext}" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition">⬇ تحميل الصورة</a>
          </div>`;
      } catch (_) {
        out.innerHTML = '<p class="text-xs text-rose-500 font-bold">كلمة السر غير صحيحة أو الكود ناقص!</p>';
      }
    };
  }

  window.addEventListener('load', () => setTimeout(initImgTextCrypto, 180));
})();
