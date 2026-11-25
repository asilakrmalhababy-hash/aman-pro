(function () {
  const MAGIC = [0x41, 0x4D, 0x32];
  const TARGET_W = 1024;
  const BLOCK = 8;
  const STRENGTH = 14;

  async function aesEncryptText(text, pass) {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const keyMat = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMat, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
    );
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text)));
    const out = new Uint8Array(28 + ct.length);
    out.set(salt, 0); out.set(iv, 16); out.set(ct, 28);
    return out;
  }

  async function aesDecryptBytes(buf, pass) {
    const salt = buf.slice(0, 16), iv = buf.slice(16, 28), ct = buf.slice(28);
    const enc = new TextEncoder();
    const keyMat = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMat, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
  }

  function bytesToBits(bytes) {
    const bits = [];
    for (let i = 0; i < bytes.length; i++) {
      for (let b = 7; b >= 0; b--) bits.push((bytes[i] >> b) & 1);
    }
    return bits;
  }

  function bitsToBytes(bits) {
    const out = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < out.length; i++) {
      let val = 0;
      for (let b = 0; b < 8; b++) val = (val << 1) | (bits[i * 8 + b] & 1);
      out[i] = val;
    }
    return out;
  }

  function blockAvgLuma(data, w, bx, by) {
    let sum = 0;
    const x0 = bx * BLOCK, y0 = by * BLOCK;
    for (let dy = 0; dy < BLOCK; dy++) {
      let row = ((y0 + dy) * w + x0) * 4;
      for (let dx = 0; dx < BLOCK; dx++) {
        const idx = row + dx * 4;
        sum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      }
    }
    return sum / (BLOCK * BLOCK);
  }

  function shiftBlock(data, w, bx, by, delta) {
    const x0 = bx * BLOCK, y0 = by * BLOCK;
    for (let dy = 0; dy < BLOCK; dy++) {
      let row = ((y0 + dy) * w + x0) * 4;
      for (let dx = 0; dx < BLOCK; dx++) {
        const idx = row + dx * 4;
        data[idx] = Math.max(0, Math.min(255, Math.round(data[idx] + delta)));
        data[idx + 1] = Math.max(0, Math.min(255, Math.round(data[idx + 1] + delta)));
        data[idx + 2] = Math.max(0, Math.min(255, Math.round(data[idx + 2] + delta)));
      }
    }
  }

  function embedBits(imgData, rawBytes) {
    const w = imgData.width, h = imgData.height, d = imgData.data;
    const cols = Math.floor(w / BLOCK), rows = Math.floor(h / BLOCK);
    const totalPairs = Math.floor((cols * rows) / 2);
    const rawBits = bytesToBits(rawBytes);
    const repBits = [];
    for (let i = 0; i < rawBits.length; i++) {
      repBits.push(rawBits[i], rawBits[i], rawBits[i]);
    }
    if (repBits.length > totalPairs) {
      throw new Error(`النص طويل جداً لهذه الصورة! الحد الأقصى التقريبي ${Math.floor(totalPairs / 24) - 6} بايت.`);
    }
    for (let p = 0; p < repBits.length; p++) {
      const bit = repBits[p];
      const iA = p * 2, iB = p * 2 + 1;
      const ax = iA % cols, ay = Math.floor(iA / cols);
      const bx = iB % cols, by = Math.floor(iB / cols);
      const avgA = blockAvgLuma(d, w, ax, ay);
      const avgB = blockAvgLuma(d, w, bx, by);
      const diff = avgA - avgB;
      const target = bit === 1 ? STRENGTH * 2 : -STRENGTH * 2;
      const need = (target - diff) / 2;
      const clamped = Math.max(-28, Math.min(28, need));
      shiftBlock(d, w, ax, ay, clamped);
      shiftBlock(d, w, bx, by, -clamped);
    }
    return imgData;
  }

  function extractBytes(imgData) {
    const w = imgData.width, h = imgData.height, d = imgData.data;
    const cols = Math.floor(w / BLOCK), rows = Math.floor(h / BLOCK);
    const totalPairs = Math.floor((cols * rows) / 2);

    function readBit(bitIndex) {
      let ones = 0;
      for (let r = 0; r < 3; r++) {
        const p = bitIndex * 3 + r;
        if (p >= totalPairs) return 0;
        const iA = p * 2, iB = p * 2 + 1;
        const avgA = blockAvgLuma(d, w, iA % cols, Math.floor(iA / cols));
        const avgB = blockAvgLuma(d, w, iB % cols, Math.floor(iB / cols));
        if (avgA > avgB) ones++;
      }
      return ones >= 2 ? 1 : 0;
    }

    const hdrBits = [];
    for (let i = 0; i < 48; i++) hdrBits.push(readBit(i));
    const hdr = bitsToBytes(hdrBits);
    if (hdr[0] !== MAGIC[0] || hdr[1] !== MAGIC[1] || hdr[2] !== MAGIC[2]) {
      throw new Error('لم يتم العثور على رسالة مخفية صالحة داخل هذه الصورة.');
    }
    const encFlag = hdr[3];
    const len = (hdr[4] << 8) | hdr[5];
    if (len <= 0 || len > 4096 || (6 + len) * 24 > totalPairs) {
      throw new Error('البيانات المخفية تالفة أو الصورة تم قصّها.');
    }
    const payBits = [];
    for (let i = 48; i < (6 + len) * 8; i++) payBits.push(readBit(i));
    return { encFlag, payload: bitsToBytes(payBits) };
  }

  function initStego() {
    const main = document.querySelector('main');
    const navTools = document.querySelector('#sidebar nav > div:last-child');
    if (!main || !navTools || document.getElementById('panel-stego')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-tab', 'stego');
    btn.className = 'nav-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition';
    btn.innerHTML = '<i data-lucide="eye-off" class="w-4 h-4 shrink-0"></i><span>إخفاء نص بصورة</span>';
    navTools.appendChild(btn);

    const sec = document.createElement('section');
    sec.id = 'panel-stego';
    sec.className = 'tab-panel hidden fade-in space-y-5';
    sec.innerHTML = `
      <div class="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 max-w-2xl mx-auto">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 class="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">إخفاء النصوص داخل الصور (مقاوم للواتساب)</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">تقنية الكتل المقاومة لضغط JPEG — أرسلها كصورة عادية في واتساب وتشتغل 100%!</p>
          </div>
          <div class="flex p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold">
            <button type="button" id="stg-m-hide" class="px-3 py-1.5 rounded-lg bg-teal-600 text-white transition">إخفاء نص</button>
            <button type="button" id="stg-m-ext" class="px-3 py-1.5 rounded-lg text-slate-500 transition">استخراج نص</button>
          </div>
        </div>
        <div id="stg-drop" class="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 rounded-2xl p-6 text-center cursor-pointer transition bg-slate-50/70 dark:bg-slate-950/40">
          <input id="stg-file" type="file" accept="image/*" class="hidden" />
          <img id="stg-prev" class="hidden max-h-40 mx-auto rounded-xl mb-3 shadow-sm object-contain" alt="Preview" />
          <p id="stg-lbl" class="text-xs sm:text-sm font-bold text-slate-800 dark:text-white">اضغط لاختيار صورة (JPG / PNG / WebP)</p>
          <p class="text-[11px] text-slate-400 mt-1">مناسبة للرسائل وكلمات السر والروابط (حتى ~150 حرف) — معالجة محلية 100%</p>
        </div>
        <div id="stg-hide-box" class="space-y-3">
          <textarea id="stg-text" rows="3" maxlength="220" class="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm outline-none focus:border-teal-500" placeholder="اكتب الرسالة السرية هنا..."></textarea>
          <input id="stg-pass-h" type="password" class="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm outline-none focus:border-teal-500" placeholder="كلمة مرور لقفل النص (اختياري لزيادة الأمان)" />
          <button id="stg-btn-hide" type="button" class="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition">تضمين النص وتجهيز الصورة للواتساب</button>
        </div>
        <div id="stg-ext-box" class="hidden space-y-3">
          <input id="stg-pass-e" type="password" class="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm outline-none focus:border-teal-500" placeholder="كلمة المرور (إذا كان النص مقفلاً)" />
          <button id="stg-btn-ext" type="button" class="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition">استخراج الرسالة المخفية الآن</button>
        </div>
        <div id="stg-res" class="hidden p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 fade-in"></div>
        <canvas id="stg-canvas" class="hidden"></canvas>
      </div>`;
    main.appendChild(sec);

    let mode = 'hide', loadedImg = null;
    const mH = document.getElementById('stg-m-hide'), mE = document.getElementById('stg-m-ext');
    const bH = document.getElementById('stg-hide-box'), bE = document.getElementById('stg-ext-box');
    const drop = document.getElementById('stg-drop'), inp = document.getElementById('stg-file');
    const res = document.getElementById('stg-res');

    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'panel-stego'));
      const pt = document.getElementById('page-title'); if (pt) pt.textContent = 'إخفاء نص بصورة';
      const sb = document.getElementById('sidebar'), bd = document.getElementById('sidebar-backdrop');
      if (sb && window.innerWidth < 1024) sb.classList.add(document.documentElement.dir === 'rtl' ? 'translate-x-full' : '-translate-x-full');
      if (bd) bd.classList.add('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    mH.onclick = () => {
      mode = 'hide'; mH.className = 'px-3 py-1.5 rounded-lg bg-teal-600 text-white transition';
      mE.className = 'px-3 py-1.5 rounded-lg text-slate-500 transition';
      bH.classList.remove('hidden'); bE.classList.add('hidden'); res.classList.add('hidden');
    };
    mE.onclick = () => {
      mode = 'ext'; mE.className = 'px-3 py-1.5 rounded-lg bg-teal-600 text-white transition';
      mH.className = 'px-3 py-1.5 rounded-lg text-slate-500 transition';
      bE.classList.remove('hidden'); bH.classList.add('hidden'); res.classList.add('hidden');
    };

    drop.onclick = () => inp.click();
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const url = URL.createObjectURL(f), img = new Image();
      img.onload = () => {
        loadedImg = img;
        const pv = document.getElementById('stg-prev'); pv.src = url; pv.classList.remove('hidden');
        document.getElementById('stg-lbl').textContent = `${f.name.slice(0, 26)} (${img.width}×${img.height})`;
        res.classList.add('hidden');
      };
      img.src = url;
    };

    document.getElementById('stg-btn-hide').onclick = async () => {
      res.classList.remove('hidden');
      if (!loadedImg) { res.innerHTML = '<p class="text-xs text-rose-500 font-bold">اختر صورة أولاً.</p>'; return; }
      const txt = document.getElementById('stg-text').value.trim();
      if (!txt) { res.innerHTML = '<p class="text-xs text-rose-500 font-bold">اكتب الرسالة السرية أولاً.</p>'; return; }
      const pass = document.getElementById('stg-pass-h').value;
      try {
        const payload = pass ? await aesEncryptText(txt, pass) : new TextEncoder().encode(txt);
        const packet = new Uint8Array(6 + payload.length);
        packet.set(MAGIC, 0);
        packet[3] = pass ? 1 : 0;
        packet[4] = (payload.length >> 8) & 0xFF;
        packet[5] = payload.length & 0xFF;
        packet.set(payload, 6);

        const c = document.getElementById('stg-canvas');
        const ratio = loadedImg.height / loadedImg.width;
        const targetH = Math.max(512, Math.round((TARGET_W * ratio) / BLOCK) * BLOCK);
        c.width = TARGET_W;
        c.height = targetH;
        const ctx = c.getContext('2d');
        ctx.drawImage(loadedImg, 0, 0, TARGET_W, targetH);
        const imgData = embedBits(ctx.getImageData(0, 0, TARGET_W, targetH), packet);
        ctx.putImageData(imgData, 0, 0);
        c.toBlob(blob => {
          const url = URL.createObjectURL(blob);
          res.innerHTML = `<div class="text-xs font-bold text-emerald-600 dark:text-emerald-400">✓ تم إخفاء النص بنجاح بتقنية مقاومة لضغط الواتساب!</div><p class="text-[11px] text-slate-500">تقدر الحين ترسلها كصورة عادية في واتساب وتفتح مباشرة عند المستلم.</p><a href="${url}" download="aman-wa-${Date.now()}.jpg" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition">تحميل الصورة الجاهزة</a>`;
        }, 'image/jpeg', 0.92);
      } catch (e) { res.innerHTML = `<p class="text-xs text-rose-500 font-bold">${e.message}</p>`; }
    };

    document.getElementById('stg-btn-ext').onclick = async () => {
      res.classList.remove('hidden');
      if (!loadedImg) { res.innerHTML = '<p class="text-xs text-rose-500 font-bold">اختر الصورة أولاً.</p>'; return; }
      try {
        const c = document.getElementById('stg-canvas');
        const ratio = loadedImg.height / loadedImg.width;
        const normH = Math.max(512, Math.round((TARGET_W * ratio) / BLOCK) * BLOCK);
        c.width = TARGET_W;
        c.height = normH;
        const ctx = c.getContext('2d');
        ctx.drawImage(loadedImg, 0, 0, TARGET_W, normH);
        const { encFlag, payload } = extractBytes(ctx.getImageData(0, 0, TARGET_W, normH));
        let outText = '';
        if (encFlag === 1) {
          const pass = document.getElementById('stg-pass-e').value;
          if (!pass) { res.innerHTML = '<p class="text-xs text-amber-500 font-bold">هذه الصورة مقفلة بكلمة مرور، أدخلها أولاً.</p>'; return; }
          try { outText = await aesDecryptBytes(payload, pass); }
          catch (_) { res.innerHTML = '<p class="text-xs text-rose-500 font-bold">كلمة المرور غير صحيحة!</p>'; return; }
        } else {
          outText = new TextDecoder().decode(payload);
        }
        const pre = document.createElement('pre');
        pre.className = 'text-xs sm:text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800';
        pre.textContent = outText;
        res.innerHTML = '<div class="text-xs font-bold text-emerald-600 dark:text-emerald-400">✓ تم استخراج الرسالة السرية بنجاح:</div>';
        res.appendChild(pre);
      } catch (e) { res.innerHTML = `<p class="text-xs text-rose-500 font-bold">${e.message}</p>`; }
    };

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initStego); else initStego();
})();
