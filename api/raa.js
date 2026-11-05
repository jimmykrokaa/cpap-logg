import { requireLogin } from '../lib/auth.js';
import { validDato, validFil, putPart, getPart } from '../lib/rawstore.js';

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (req.body instanceof Uint8Array) return Buffer.from(req.body);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireLogin(req, res)) return;
  const { dato, fil } = req.query;
  const del = Number(req.query.del);
  if (!validDato(dato) || !validFil(fil) || !Number.isInteger(del) || del < 0 || del > 20) {
    return res.status(400).json({ error: 'Ugyldig fil.' });
  }
  if (req.method === 'GET') {
    const buf = await getPart(dato, fil, del);
    if (!buf) return res.status(404).json({ error: 'Fila finnes ikke.' });
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.end(buf);
  }
  if (req.method === 'POST') {
    const buf = await rawBody(req);
    if (!buf.length || buf.length > 4 * 1024 * 1024) return res.status(400).json({ error: 'Ugyldig filstørrelse.' });
    await putPart(dato, fil, del, buf);
    return res.json({ ok: true, storrelse: buf.length });
  }
  res.status(405).end();
}
