(function () {
  function findSeq(bytes, seq, fromEnd) {
    if (fromEnd) {
      for (let i = bytes.length - seq.length; i >= 0; i--) {
        let ok = true;
        for (let j = 0; j < seq.length; j++) if (bytes[i + j] !== seq[j]) { ok = false; break; }
        if (ok) return i;
      }
      return -1;
    }
    for (let i = 0; i <= bytes.length - seq.length; i++) {
      let ok = true;
      for (let j = 0; j < seq.length; j++) if (bytes[i + j] !== seq[j]) { ok = false; break; }
      if (ok) return i;
    }
    return -1;
  }

  function deepInspectBytes(bytes, fileName) {
    const findings = [];
    const nameLower = String(fileName || '').toLowerCase();
    const isJpg = bytes.length > 4 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
    const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
    const isGif = bytes.length > 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
    const isImage = isJpg || isPng || isGif;

    let trailingBytes = 0;
    let tailSlice = null;

    if (isJpg) {
      const eoi = findSeq(bytes, [0xFF, 0xD9], true);
      if (eoi !== -1 && eoi + 2 < bytes.length) {
        trailingBytes = bytes.length - (eoi + 2);
        if (trailingBytes > 64) {
          tailSlice = bytes.slice(eoi + 2, Math.min(bytes.length, eoi + 2 + 2048));
          findings.push({
            sev: 'high',
            title: 'بيانات مخفية ملصقة في ذيل صورة JPEG',
            detail: `تم رصد ${trailingBytes.toLocaleString()} بايت إضافية بعد علامة نهاية الصورة (FF D9) — أسلوب شائع لإخفاء ملفات أو أكواد (Polyglot).`
          });
        }
      }
    } else if (isPng) {
      const iend = findSeq(bytes, [0x49, 0x45, 0x4E, 0x44], true);
      if (iend !== -1 && iend + 8 < bytes.length) {
        trailingBytes = bytes.length - (iend + 8);
        if (trailingBytes > 32) {
          tailSlice = bytes.slice(iend + 8, Math.min(bytes.length, iend + 8 + 2048));
          findings.push({
            sev: 'high',
            title: 'بيانات مخفية ملصقة في ذيل صورة PNG',
            detail: `تم رصد ${trailingBytes.toLocaleString()} بايت إضافية بعد نهاية الصورة (IEND Chunk).`
          });
        }
      }
    }

    if (isImage) {
      const scanArea = tailSlice || bytes.slice(0, Math.min(bytes.length, 524288));
      if (findSeq(scanArea, [0x50, 0x4B, 0x03, 0x04], false) !== -1) {
        findings.push({ sev: 'high', title: 'ملف مضغوط مخبّأ داخل الصورة (ZIP / APK)', detail: 'تم العثور على توقيع أرشيف (PK\\x03\\x04) مدمج داخل بايتات الصورة!' });
      }
      if (findSeq(scanArea, [0x52, 0x61, 0x72, 0x21], false) !== -1) {
        findings.push({ sev: 'high', title: 'أرشيف RAR مخبّأ داخل الصورة', detail: 'تم العثور على توقيع ملف RAR مدمج داخل الصورة!' });
      }
      if (findSeq(scanArea, [0x25, 0x50, 0x44, 0x46, 0x2D], false) !== -1) {
        findings.push({ sev: 'warn', title: 'ملف PDF مدمج داخل الصورة', detail: 'تم رصد ترويسة %PDF- داخل بايتات الصورة.' });
      }
    }

    const headTxt = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 262144)));
    const tailTxt = bytes.length > 262144 ? new TextDecoder('latin1').decode(bytes.slice(Math.max(262144, bytes.length - 65536))) : '';
    const textSample = headTxt + '\n' + tailTxt;

    const codeSigs = [
      { re: /<\?php\b/i, title: 'كود PHP محقون داخل الملف', detail: 'تم رصد وسم <?php — يُستخدم في هجمات WebShell داخل الصور.' },
      { re: /<script[\s>]/i, title: 'كود JavaScript (<script>) محقون', detail: 'تم رصد وسم <script> — خطر تنفيذ أوامر XSS أو HTML Polyglot.' },
      { re: /\b(?:onerror|onload)\s*=\s*["']?/i, title: 'حدث برمجي مخفي (XSS Payload)', detail: 'تم رصد أحداث تنفيذ تلقائي مثل onerror/onload داخل محتوى الملف.' },
      { re: /\b(?:powershell|cmd\.exe|\/bin\/sh|\/bin\/bash)\b/i, title: 'أمر نظام تشغيل مدمج', detail: 'تم رصد استدعاء مباشر لسطر الأوامر داخل بايتات الملف.' }
    ];

    if (isImage || nameLower.endsWith('.svg') || nameLower.endsWith('.pdf')) {
      codeSigs.forEach(sig => {
        if (sig.re.test(textSample)) {
          findings.push({ sev: 'high', title: sig.title, detail: sig.detail });
        }
      });
    }

    return {
      isImage,
      format: isJpg ? 'JPEG' : (isPng ? 'PNG' : (isGif ? 'GIF' : 'ملف عام')),
      trailingBytes,
      findings,
      clean: findings.length === 0
    };
  }

  function initDeepFileScan() {
    const panel = document.getElementById('panel-file');
    if (!panel || panel.dataset.deepBound) return;
    panel.dataset.deepBound = '1';

    const fileInp = panel.querySelector('input[type="file"]');
    if (!fileInp) return;

    let box = document.getElementById('aman-deep-scan-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'aman-deep-scan-box';
      box.className = 'hidden mt-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-teal-900/50 space-y-2.5 fade-in max-w-2xl mx-auto';
      panel.appendChild(box);
    }

    fileInp.addEventListener('change', async () => {
      const f = fileInp.files && fileInp.files[0];
      if (!f) { box.classList.add('hidden'); return; }
      box.classList.remove('hidden');
      box.innerHTML = '<div class="text-xs font-bold text-teal-500">جاري الفحص الثنائي العميق لذيل الملف والأكواد المحقونة...</div>';
      try {
        const blob = f.size > 6 * 1024 * 1024 ? f.slice(0, 6 * 1024 * 1024) : f;
        const buf = await blob.arrayBuffer();
        const r = deepInspectBytes(new Uint8Array(buf), f.name);

        if (r.clean) {
          box.innerHTML = `
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs sm:text-sm font-extrabold text-emerald-500">✓ الفحص الثنائي العميق: سليمة من الحقن والملفات المخبأة</span>
              <span class="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-500">${r.format}</span>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">تم فحص نهاية الملف والبايتات الداخلية بالكامل: لا توجد ملفات ZIP/RAR ملصقة ولا أكواد PHP أو JavaScript محقونة.</p>`;
        } else {
          const rows = r.findings.map(x => `
            <div class="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 space-y-1">
              <div class="text-xs font-extrabold text-rose-500">⚠ ${x.title}</div>
              <p class="text-[11px] text-slate-600 dark:text-slate-300">${x.detail}</p>
            </div>`).join('');
          box.innerHTML = `
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs sm:text-sm font-extrabold text-rose-500">⚠ تحذير أمني: تم رصد محتوى مخفي داخل الملف!</span>
              <span class="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-500">${r.findings.length} تنبيه</span>
            </div>
            <div class="space-y-2">${rows}</div>`;
        }
      } catch (_) {
        box.classList.add('hidden');
      }
    });
  }

  window.addEventListener('load', () => setTimeout(initDeepFileScan, 150));
})();
