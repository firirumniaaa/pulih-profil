/* ============================================================================
   KLAIM QUEST OTOMATIS — bookmarklet v1 (1 Okt 2026)
   ----------------------------------------------------------------------------
   Jalankan di browser yang sudah login Discord (discord.com/app).

   CARA KERJA (persis seperti klien Discord sendiri):
     1. Ambil token + X-Super-Properties + X-Fingerprint dari klien yang terbuka
        (jadi request-nya "asli" dari akunmu, bukan dari server).
     2. Baca /quests/@me -> cari quest yang SELESAI tapi BELUM diklaim.
     3. POST /quests/{id}/claim-reward  body: {platform, location, metadata_sealed:null, traffic_metadata_sealed:null}
     4. Kalau Discord minta captcha: tampilkan hCaptcha SEKALI di layar (kamu klik),
        lalu token captcha dipakai ulang ke quest-quest berikutnya lewat header:
           X-Captcha-Key / X-Captcha-Rqtoken / X-Captcha-Session-Id
        (ini cara klien resmi mengirim jawaban captcha — bukan jasa pemecah captcha)

   CATATAN: ini otomatisasi pada akunmu sendiri. Pakai wajar (jangan spam).
   Kalau banyak ⚠️, hentikan dan klaim manual di app.
   ========================================================================== */
