(function () {
  function normalizeAr(str) {
    return String(str || '')
      .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/[ىئ]/g, 'ي')
      .replace(/ؤ/g, 'و')
      .toLowerCase();
  }

  function collapseSpacedLetters(norm) {
    return norm.replace(/(?:^|\s)((?:[\u0621-\u064Aa-z]\s){2,}[\u0621-\u064Aa-z])(?=\s|$)/g, (_, m) => ' ' + m.replace(/\s+/g, ''));
  }

  function extractLinks(raw) {
    const found = new Set();
    const standard = raw.match(/https?:\/\/[^\s"'<>]+/gi) || [];
    standard.forEach(u => found.add(u.replace(/[.,!?;:)\]]+$/, '')));

    const obfRe = /([a-z0-9-]+)\s*(?:\[\s*(?:dot|نقطة|نقطه|\.)\s*\]|\(\s*(?:dot|نقطة|نقطه|\.)\s*\)|\s+dot\s+)\s*([a-z]{2,12}(?:\/[^\s]*)?)/gi;
    let m;
    while ((m = obfRe.exec(raw)) !== null) {
      found.add(`http://${m[1]}.${m[2]} (رابط مموّه)`);
    }

    const bareRe = /\b([a-z0-9-]{2,}\.(?:com|net|org|xyz|top|tk|ml|ga|cf|gq|info|biz|online|site|club|vip|click|link|shop|me|co|io|ly|gg)(?:\/[^\s]*)?)\b/gi;
    while ((m = bareRe.exec(raw)) !== null) {
      const candidate = m[1];
      const already = Array.from(found).some(x => x.toLowerCase().includes(candidate.toLowerCase()));
      if (!already) found.add('http://' + candidate);
    }
    return Array.from(found);
  }

  function analyzeScamText(raw) {
    const cleanRaw = String(raw || '').trim();
    const norm0 = normalizeAr(cleanRaw);
    const norm = collapseSpacedLetters(norm0);
    const links = extractLinks(cleanRaw);

    const findings = [];
    let score = 0;
    let tacticsHit = 0;

    const hasZeroWidth = /[\u200B-\u200F\uFEFF]/.test(cleanRaw);
    const hasHeavyTatweel = /ـ{2,}|[\u0621-\u064A]ـ[\u0621-\u064A]/.test(cleanRaw);
    const hasSpacedWord = norm !== norm0;
    const hasObfLink = links.some(l => l.includes('(رابط مموّه)'));
    if (hasZeroWidth || hasHeavyTatweel || hasSpacedWord || hasObfLink) {
      score += 28;
      tacticsHit++;
      const reasons = [];
      if (hasObfLink) reasons.push('تمويه شكل الرابط بـ [dot]');
      if (hasHeavyTatweel) reasons.push('تطويل حروف لإخفاء كلمات حساسة');
      if (hasSpacedWord) reasons.push('تقطيع حروف بمسافات');
      if (hasZeroWidth) reasons.push('محارف خفية غير مرئية');
      findings.push({ cat: 'تمويه ومراوغة', weight: 28, detail: reasons.join(' + ') });
    }

    if (links.length > 0) {
      const hasHttp = links.some(l => l.startsWith('http://') && !l.includes('(رابط مموّه)'));
      const hasShort = /(bit\.ly|tinyurl|t\.co|is\.gd|rb\.gy|cutt\.ly|shorturl|ow\.ly|wa\.me\/|t\.me\/)/i.test(cleanRaw);
      const hasRiskyTld = /\.(xyz|top|tk|ml|ga|cf|gq|click|vip|online|site)\b/i.test(cleanRaw);
      let pts = 15;
      const d = [`تم رصد ${links.length} رابط داخل الرسالة`];
      if (hasHttp) { pts += 12; d.push('رابط غير مشفّر (HTTP)'); }
      if (hasShort) { pts += 18; d.push('رابط مختصر يخفي الوجهة الحقيقية'); }
      if (hasRiskyTld) { pts += 15; d.push('امتداد نطاق شائع في مواقع التصيّد'); }
      score += pts;
      tacticsHit++;
      findings.push({ cat: 'تحليل الروابط', weight: pts, detail: d.join(' — ') });
    }

    const RULES = [
      {
        cat: 'طلب بيانات حساسة أو أكواد',
        weight: 35,
        words: ['رمز التحقق', 'كود التحقق', 'كود التفعيل', 'كلمه المرور', 'الرقم السري', 'otp', 'cvv', 'بطاقتك', 'رقم البطاقه', 'تحديث بيانات', 'تاكيد الهويه', 'تفعيل الحساب', 'password', 'pin code', 'verify account', 'كلمه السر']
      },
      {
        cat: 'ضغط نفسي واستعجال وتهديد',
        weight: 22,
        words: ['عاجل', 'فورا', 'خلال 24 ساعه', 'خلال ساعه', 'ايقاف', 'تجميد', 'حظر حسابك', 'اغلاق الحساب', 'انذار اخير', 'قبل الحذف', 'مؤقتا', 'لتجنب', 'urgent', 'immediately', 'suspended', 'blocked', 'expire']
      },
      {
        cat: 'إغراء مالي أو جوائز وعروض',
        weight: 22,
        words: ['مبروك', 'ربحت', 'فزت', 'جائزه', 'منحه', 'هديه مجانيه', 'عرض حصري', 'ارباح يوميه', 'استثمار مضمون', 'دخل يومي', 'وظيفه عن بعد', 'راتب يومي', 'خصم 90', 'تداول مضمون', 'تضاعف راس', 'congratulations', 'winner', 'prize', 'free gift']
      },
      {
        cat: 'انتحال جهة رسمية أو بنك',
        weight: 20,
        words: ['البنك', 'المصرف', 'الكريمي', 'الدعم الفني', 'اداره واتساب', 'فريق الامان', 'شركه الشحن', 'البريد', 'الجمارك', 'وزاره', 'الامم المتحده', 'خدمه العملاء', 'bank', 'support team', 'whatsapp team']
      },
      {
        cat: 'استدراج وتوجيه للضغط أو التواصل',
        weight: 14,
        words: ['اضغط هنا', 'ادخل الرابط', 'للتحقق الان', 'اكمل التفاصيل', 'لاكمال التفاصيل', 'تواصل معنا هنا', 'راسلنا خاص', 'ارسل رقمك', 'تواصل عبر تليجرام', 'click here', 'tap here', 'complete details']
      },
      {
        cat: 'طلب حوالة أو رسوم مالية',
        weight: 26,
        words: ['حواله', 'تحويل مبلغ', 'رسوم بسيطه', 'رسوم تفعيل', 'رسوم شحن', 'رسوم توصيل', 'محفظه الكترونيه', 'usdt', 'كريبتو', 'عملات رقميه', 'transfer fee']
      }
    ];

    RULES.forEach(rule => {
      const hits = rule.words.filter(w => norm.includes(w));
      if (hits.length > 0) {
        const pts = Math.min(rule.weight + (hits.length - 1) * 5, rule.weight + 12);
        score += pts;
        tacticsHit++;
        findings.push({ cat: rule.cat, weight: pts, detail: `عبارات مرصودة: ${hits.slice(0, 4).join('، ')}` });
      }
    });

    if (tacticsHit >= 3) {
      score += 12;
      findings.push({ cat: 'ترابط هندسة اجتماعية', weight: 12, detail: `اجتماع ${tacticsHit} أساليب احتيال مختلفة في نفس الرسالة يرفع احتمالية النصب بقوة.` });
    }

    score = Math.min(100, score);
    let level = 'safe', verdict = 'تبدو آمنة — لم تُرصد مؤشرات احتيال واضحة';
    if (score >= 65) { level = 'danger'; verdict = 'خطر عالٍ — رسالة نصب واحتيال محتملة جداً!'; }
    else if (score >= 30) { level = 'warn'; verdict = 'مشبوهة — تحتوي على أساليب استدراج أو تمويه، احذر!'; }

    return { score, level, verdict, findings, links };
  }

  function initPhishText() {
    const main = document.querySelector('main');
    const navTools = document.querySelector('#sidebar nav > div:last-child');
    if (!main || !navTools || document.getElementById('panel-phish')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-tab', 'phish');
    btn.className = 'nav-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition';
    btn.innerHTML = '<i data-lucide="message-square-warning" class="w-4 h-4 shrink-0"></i><span>كاشف رسائل النصب</span>';
    navTools.appendChild(btn);

    const sec = document.createElement('section');
    sec.id = 'panel-phish';
    sec.className = 'tab-panel hidden fade-in space-y-5';
    sec.innerHTML = `
      <div class="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 max-w-2xl mx-auto">
        <div>
          <h2 class="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">كاشف رسائل النصب والاحتيال (تحليل هندسي ذكي)</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">يحلل الأسلوب النفسي، التمويه بالحروف، الروابط المموّهة، وانتحال الجهات محلياً 100%.</p>
        </div>
        <textarea id="phish-inp" rows="4" class="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm outline-none focus:border-teal-500" placeholder="الصق رسالة واتساب أو SMS المشبوهة هنا..."></textarea>
        <button id="btn-phish-run" type="button" class="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition">تحليل الرسالة الآن</button>
        <div id="phish-out" class="hidden space-y-4 fade-in"></div>
      </div>`;
    main.appendChild(sec);

    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'panel-phish'));
      const pt = document.getElementById('page-title'); if (pt) pt.textContent = 'كاشف رسائل النصب';
      const sb = document.getElementById('sidebar'), bd = document.getElementById('sidebar-backdrop');
      if (sb && window.innerWidth < 1024) sb.classList.add(document.documentElement.dir === 'rtl' ? 'translate-x-full' : '-translate-x-full');
      if (bd) bd.classList.add('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.getElementById('btn-phish-run').addEventListener('click', () => {
      const txt = document.getElementById('phish-inp').value.trim();
      const out = document.getElementById('phish-out');
      if (!txt) return;
      const r = analyzeScamText(txt);
      const color = r.level === 'danger' ? 'text-rose-500' : (r.level === 'warn' ? 'text-amber-500' : 'text-emerald-500');
      const bar = r.level === 'danger' ? 'bg-rose-500' : (r.level === 'warn' ? 'bg-amber-500' : 'bg-emerald-500');

      const findHtml = r.findings.length
        ? r.findings.map(f => `
            <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-extrabold text-slate-800 dark:text-white">${f.cat}</span>
                <span class="text-[11px] font-bold text-amber-500">+${f.weight}%</span>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">${f.detail}</p>
            </div>`).join('')
        : '<div class="text-xs text-emerald-500 font-bold">✓ لم يتم رصد أي أساليب تمويه أو استدراج أو طلب بيانات حساسة.</div>';

      const linkHtml = r.links.length
        ? `<div class="space-y-1.5 pt-1"><div class="text-xs font-bold text-slate-500">روابط مستخرجة من الرسالة:</div>${r.links.map(u => {
            const cleanU = u.replace(' (رابط مموّه)', '');
            return `<div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"><span class="text-[11px] mono truncate" dir="ltr">${u}</span><button type="button" data-jump-url="${cleanU}" class="shrink-0 px-2.5 py-1 rounded-lg bg-teal-600 text-white text-[11px] font-bold">فحص الرابط</button></div>`;
          }).join('')}</div>`
        : '';

      out.classList.remove('hidden');
      out.innerHTML = `
        <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs sm:text-sm font-extrabold ${color}">${r.verdict}</span>
            <span class="text-lg font-black mono ${color}">${r.score}%</span>
          </div>
          <div class="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div class="h-full ${bar} transition-all" style="width:${r.score}%"></div>
          </div>
          <div class="space-y-2">${findHtml}</div>
          ${linkHtml}
        </div>`;

      out.querySelectorAll('[data-jump-url]').forEach(jb => {
        jb.addEventListener('click', () => {
          const u = jb.getAttribute('data-jump-url');
          const urlTab = document.querySelector('#sidebar [data-tab="url"]');
          if (urlTab) urlTab.click();
          const urlInp = document.querySelector('#panel-url input[type="url"], #panel-url input[type="text"]');
          if (urlInp) { urlInp.value = u; urlInp.focus(); }
        });
      });
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPhishText); else initPhishText();
})();
