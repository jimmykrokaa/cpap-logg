import crypto from 'node:crypto';

const COOKIE = 'cpap_sesjon';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dager

function secret() {
  const s = process.env.SESSION_SECRET || process.env.APP_PASSWORD;
  if (!s) throw new Error('APP_PASSWORD er ikke satt');
  return crypto.createHash('sha256').update('cpap-logg:' + s).digest();
}

const sign = (v) => crypto.createHmac('sha256', secret()).update(v).digest('base64url');

export function passwordMatches(input) {
  const want = process.env.APP_PASSWORD || '';
  if (!want || typeof input !== 'string') return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(want).digest();
  return crypto.timingSafeEqual(a, b);
}

export function setSession(res) {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  res.setHeader('Set-Cookie', `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`);
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export function isLoggedIn(req) {
  const raw = req.headers.cookie || '';
  const m = raw.split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (!m) return false;
  const [exp, sig] = m.slice(COOKIE.length + 1).split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const good = sign(exp);
  return good.length === sig.length && crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig));
}

export function requireLogin(req, res) {
  if (isLoggedIn(req)) return true;
  res.status(401).json({ error: 'Ikke logget inn' });
  return false;
}
