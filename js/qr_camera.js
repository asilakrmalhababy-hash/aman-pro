(function () {
  function initQrCamera() {
    const drop = document.getElementById('qr-dropzone');
    if (!drop || document.getElementById('btn-qr-cam')) return;
    const wrap = document.createElement('div');
    wrap.className = 'space-y-3';
    wrap.innerHTML = `
      <button id="btn-qr-cam" type="button" class="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition flex items-center justify-center gap-2"><i data-lucide="camera" class="w-4 h-4"></i><span>مسح باركود بالكاميرا الحية</span></button>
      <div id="qr-cam-box" class="hidden relative rounded-2xl overflow-hidden bg-black border border-teal-500/40">
        <video id="qr-video" playsinline class="w-full max-h-64 object-cover"></video>
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center"><div class="w-44 h-44 border-2 border-teal-400 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"></div></div>
        <button id="btn-qr-cam-stop" type="button" class="absolute top-2.5 left-2.5 px-3 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold">إيقاف</button>
      </div>`;
    drop.parentNode.insertBefore(wrap, drop);

    let stream = null, rafId = null;
    const video = document.getElementById('qr-video'), camBox = document.getElementById('qr-cam-box');
    function stopCam() { if (rafId) cancelAnimationFrame(rafId); rafId = null; if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } camBox.classList.add('hidden'); }
    function scanLoop() {
      if (!stream || video.readyState !== video.HAVE_ENOUGH_DATA) { rafId = requestAnimationFrame(scanLoop); return; }
      const c = document.getElementById('qr-decode-canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
      const ctx = c.getContext('2d'); ctx.drawImage(video, 0, 0, c.width, c.height);
      if (typeof jsQR !== 'undefined') {
        const img = ctx.getImageData(0, 0, c.width, c.height), code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) {
          stopCam();
          document.getElementById('qr-scan-result').classList.remove('hidden');
          document.getElementById('qr-decoded-text').textContent = code.data;
          const sendBtn = document.getElementById('btn-qr-send-url');
          const isUrl = /^https?:\/\//i.test(code.data) || /^[a-z0-9.-]+\.[a-z]{2,}/i.test(code.data);
          sendBtn.classList.toggle('hidden', !isUrl);
          sendBtn.onclick = () => { const ui = document.getElementById('url-input'); if (ui) ui.value = code.data; const nu = document.querySelector('[data-tab="url"]'); if (nu) nu.click(); const f = document.getElementById('url-form'); if (f) f.dispatchEvent(new Event('submit', { cancelable: true })); };
          return;
        }
      }
      rafId = requestAnimationFrame(scanLoop);
    }
    document.getElementById('btn-qr-cam').addEventListener('click', async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); video.srcObject = stream; await video.play(); camBox.classList.remove('hidden'); rafId = requestAnimationFrame(scanLoop); } catch (e) { stopCam(); }
    });
    document.getElementById('btn-qr-cam-stop').addEventListener('click', stopCam);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initQrCamera); else initQrCamera();
})();
