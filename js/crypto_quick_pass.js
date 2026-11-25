(function () {
  function genStrongPass(len) {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const nums = '23456789';
    const syms = '!@#$%^&*_-+=';
    const all = upper + lower + nums + syms;
    const arr = new Uint32Array(len);
    crypto.getRandomValues(arr);
    const out = [
      upper[arr[0] % upper.length],
      lower[arr[1] % lower.length],
      nums[arr[2] % nums.length],
      syms[arr[3] % syms.length]
    ];
    for (let i = 4; i < len; i++) out.push(all[arr[i] % all.length]);
    for (let i = out.length - 1; i > 0; i--) {
      const r = new Uint32Array(1);
      crypto.getRandomValues(r);
      const j = r[0] % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out.join('');
  }

  function showMiniToast(msg) {
    let t = document.getElementById('aman-quick-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'aman-quick-toast';
      t.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-2xl bg-teal-600 text-white text-xs sm:text-sm font-bold shadow-xl transition-opacity duration-300 pointer-events-none text-center whitespace-nowrap';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._tm);
    t._tm = setTimeout(() => { t.style.opacity = '0'; }, 3800);
  }

  function attachQuickBtn(inp) {
    if (!inp || inp.dataset.qpAttached) return;
    inp.dataset.qpAttached = '1';
    const wrap = document.createElement('div');
    wrap.className = 'flex items-center justify-between mb-1.5 px-1';
    const isEn = document.documentElement.lang === 'en' || document.documentElement.dir === 'ltr';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11px] font-bold bg-teal-500/15 text-teal-600 dark:text-teal-300 hover:bg-teal-500/25 transition';
    btn.textContent = isEn ? '⚡ Generate Strong Password' : '⚡ إنشاء كلمة سر قوية';
    btn.addEventListener('click', async () => {
      const pw = genStrongPass(18);
      inp.value = pw;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      try { await navigator.clipboard.writeText(pw); } catch (_) {}
      const en = document.documentElement.lang === 'en' || document.documentElement.dir === 'ltr';
      showMiniToast(en ? '✓ Strong password generated & copied!' : '✓ تم إنشاء كلمة سر قوية ونسخها للحافظة!');
    });
    const lbl = document.createElement('span');
    lbl.className = 'text-[11px] text-slate-400';
    lbl.textContent = isEn ? 'Encryption Key' : 'مفتاح التشفير';
    wrap.appendChild(lbl);
    wrap.appendChild(btn);
    inp.parentNode.insertBefore(wrap, inp);
  }

  function initQuickPass() {
    const panel = document.getElementById('panel-crypto');
    if (!panel) return;
    panel.querySelectorAll('input[type="password"]').forEach(attachQuickBtn);
    if (!panel.querySelector('input[type="password"]')) {
      panel.querySelectorAll('input').forEach(i => {
        if ((i.placeholder || '').includes('كلمة') || (i.placeholder || '').toLowerCase().includes('pass')) attachQuickBtn(i);
      });
    }
  }

  window.addEventListener('load', () => setTimeout(initQuickPass, 120));
})();
