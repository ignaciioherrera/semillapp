// Función de sincronización de SemillApp (Vercel Serverless + Vercel Blob)
// GET  /api/data?code=XXXX        -> { data: <objeto o null> }
// POST /api/data?code=XXXX  body  -> guarda el objeto; { ok:true }
const { put, list } = require('@vercel/blob');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const code = String((req.query && req.query.code) || '').trim();
    if (code.length < 6) return res.status(400).json({ error: 'codigo_invalido' });
    const path = 'ws-' + encodeURIComponent(code) + '.json';

    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: path, limit: 1 });
      const hit = blobs && blobs.find(b => b.pathname === path);
      if (!hit) return res.status(200).json({ data: null });
      // cache-buster para evitar que el CDN devuelva una versión vieja tras sobrescribir
      const sep = hit.url.indexOf('?') >= 0 ? '&' : '?';
      const r = await fetch(hit.url + sep + '_=' + Date.now(), { cache: 'no-store' });
      const text = await r.text();
      let data = null; try { data = JSON.parse(text); } catch (e) { data = null; }
      return res.status(200).json({ data });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ error: 'json_invalido' }); } }
      if (!body || typeof body !== 'object') return res.status(400).json({ error: 'sin_datos' });
      const json = JSON.stringify(body);
      // cacheControlMaxAge: 0 => el blob no se cachea, así las lecturas ven los cambios al instante
      await put(path, json, { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0 });
      return res.status(200).json({ ok: true, ts: body._ts || null });
    }

    return res.status(405).json({ error: 'metodo_no_permitido' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
