(function () {
  function initPhishText() {
    const main = document.querySelector('main'), navScan = document.querySelectorAll('#sidebar nav > div')[1];
    if (!main || !navScan || document.getElementById('panel-phishtext')) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.setAttribute('data-tab', 'phishtext');
    btn.className = 'nav-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition';
    btn.innerHTML = '<i data-lucide="message-square-warning" class="w-4 h-4 shrink-0"></i><span>كاشف رسائل النصب</span>';
    navScan.appendChild(btn);

    const sec = document.createElement('section');
    sec.id = 'panel-phishtext'; sec.className = 'tab-panel hidden fade-in space-y-5';
    sec.innerHTML = `
      <div class="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 max-w-2xl mx-auto">
        <div><h2 class="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">كاشف رسائل النصب والاحتيال (واتساب / SMS)</h2><p class="text-xs text-slate-500 dark:text-slate-400 mt-1">الصق أي رسالة مشبوهة وصلتك وسنكشف أساليب الخداع والروابط المخفية داخلها فوراً.</p></div>
        <textarea id="pt-input" rows="4" placeholder="الصق نص الرسالة هنا..." class="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"></textarea>
        <div class="flex flex-wrap gap-2 text-xs">
          <button type="button" class="pt-sample px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200" data-msg="عزيزي العميل، تم إيقاف حسابك البنكي مؤقتاً! يرجى تحديث بيانات البطاقة وإرسال رمز التحقق OTP خلال 24 ساعة عبر الرابط: http://bank-verify.xyz/login">تجربة رسالة بنكية مزيفة</button>
          <button type="button" class="pt-sample px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200" data-msg="مبروك! لقد ربحت جائزة مالية 5000 دولار، اضغط فوراً لاستلام جائزتك: https://bit.ly/free-prize">تجربة رسالة جائزة وهمية</button>
        </div>
        <button id="btn-pt-scan" type="button" class="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition">تحليل الرسالة الآن</button>
        <div id="pt-result" class="hidden space-y-3 pt-2 fade-in"><div id="pt-verdict" class="p-4 rounded-2xl border font-bold text-sm text-center"></div><ul id="pt-flags" class="space-y-2 text-xs sm:text-sm"></ul></div>
      </div>`;
    main.appendChild(sec);

    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'panel-phishtext'));
      const pt = document.getElementById('page-title'); if (pt) pt.textContent = 'كاشف رسائل النصب';
      const sb = document.getElementById('sidebar'), bd = document.getElementById('sidebar-backdrop');
      if (sb && window.innerWidth < 1024) sb.classList.add(document.documentElement.dir === 'rtl' ? 'translate-x-full' : '-translate-x-full');
      if (bd) bd.classList.add('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    const RULES = [
      { re: /(إيقاف حسابك|تم تعليق|حسابك البنكي|تحديث البيانات|تجميد|suspended|verify your account)/i, w: 30, msg: 'أسلوب تخويف: يدّعي إيقاف حسابك أو طلب تحديث بيانات بنكية.' },
      { re: /(رمز التحقق|كود التفعيل|OTP|CVV|الرقم السري|بطاقة الصراف|كلمة المرور)/i, w: 35, msg: 'خطر سرقة بيانات: يطلب رمز التحقق OTP أو بيانات بطاقة/كلمة سر!' },
      { re: /(فوراً|خلال 24 ساعة|عاجل|قبل الإغلاق|آخر فرصة|urgent|immediately)/i, w: 18, msg: 'أسلوب استعجال وضغط نفسي (هندسة اجتماعية) لمنعك من التفكير.' },
      { re: /(ربحت|مبروك|جائزة|مبلغ مالي|دولار|آيفون|شحنتك معلقة|won a prize|gift)/i, w: 25, msg: 'طُعم مالي أو جائزة وهمية شائعة جداً في رسائل الاحتيال.' }
    ];
    function analyzeMsg(text) {
      if (!text.trim()) return;
      let risk = 0; const flags = [];
      RULES.forEach(r => { if (r.re.test(text)) { risk += r.w; flags.push({ lvl: 'danger', txt: r.msg }); } });
      (text.match(/https?:\/\/[^\s]+/gi) || []).forEach(u => { risk += 15; flags.push({ lvl: 'warn', txt: `يوجد رابط داخل الرسالة: ${u}`, url: u }); });
      risk = Math.min(100, risk);
      document.getElementById('pt-result').classList.remove('hidden');
      const v = document.getElementById('pt-verdict');
      if (risk >= 55) { v.className = 'p-4 rounded-2xl border border-rose-300 bg-rose-50 dark:bg-rose-500/15 dark:border-rose-500/40 text-rose-700 dark:text-rose-200 font-extrabold text-sm text-center'; v.textContent = `احتمال نصب واحتيال مرتفع (${risk}%) — لا تضغط أي رابط ولا ترسل أي رمز!`; }
      else if (risk >= 20) { v.className = 'p-4 rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-500/15 dark:border-amber-500/40 text-amber-800 dark:text-amber-200 font-extrabold text-sm text-center'; v.textContent = `رسالة مشبوهة (${risk}%) — تأكد من هوية المرسل أولاً.`; }
      else { v.className = 'p-4 rounded-2xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-200 font-extrabold text-sm text-center'; v.textContent = 'لم يتم رصد مؤشرات احتيال واضحة في النص.'; }
      const ul = document.getElementById('pt-flags'); ul.innerHTML = '';
      flags.forEach(f => {
        const li = document.createElement('li');
        li.className = f.lvl === 'danger' ? 'p-3 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/10 text-rose-800 dark:text-rose-200 flex items-center justify-between gap-2' : 'p-3 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2';
        const sp = document.createElement('span'); sp.textContent = f.txt; li.appendChild(sp);
        if (f.url) { const b = document.createElement('button'); b.type = 'button'; b.className = 'px-2.5 py-1 rounded-lg bg-teal-600 text-white text-[11px] font-bold shrink-0'; b.textContent = 'افحص الرابط'; b.onclick = () => { const ui = document.getElementById('url-input'); if (ui) ui.value = f.url; const nu = document.querySelector('[data-tab="url"]'); if (nu) nu.click(); const fm = document.getElementById('url-form'); if (fm) fm.dispatchEvent(new Event('submit', { cancelable: true })); }; li.appendChild(b); }
        ul.appendChild(li);
      });
    }
    document.getElementById('btn-pt-scan').addEventListener('click', () => analyzeMsg(document.getElementById('pt-input').value));
    document.querySelectorAll('.pt-sample').forEach(b => b.addEventListener('click', () => { document.getElementById('pt-input').value = b.getAttribute('data-msg'); analyzeMsg(b.getAttribute('data-msg')); }));
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPhishText); else initPhishText();
})();
