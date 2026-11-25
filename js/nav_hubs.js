(function () {
  function initNavHubs() {
    const main = document.querySelector('main');
    const navTools = document.querySelector('#sidebar nav > div:last-child');
    if (!main || !navTools || document.getElementById('panel-hub-scan')) return;

    const HUBS = [
      {
        id: 'hub-scan',
        title: 'مركز الفحص الأمني',
        desc: 'اختر أداة الفحص المناسبة للتحقق من الروابط والملفات والرسائل المشبوهة.',
        icon: 'shield-check',
        items: [
          { tab: 'url', title: 'فحص الروابط', sub: 'كشف التصيّد والروابط المختصرة و SSL', icon: 'link-2' },
          { tab: 'file', title: 'فحص الملفات', sub: 'بصمة SHA-256 وفحص الامتدادات محلياً', icon: 'file-search' },
          { tab: 'phish', title: 'كاشف رسائل النصب', sub: 'تحليل رسائل واتساب و SMS الاحتيالية', icon: 'message-square-warning' }
        ]
      },
      {
        id: 'hub-privacy',
        title: 'التشفير والخصوصية',
        desc: 'أدوات حماية البيانات وتشفير النصوص والصور وتنظيف معلومات الكاميرا محلياً 100%.',
        icon: 'lock',
        items: [
          { tab: 'crypto', title: 'التشفير والأكواد', sub: 'AES-256 للنصوص والملفات و Base64 و JWT', icon: 'code-2' },
          { tab: 'stego', title: 'إخفاء نص في صورة', sub: 'إخفاء واستخراج الرسائل السرية داخل الصور', icon: 'eye-off' },
          { tab: 'secret', title: 'رابط سري مشفّر', sub: 'إنشاء روابط مشفّرة لمشاركتها عبر واتساب', icon: 'send' },
          { tab: 'exif', title: 'منظّف خصوصية الصور', sub: 'مسح نوع الجوال ووقت التصوير وموقع GPS', icon: 'image-off' }
        ]
      }
    ];

    function findSidebarBtn(tabKey) {
      const exact = navTools.querySelector(`[data-tab="${tabKey}"]`);
      if (exact) return exact;
      const all = Array.from(navTools.querySelectorAll('button'));
      const aliases = {
        phish: ['phish', 'scam', 'نصب', 'احتيال'],
        secret: ['secret', 'رابط سري'],
        stego: ['stego', 'إخفاء'],
        exif: ['exif', 'منظّف', 'منظف', 'خصوصية الصور'],
        url: ['url', 'فحص الروابط'],
        file: ['file', 'فحص الملفات'],
        crypto: ['crypto', 'التشفير']
      };
      const keys = aliases[tabKey] || [tabKey];
      return all.find(b => {
        const dt = (b.getAttribute('data-tab') || '').toLowerCase();
        const tx = (b.textContent || '').toLowerCase();
        return keys.some(k => dt.includes(k) || tx.includes(k));
      }) || null;
    }

    function openHub(hubId, hubTitle, hubBtn) {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b === hubBtn));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== `panel-${hubId}`));
      const pt = document.getElementById('page-title');
      if (pt) pt.textContent = hubTitle;
      const sb = document.getElementById('sidebar');
      const bd = document.getElementById('sidebar-backdrop');
      if (sb && window.innerWidth < 1024) sb.classList.add(document.documentElement.dir === 'rtl' ? 'translate-x-full' : '-translate-x-full');
      if (bd) bd.classList.add('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    const firstTool = navTools.firstElementChild;

    HUBS.forEach(hub => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-tab', hub.id);
      btn.className = 'nav-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition';
      btn.innerHTML = `<i data-lucide="${hub.icon}" class="w-4 h-4 shrink-0"></i><span>${hub.title}</span>`;
      if (firstTool) navTools.insertBefore(btn, firstTool);
      else navTools.appendChild(btn);

      const sec = document.createElement('section');
      sec.id = `panel-${hub.id}`;
      sec.className = 'tab-panel hidden fade-in space-y-5 max-w-2xl mx-auto';

      const cardsHtml = hub.items.map(it => `
        <button type="button" data-hub-go="${it.tab}" class="group text-right w-full p-5 rounded-2xl bg-white dark:bg-[#0c1d19] border border-slate-200 dark:border-teal-900/60 hover:border-teal-500 transition flex flex-col justify-between gap-4 shadow-sm">
          <div class="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
            <i data-lucide="${it.icon}" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition">${it.title}</div>
            <p class="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">${it.sub}</p>
          </div>
        </button>
      `).join('');

      sec.innerHTML = `
        <div class="space-y-1 px-1">
          <h2 class="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">${hub.title}</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">${hub.desc}</p>
        </div>
        <div class="grid grid-cols-2 gap-3.5 sm:gap-4">${cardsHtml}</div>
      `;
      main.appendChild(sec);

      btn.addEventListener('click', () => openHub(hub.id, hub.title, btn));

      hub.items.forEach(it => {
        const origBtn = findSidebarBtn(it.tab);
        if (origBtn) origBtn.classList.add('hidden');
      });

      sec.querySelectorAll('[data-hub-go]').forEach(card => {
        card.addEventListener('click', () => {
          const origBtn = findSidebarBtn(card.getAttribute('data-hub-go'));
          if (origBtn) origBtn.click();
        });
      });
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  window.addEventListener('load', () => setTimeout(initNavHubs, 60));
})();
