import { isLoggedIn } from '../lib/auth.js';
import { readJson } from '../lib/rawstore.js';
import { aiAvailable } from './tolk.js';

// Leser én liten fil for å sjekke at lagringen (Netlify Blobs) svarer. Skriver ingenting.
async function lagringOk() {
  try { await readJson('cpap/oppsett.json', null); return true; } catch (e) { console.error('Lagring', e); return false; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ innlogget: isLoggedIn(req), ai: aiAvailable(), lagring: await lagringOk() });
}