(async () => {
  const LOG = [];
  const out = (s) => { LOG.push(s); console.log(s); };
  out('=== KLAIM QUEST OTOMATIS ===');

  /* ---------- 1. ambil identitas klien ---------- */
  const mods = [];
  try {
    let req = null;
    window.webpackChunkdiscord_app.push([[Math.random()], {}, (e) => { req = e; }]);
    const c = (req && req.c) || {};
    for (const id in c) { try { if (c[id] && c[id].exports) mods.push(c[id].exports); } catch (e) {} }
  } catch (e) {}
  const defaults = mods.map((m) => m && m.default).filter(Boolean);
  const cari = (uji) => { for (const d of defaults) { try { if (uji(d)) return d; } catch (e) {} } return null; };

  const usr = cari((d) => typeof d.getToken === 'function');
  let token = usr ? usr.getToken() : null;
  if (!token) { try { token = JSON.parse(localStorage.getItem('token') || 'null'); } catch (e) {} }
  if (!token) token = prompt('Token Discord tidak bisa diambil otomatis. Tempel token:');
  if (!token) return alert('Dibatalkan (token kosong).');

  const spMod = cari((d) => typeof d.getSuperPropertiesBase64 === 'function');
  const fpMod = cari((d) => typeof d.getFingerprint === 'function');
  const SP = spMod ? spMod.getSuperPropertiesBase64() : null;
  const FP = fpMod ? fpMod.getFingerprint() : null;
  out('Klien terbaca: token ' + (token ? 'ok' : 'x') + ' | super-properties ' + (SP ? 'ok' : 'x') + ' | fingerprint ' + (FP ? 'ok' : 'x'));

  /* ---------- 2. alat panggil API ---------- */
  const HARF = { authorization: token, 'content-type': 'application/json' };
  if (SP) HARF['x-super-properties'] = SP;
  if (FP) HARF['x-fingerprint'] = FP;

  const api = async (method, path, body, tambahan) => {
    const r = await fetch('/api/v9' + path, {
      method,
      headers: Object.assign({}, HARF, tambahan || {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    let j = null;
    try { j = await r.json(); } catch (e) {}
    return { status: r.status, ok: r.ok, body: j };
  };

  /* ---------- 3. daftar quest yang siap diklaim ---------- */
  const q = await api('GET', '/quests/@me');
  if (!q.ok) return alert('Gagal baca daftar quest (HTTP ' + q.status + '): ' + JSON.stringify(q.body).slice(0, 200));
  const semua = (q.body && (q.body.quests || q.body)) || [];
  const siap = [];
  for (const it of semua) {
    const us = it.user_status || it.userStatus || {};
    const id = it.id || it.quest_id || us.quest_id;
    const selesai = !!(us.completed_at || us.completedAt);
    const diklaim = !!(us.claimed_at || us.claimedAt);
    const kadaluarsa = it.config && it.config.expires_at && new Date(it.config.expires_at).getTime() < Date.now();
    if (id && selesai && !diklaim && !kadaluarsa) {
      siap.push({ id, nama: (it.config && it.config.messages && it.config.messages.quest_name) || it.id || id });
    }
  }
  out('Quest selesai & belum diklaim: ' + siap.length);
  if (!siap.length) { alert('Tidak ada quest yang perlu diklaim.\n\n' + LOG.join('\n')); return; }

  /* ---------- 4. hCaptcha sekali (kalau Discord minta) ---------- */
  const muatSkrip = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
  async function selesaikanCaptcha(b) {
    if (!window.hcaptcha) {
      try { await muatSkrip('https://js.hcaptcha.com/1/api.js?render=explicit'); } catch (e) {}
      await new Promise((r) => setTimeout(r, 800));
    }
    if (!window.hcaptcha) { out('⚠️ hCaptcha tidak bisa dimuat (mungkin diblokir ekstensi).'); return null; }
    return await new Promise((res) => {
      const bg = document.createElement('div');
      bg.style.cssText = 'position:fixed;inset:0;background:#000b;z-index:999999;display:flex;align-items:center;justify-content:center';
      const box = document.createElement('div');
      box.style.cssText = 'background:#fff;color:#111;padding:18px;border-radius:14px;font:14px system-ui;max-width:440px;box-shadow:0 20px 60px #0008';
      box.innerHTML = '<div style="font-weight:800;margin-bottom:8px">Discord minta captcha — sekali saja</div>' +
        '<div style="color:#555;margin-bottom:10px">Setelah ini, quest berikutnya dipakai ulang otomatis.</div>' +
        '<div id="hc-celah" style="display:flex;justify-content:center"></div>' +
        '<button id="hc-batal" style="margin-top:12px;width:100%;padding:8px;border:0;border-radius:8px;background:#eee;cursor:pointer">Batal</button>';
      bg.appendChild(box); document.body.appendChild(bg);
      const bersih = () => { try { bg.remove(); } catch (e) {} };
      try {
        window.hcaptcha.render('hc-celah', {
          sitekey: b.captcha_sitekey,
          rqdata: b.captcha_rqdata || undefined,
          callback: (tk) => { bersih(); res({ key: tk, rqtoken: b.captcha_rqtoken, session: b.captcha_session_id }); },
        });
      } catch (e) { out('⚠️ render captcha gagal: ' + e.message); bersih(); res(null); }
      document.getElementById('hc-batal').onclick = () => { bersih(); res(null); };
    });
  }

  /* ---------- 5. klaim satu per satu ---------- */
  const isi = { platform: 0, location: 11, metadata_sealed: null, traffic_metadata_sealed: null };
  let capHdr = null, jumlahCaptcha = 0, sukses = 0, gagal = 0;

  const klaim = async (id) => {
    let r = await api('POST', '/quests/' + id + '/claim-reward', isi, capHdr);
    const mintaCaptcha = r.status === 400 && r.body && (r.body.captcha_sitekey || r.body.captcha_key);
    if (mintaCaptcha) {
      if (jumlahCaptcha >= 2) return { status: r.status, body: r.body, catatan: 'captcha lagi (dilewati)' };
      const sol = await selesaikanCaptcha(r.body);
      if (!sol) return { status: 0, body: null, catatan: 'captcha dibatalkan' };
      jumlahCaptcha++;
      capHdr = { 'x-captcha-key': sol.key };
      if (sol.rqtoken) capHdr['x-captcha-rqtoken'] = sol.rqtoken;
      if (sol.session) capHdr['x-captcha-session-id'] = sol.session;
      // ulang request yang sama dengan header captcha (persis cara klien Discord)
      r = await api('POST', '/quests/' + id + '/claim-reward', isi, capHdr);
    }
    // MFA (kalau diminta) — tidak diotomatiskan
    if (r.status === 401 && r.body && r.body.code === 60003) {
      return { status: r.status, body: r.body, catatan: 'butuh MFA (klaim manual di app)' };
    }
    return r;
  };

  for (const s of siap) {
    let r;
    try { r = await klaim(s.id); } catch (e) { r = { status: 0, body: { error: e.message } }; }
    const ok = r.status === 200 || r.status === 204;
    if (ok) { sukses++; out('✅ ' + s.nama + ' — terklaim'); }
    else {
      gagal++;
      const pesan = r.catatan || (r.body && (r.body.message || JSON.stringify(r.body).slice(0, 110))) || ('HTTP ' + r.status);
      out('⚠️ ' + s.nama + ' — ' + pesan);
      if (r.status === 401) break; // sesi bermasalah, stop
    }
    await new Promise((r2) => setTimeout(r2, 1200)); // jeda sopan
  }

  out('--- selesai: ' + sukses + ' terklaim, ' + gagal + ' gagal (captcha diminta ' + jumlahCaptcha + 'x) ---');
  alert('KLAIM QUEST OTOMATIS\n\n' + LOG.slice(1).join('\n'));
})();
