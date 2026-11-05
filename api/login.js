import { passwordMatches, setSession } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const ok = passwordMatches(req.body && req.body.passord);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 800));
    return res.status(401).json({ error: 'Feil passord' });
  }
  setSession(res);
  res.json({ ok: true });
}
