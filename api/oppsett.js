import { requireLogin } from '../lib/auth.js';
import { readJson, writeJson } from '../lib/rawstore.js';

const PATH = 'cpap/oppsett.json';
const VISNINGER = ['enkel', 'avansert', 'egen'];
const ID = /^[a-z0-9-]{1,40}$/;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireLogin(req, res)) return;

  if (req.method === 'GET') return res.json(await readJson(PATH, { visning: 'enkel', moduler: null, tid: { modus: 'fast', timer: 2 } }));

  if (req.method === 'POST') {
    const b = req.body || {};
    const visning = VISNINGER.includes(b.visning) ? b.visning : 'enkel';
    const moduler = Array.isArray(b.moduler) ? [...new Set(b.moduler.filter((m) => typeof m === 'string' && ID.test(m)))].slice(0, 50) : null;
    const eksisterende = await readJson(PATH, {});
    const t = b.tid;
    const tid = t && ['fast', 'oslo', 'egen'].includes(t.modus) ? { modus: t.modus, timer: Math.max(-12, Math.min(14, Number(t.timer) || 0)) } : eksisterende.tid || { modus: 'fast', timer: 2 };
    const data = { visning, moduler, tid, endret: new Date().toISOString() };
    await writeJson(PATH, data);
    return res.json(data);
  }

  res.status(405).end();
}
