import { requireLogin } from '../lib/auth.js';
import { validDato, validFil, readIndex, writeIndex } from '../lib/rawstore.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireLogin(req, res)) return;

  if (req.method === 'GET') {
    const { dato } = req.query;
    if (!validDato(dato)) return res.status(400).json({ error: 'Ugyldig dato.' });
    const idx = await readIndex(dato);
    if (!idx) return res.status(404).json({ error: 'Ingen rådata for denne natta.' });
    return res.json(idx);
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    if (!validDato(b.dato) || !Array.isArray(b.filer) || !Array.isArray(b.okter)) return res.status(400).json({ error: 'Ugyldig natt.' });
    const filer = b.filer
      .filter((f) => f && validFil(f.navn) && Number.isInteger(f.deler) && f.deler > 0 && f.deler <= 20)
      .map((f) => ({ navn: f.navn, storrelse: Number(f.storrelse) || 0, deler: f.deler }));
    const okter = b.okter
      .filter((o) => o && typeof o.id === 'string' && isFinite(o.start) && isFinite(o.slutt))
      .map((o) => ({ id: o.id.slice(0, 20), start: o.start, slutt: o.slutt }));
    await writeIndex(b.dato, { dato: b.dato, filer, okter, importert: new Date().toISOString() });
    return res.json({ ok: true });
  }

  res.status(405).end();
}
