(function () {
  function parseRealExif(buffer) {
    const view = new DataView(buffer);
    const out = {};
    if (view.byteLength < 12 || view.getUint16(0, false) !== 0xFFD8) return out;
    let offset = 2;
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset, false);
      offset += 2;
      if (marker === 0xFFE1) {
        const size = view.getUint16(offset, false);
        if (view.getUint32(offset + 2, false) !== 0x45786966) { offset += size; continue; }
        const tiff = offset + 8;
        const little = view.getUint16(tiff, false) === 0x4949;
        const firstIfd = view.getUint32(tiff + 4, little);
        const readStr = (off, cnt) => {
          let str = '';
          for (let i = 0; i < cnt - 1 && off + i < view.byteLength; i++) {
            const c = view.getUint8(off + i);
            if (c === 0) break;
            str += String.fromCharCode(c);
          }
          return str.trim();
        };
        const readRat = (off) => {
          const n = view.getUint32(off, little), d = view.getUint32(off + 4, little);
          return d ? n / d : 0;
        };
        const readIfd = (dirStart) => {
          const entries = view.getUint16(dirStart, little);
          const map = {};
          for (let i = 0; i < entries; i++) {
            const e = dirStart + 2 + i * 12;
            if (e + 12 > view.byteLength) break;
            const tag = view.getUint16(e, little), type = view.getUint16(e + 2, little), cnt = view.getUint32(e + 4, little);
            const valOff = (type === 2 && cnt > 4) || (type === 5) ? tiff + view.getUint32(e + 8, little) : e + 8;
            map[tag] = { type, cnt, valOff, raw32: view.getUint32(e + 8, little) };
          }
          return map;
        };
        const ifd0 = readIfd(tiff + firstIfd);
        if (ifd0[0x010F]) out.make = readStr(ifd0[0x010F].valOff, ifd0[0x010F].cnt);
        if (ifd0[0x0110]) out.model = readStr(ifd0[0x0110].valOff, ifd0[0x0110].cnt);
        if (ifd0[0x0131]) out.software = readStr(ifd0[0x0131].valOff, ifd0[0x0131].cnt);
        if (ifd0[0x0132]) out.datetime = readStr(ifd0[0x0132].valOff, ifd0[0x0132].cnt);
        if (ifd0[0x8825]) {
          try {
            const gps = readIfd(tiff + ifd0[0x8825].raw32);
            if (gps[2] && gps[4]) {
              const lat = readRat(gps[2].valOff) + readRat(gps[2].valOff + 8) / 60 + readRat(gps[2].valOff + 16) / 3600;
              const lng = readRat(gps[4].valOff) + readRat(gps[4].valOff + 8) / 60 + readRat(gps[4].valOff + 16) / 3600;
              const latRef = gps[1] ? String.fromCharCode(view.getUint8(gps[1].valOff)) : 'N';
              const lngRef = gps[3] ? String.fromCharCode(view.getUint8(gps[3].valOff)) : 'E';
              out.gps = `${(latRef === 'S' ? -lat : lat).toFixed(5)}, ${(lngRef === 'W' ? -lng : lng).toFixed(5)}`;
            }
          } catch (e) {}
        }
        break;
      } else if ((marker & 0xFF00) !== 0xFF00) break;
      else offset += view.getUint16(offset, false);
    }
    return out;
  }

  function initExif() {
    const main = document.querySelector('main'), navTools = document.querySelector('#sidebar nav > div:last-child');
    if (!main || !navTools || document.getElementById('panel-exif')) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.setAttribute('data-tab', 'exif');
    btn.className = 'nav-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition';
    btn.innerHTML = '<i data-lucide="image-off" class="w-4 h-4 shrink-0"></i><span>منظّف خصوصية الصور</span>';
    navTools.appendChild(btn);

    const sec = document.createElement('section');
    sec.id = 'panel-exif'; sec.className = 'tab-panel hidden fade-in space-y-5';
    sec.innerHTML = `
      <div class="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 max-w-2xl mx-auto">
        <div><h2 class="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">منظّف خصوصية الصور (EXIF و GPS)</h2><p class="text-xs text-slate-500 dark:text-slate-400 mt-1">يقرأ البيانات السرية الحقيقية (نوع الجوال، وقت التصوير، موقع GPS) ويمسحها بالكامل محلياً.</p></div>
        <div id="exif-drop" class="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 rounded-2xl p-6 text-center cursor-pointer transition bg-slate-50/70 dark:bg-slate-950/40">
          <input id="exif-file" type="file" accept="image/*" class="hidden" />
          <img id="exif-prev" class="hidden max-h-44 mx-auto rounded-xl mb-3 shadow-sm object-contain" alt="Preview" />
          <p id="exif-lbl" class="text-xs sm:text-sm font-bold text-slate-800 dark:text-white break-all">اضغط لاختيار صورة لفحص وتنظيف بياناتها</p>
          <p class="text-[11px] text-slate-400 mt-1">JPG, PNG, WebP — المعالجة داخل جهازك 100%</p>
        </div>
        <div id="exif-info" class="hidden p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 fade-in">
          <div id="exif-status" class="text-xs font-bold"></div>
          <div id="exif-meta-list" class="text-xs text-slate-600 dark:text-slate-300 space-y-1.5"></div>
          <button id="btn-exif-clean" type="button" class="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition">تنظيف كل البيانات المخفية الآن</button>
          <div id="exif-done" class="hidden pt-2 text-center space-y-2 fade-in">
            <div class="text-xs font-bold text-emerald-600 dark:text-emerald-400">✓ تم مسح جميع بيانات EXIF و GPS — الصورة نظيفة وآمنة 100%!</div>
            <a id="exif-dl" download="aman-pro-clean.jpg" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition">تحميل الصورة النظيفة</a>
          </div>
        </div>
        <canvas id="exif-canvas" class="hidden"></canvas>
      </div>`;
    main.appendChild(sec);

    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'panel-exif'));
      const pt = document.getElementById('page-title'); if (pt) pt.textContent = 'منظّف خصوصية الصور';
      const sb = document.getElementById('sidebar'), bd = document.getElementById('sidebar-backdrop');
      if (sb && window.innerWidth < 1024) sb.classList.add(document.documentElement.dir === 'rtl' ? 'translate-x-full' : '-translate-x-full');
      if (bd) bd.classList.add('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    let curImg = null, curName = 'clean.jpg';
    const drop = document.getElementById('exif-drop'), inp = document.getElementById('exif-file');
    drop.addEventListener('click', () => inp.click());
    inp.addEventListener('change', async () => {
      const f = inp.files[0]; if (!f) return;
      curName = 'clean-' + f.name.replace(/\.[^.]+$/, '') + '.jpg';
      const ab = await f.arrayBuffer();
      const ex = parseRealExif(ab);
      const foundCount = Object.keys(ex).length;
      const url = URL.createObjectURL(f), img = new Image();
      img.onload = () => {
        curImg = img; const pv = document.getElementById('exif-prev'); pv.src = url; pv.classList.remove('hidden');
        document.getElementById('exif-lbl').textContent = `${f.name.slice(0, 28)} (${(f.size / 1024).toFixed(1)} KB)`;
        document.getElementById('exif-info').classList.remove('hidden'); document.getElementById('exif-done').classList.add('hidden');
        const st = document.getElementById('exif-status');
        st.className = foundCount > 0 ? 'text-xs font-bold text-amber-600 dark:text-amber-400' : 'text-xs font-bold text-emerald-600 dark:text-emerald-400';
        st.textContent = foundCount > 0 ? `⚠ تم استخراج ${foundCount} بيانات سرية مخفية داخل الصورة:` : 'لم يتم العثور على بيانات EXIF حساسة (أو قام نظام أندرويد بحجبها عند الاختيار).';
        const rows = [
          `<div>• الأبعاد والحجم: <span class="mono">${img.width} × ${img.height}</span> (${(f.size / 1024).toFixed(1)} KB)</div>`
        ];
        if (ex.make || ex.model) rows.push(`<div>• نوع الجوال / الكاميرا: <strong class="mono">${ex.make || ''} ${ex.model || ''}</strong></div>`);
        if (ex.datetime) rows.push(`<div>• تاريخ ووقت التصوير: <strong class="mono">${ex.datetime}</strong></div>`);
        if (ex.software) rows.push(`<div>• نظام التصوير: <strong class="mono">${ex.software}</strong></div>`);
        if (ex.gps) rows.push(`<div class="text-rose-500">• موقع التصوير الدقيق (GPS): <strong class="mono">${ex.gps}</strong> ⚠</div>`);
        else rows.push(`<div>• موقع GPS: <span class="text-slate-400">غير موجود (أو خيار "علامات الموقع" مطفأ في الكاميرا)</span></div>`);
        document.getElementById('exif-meta-list').innerHTML = rows.join('');
      };
      img.src = url;
    });
    document.getElementById('btn-exif-clean').addEventListener('click', () => {
      if (!curImg) return;
      const c = document.getElementById('exif-canvas'); c.width = curImg.width; c.height = curImg.height;
      c.getContext('2d').drawImage(curImg, 0, 0);
      const dl = document.getElementById('exif-dl'); dl.href = c.toDataURL('image/jpeg', 0.94); dl.download = curName;
      document.getElementById('exif-done').classList.remove('hidden');
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initExif); else initExif();
})();
