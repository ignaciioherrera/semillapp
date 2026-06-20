// Función de sincronización de SemillApp (Vercel Serverless + Vercel Blob)
// Estrategia: cada POST crea un blob NUEVO (URL única) para evitar el caché del CDN
// al sobrescribir. El GET lee siempre el blob más reciente. Los viejos se borran.
const { put, list, del } = require('@vercel/blob');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const code = String((req.query && req.query.code) || '').trim();
    if (code.length < 6) return res.status(400).json({ error: 'codigo_invalido' });
    const prefix = 'ws-' + encodeURIComponent(code) + '/';

    if (req.method === 'GET') {
      const { blobs } = await list({ prefix });
      if (!blobs || !blobs.length) return res.status(200).json({ data: null });
      blobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      const r = await fetch(blobs[0].url, { cache: 'no-store' });
      const text = await r.text();
      let data = null; try { data = JSON.parse(text); } catch (e) { data = null; }
      return res.status(200).json({ data });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ error: 'json_invalido' }); } }
      if (!body || typeof body !== 'object') return res.status(400).json({ error: 'sin_datos' });
      const json = JSON.stringify(body);
      const blob = await put(prefix + 'd.json', json, { access: 'public', contentType: 'application/json', addRandomSuffix: true, cacheControlMaxAge: 0 });
      // limpieza de versiones anteriores (deja solo la recién creada)
      try {
        const { blobs } = await list({ prefix });
        const viejos = (blobs || []).filter(b => b.url !== blob.url).map(b => b.url);
        if (viejos.length) await del(viejos);
      } catch (e) { /* la limpieza es best-effort */ }
      return res.status(200).json({ ok: true, ts: body._ts || null });
    }

    return res.status(405).json({ error: 'metodo_no_permitido' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
