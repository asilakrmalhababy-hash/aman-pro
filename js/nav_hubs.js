(function () {
  const AR_TO_EN = {
    'الفحص الأمني': 'Security Scan',
    'مركز الفحص الأمني': 'Security Scan',
    'التشفير والخصوصية': 'Encryption & Privacy',
    'فحص الروابط': 'URL Inspector',
    'فحص الملفات': 'File Inspector',
    'كاشف رسائل النصب': 'Scam Message Detector',
    'كاشف رسائل النصب والاحتيال': 'Scam & Phishing Detector',
    'التشفير والأكواد': 'Crypto & Dev Tools',
    'إخفاء نص في صورة': 'Hide Text in Image',
    'إخفاء نص بصورة': 'Hide Text in Image',
    'رابط سري مشفّر': 'Encrypted Secret Link',
    'منظّف خصوصية الصور': 'Image Privacy Cleaner',
    'منظّف خصوصية الصور (EXIF و GPS)': 'Image Privacy Cleaner (EXIF & GPS)',
    'كلمات المرور': 'Passwords',
    'الباركود الأمني': 'Secure QR',
    'أدوات الأمان': 'Security Tools',
    'اختر أداة الفحص للتحقق من الروابط والملفات والرسائل المشبوهة.': 'Inspect suspicious URLs, files, and scam messages locally.',
    'حماية البيانات وتشفير النصوص والصور وتنظيف بيانات الكاميرا محلياً.': 'Encrypt text, hide secrets in images, and strip photo metadata locally.',
    'اضغط لاختيار صورة لفحص وتنظيف بياناتها': 'Tap to pick a photo to inspect and clean metadata',
    'JPG, PNG, WebP — المعالجة داخل جهازك 100%': 'JPG, PNG, WebP — 100% local on-device processing',
    'تنظيف كل البيانات المخفية الآن': 'Clean All Hidden Metadata Now',
    'تحميل الصورة النظيفة': 'Download Clean Photo',
    'يقرأ البيانات السرية الحقيقية (نوع الجوال، وقت التصوير، موقع GPS) ويمسحها بالكامل محلياً.': 'Reads hidden metadata (device model, capture time, GPS) and strips it locally.',
    'تحليل الرسالة الآن': 'Analyze Message Now',
    'تشغيل الكاميرا الحية': 'Start Live Camera',
    'إيقاف الكاميرا': 'Stop Camera',
    'إنشاء الرابط السري': 'Create Secret Link',
    'نسخ الرابط': 'Copy Link',
    'مشاركة واتساب': 'Share on WhatsApp',
    'إخفاء النص داخل الصورة': 'Hide Text in Image',
    'استخراج النص من الصورة': 'Extract Text from Image',
    'تحميل الصورة': 'Download Image'
  };

  const EN_TO_AR = {};
  Object.keys(AR_TO_EN).forEach(k => {
    if (!EN_TO_AR[AR_TO_EN[k]]) EN_TO_AR[AR_TO_EN[k]] = k;
  });

  function translateTree(root, toEn) {
    if (!root) return;
    const dict = toEn ? AR_TO_EN : EN_TO_AR;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const raw = node.nodeValue;
      if (!raw) continue;
      const trimmed = raw.trim();
      if (trimmed && dict[trimmed]) {
        node.nodeValue = raw.replace(trimmed, dict[trimmed]);
      }
    }
  }

  function applyExtraTranslations() {
    const isEn = document.documentElement.lang === 'en' || document.documentElement.dir === 'ltr';
    const targets = [
      document.getElementById('sidebar'),
      document.getElementById('page-title'),
      document.getElementById('panel-hub-scan'),
      document.getElementById('panel-hub-privacy'),
      document.getElementById('panel-exif'),
      document.getElementById('panel-stego'),
      document.getElementById('panel-secret'),
      document.getElementById('panel-phish'),
      document.getElementById('panel-qr')
    ];
    targets.forEach(el => translateTree(el, isEn));
  }

  function initNavHubs() {
    const main = document.querySelector('main');
    const navRoot = document.querySelector('#sidebar nav');
    if (!main || !navRoot || document.getElementById('panel-hub-scan')) return;

    const HUBS = [
      {
        id: 'hub-scan',
        title: 'الفحص الأمني',
        desc: 'اختر أداة الفحص للتحقق من الروابط والملفات والرسائل المشبوهة.',
        icon: 'shield-check',
        items: [
          { tab: 'url', title: 'فحص الروابط', icon: 'link-2' },
          { tab: 'file', title: 'فحص الملفات', icon: 'file-text' },
          { tab: 'phish', title: 'كاشف رسائل النصب', icon: 'message-square-warning', full: true }
        ]
      },
      {
        id: 'hub-privacy',
        title: 'التشفير والخصوصية',
        desc: 'حماية البيانات وتشفير النصوص والصور وتنظيف بيانات الكاميرا محلياً.',
        icon: 'lock',
        items: [
          { tab: 'crypto', title: 'التشفير والأكواد', icon: 'code-2' },
          { tab: 'stego', title: 'إخفاء نص في صورة', icon: 'eye-off' },
          { tab: 'secret', title: 'رابط سري مشفّر', icon: 'send' },
          { tab: 'exif', title: 'منظّف خصوصية الصور', icon: 'image-off' }
        ]
      }
    ];

    function findSidebarBtn(tabKey) {
      const exact = navRoot.querySelector(`button[data-tab="${tabKey}"]`);
      if (exact) return exact;
      const all = Array.from(navRoot.querySelectorAll('button'));
      const aliases = {
        phish: ['phish', 'scam', 'نصب', 'احتيال'],
        secret: ['secret', 'رابط سري'],
        stego: ['stego', 'إخفاء'],
        exif: ['exif', 'منظّف', 'منظف', 'خصوصية الصور'],
        url: ['url', 'فحص الروابط'],
        file: ['file', 'فحص الملفات'],
        crypto: ['crypto', 'التشفير والأكواد']
      };
      const keys = aliases[tabKey] || [tabKey];
      return all.find(b => {
        const dt = (b.getAttribute('data-tab') || '').toLowerCase();
        const tx = (b.textContent || '').toLowerCase();
        if (dt.startsWith('hub-')) return false;
        return keys.some(k => dt.includes(k) || tx.includes(k));
      }) || null;
    }

    function openHub(hubId, hubTitle, hubBtn) {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b === hubBtn));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== `panel-${hubId}`));
      const pt = document.getElementById('page-title');
      if (pt) {
        const isEn = document.documentElement.lang === 'en' || document.documentElement.dir === 'ltr';
        pt.textContent = isEn && AR_TO_EN[hubTitle] ? AR_TO_EN[hubTitle] : hubTitle;
      }
      const sb = document.getElementById('sidebar');
      const bd = document.getElementById('sidebar-backdrop');
      if (sb && window.innerWidth < 1024) sb.classList.add(document.documentElement.dir === 'rtl' ? 'translate-x-full' : '-translate-x-full');
      if (bd) bd.classList.add('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    HUBS.forEach(hub => {
      hub.items.forEach(it => {
        const origBtn = findSidebarBtn(it.tab);
        if (origBtn) origBtn.classList.add('hidden');
      });
    });

    Array.from(navRoot.children).forEach(group => {
      if (group.tagName === 'DIV') {
        const visibleBtns = Array.from(group.querySelectorAll('button')).filter(b => !b.classList.contains('hidden'));
        if (visibleBtns.length === 0) group.classList.add('hidden');
      }
    });

    const toolsGroup = navRoot.querySelector('div:not(.hidden):last-of-type') || navRoot;
    const insertAnchor = toolsGroup.querySelector('button:not(.hidden)');

    HUBS.forEach(hub => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-tab', hub.id);
      btn.className = 'nav-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition';
      btn.innerHTML = `<i data-lucide="${hub.icon}" class="w-4 h-4 shrink-0"></i><span>${hub.title}</span>`;
      if (insertAnchor) toolsGroup.insertBefore(btn, insertAnchor);
      else toolsGroup.appendChild(btn);

      const sec = document.createElement('section');
      sec.id = `panel-${hub.id}`;
      sec.className = 'tab-panel hidden fade-in space-y-5 max-w-2xl mx-auto pt-2';

      const cardsHtml = hub.items.map(it => {
        if (it.full) {
          return `
            <button type="button" data-hub-go="${it.tab}" class="col-span-2 group w-full px-6 py-5 rounded-3xl bg-white dark:bg-[#0B1E1A] border border-slate-200 dark:border-teal-900/60 hover:border-teal-500 transition flex items-center justify-center gap-4 shadow-sm">
              <i data-lucide="${it.icon}" class="w-7 h-7 text-teal-600 dark:text-teal-400 shrink-0"></i>
              <span class="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition">${it.title}</span>
            </button>`;
        }
        return `
          <button type="button" data-hub-go="${it.tab}" class="group w-full p-6 min-h-[148px] rounded-3xl bg-white dark:bg-[#0B1E1A] border border-slate-200 dark:border-teal-900/60 hover:border-teal-500 transition flex flex-col items-center justify-between gap-5 shadow-sm text-center">
            <i data-lucide="${it.icon}" class="w-7 h-7 text-teal-600 dark:text-teal-400 mt-1"></i>
            <span class="text-base font-extrabold text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition leading-snug">${it.title}</span>
          </button>`;
      }).join('');

      sec.innerHTML = `
        <div class="text-center space-y-1.5 px-2">
          <h2 class="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">${hub.title}</h2>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">${hub.desc}</p>
        </div>
        <div class="grid grid-cols-2 gap-3.5 sm:gap-4">${cardsHtml}</div>
      `;
      main.appendChild(sec);

      btn.addEventListener('click', () => openHub(hub.id, hub.title, btn));

      sec.querySelectorAll('[data-hub-go]').forEach(card => {
        card.addEventListener('click', () => {
          const origBtn = findSidebarBtn(card.getAttribute('data-hub-go'));
          if (origBtn) origBtn.click();
        });
      });
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();

    applyExtraTranslations();
    const obs = new MutationObserver(() => setTimeout(applyExtraTranslations, 30));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });
  }

  window.addEventListener('load', () => setTimeout(initNavHubs, 60));
})();
