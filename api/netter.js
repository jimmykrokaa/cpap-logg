import { requireLogin } from '../lib/auth.js';
import { readStore, writeStore, sortedNights, FIELDS } from '../lib/store.js';
import { removeLooseFiles } from '../lib/rawstore.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function clean(row) {
  if (!row || typeof row !== 'object' || !ISO.test(row.dato)) return null;
  const out = { dato: row.dato };
  for (const f of FIELDS) {
    const v = row[f];
    out[f] = typeof v === 'number' && isFinite(v) ? v : null;
  }
  if (out.ahi == null && !out.timer) return null;
  if (row.raa !== true) return null; // bare rådata fra SD-kortet tas imot
  out.raa = true;
  if (typeof row.filer === 'string') out.filer = row.filer.slice(0, 8000);
  const b = row.bunter;
  if (b && Number.isInteger(b.liten) && b.liten > 0 && b.liten <= 20) {
    out.bunter = { liten: b.liten };
    if (Number.isInteger(b.kurve) && b.kurve > 0 && b.kurve <= 20) out.bunter.kurve = b.kurve;
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireLogin(req, res)) return;

  if (req.method === 'GET') {
    const store = await readStore();
    return res.json({ netter: sortedNights(store), sisteImport: store.importer[store.importer.length - 1] || null });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const rows = Array.isArray(body.rader) ? body.rader.map(clean).filter(Boolean) : [];
    if (!rows.length) return res.status(400).json({ error: 'Fant ingen gyldige netter i fila.' });
    if (rows.length > 5000) return res.status(400).json({ error: 'For mange rader i én fil.' });
    const fil = String(body.fil || '').slice(0, 120);
    const store = await readStore();
    const stamp = new Date().toISOString();
    let nye = 0, oppdatert = 0, hoppetOver = 0;
    const seen = new Set();
    const ryddes = [];
    for (const r of rows) {
      if (seen.has(r.dato)) continue;
      seen.add(r.dato);
      // Klienten sender bare netter som er nye eller har endrede filer på kortet
      if (store.netter[r.dato] && store.netter[r.dato].filer === r.filer && store.netter[r.dato].bunter && store.netter[r.dato].sv === r.sv) { hoppetOver++; continue; }
      if (store.netter[r.dato]) oppdatert++; else nye++;
      if (r.bunter && !(store.netter[r.dato] && store.netter[r.dato].bunter)) ryddes.push(r.dato);
      store.netter[r.dato] = { ...r, importert: stamp, kilde: fil };
    }
    const datoer = [...seen].sort();
    const logg = { at: stamp, fil, nye, oppdatert, hoppetOver, fra: datoer[0], til: datoer[datoer.length - 1] };
    if (nye || oppdatert) {
      store.importer = [...store.importer, logg].slice(-200);
      await writeStore(store);
      await Promise.all(ryddes.map((d) => removeLooseFiles(d).catch(() => {})));
    }
    return res.json(logg);
  }

  res.status(405).end();
}
