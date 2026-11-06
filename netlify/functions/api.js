// Netlify-funksjon som tar imot alle kall til /api/* og sender dem videre til handlerne i api/.
// Handlerne er skrevet i Vercel-stil (req, res), så her lages en liten req/res-oversetter.
import login from '../../api/login.js';
import logout from '../../api/logout.js';
import natt from '../../api/natt.js';
import netter from '../../api/netter.js';
import oppsett from '../../api/oppsett.js';
import raa from '../../api/raa.js';
import session from '../../api/session.js';
import tolk from '../../api/tolk.js';

const ROUTES = { login, logout, natt, netter, oppsett, raa, session, tolk };

async function makeReq(request, url) {
  const headers = Object.fromEntries(request.headers);
  let body;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const buf = Buffer.from(await request.arrayBuffer());
    if ((headers['content-type'] || '').includes('application/json')) {
      try { body = buf.length ? JSON.parse(buf.toString('utf8')) : {}; } catch { body = {}; }
    } else {
      body = buf;
    }
  }
  return { method: request.method, url: url.pathname + url.search, headers, query: Object.fromEntries(url.searchParams), body };
}

function makeRes() {
  const res = {
    statusCode: 200, headers: new Headers(), body: null,
    status(code) { res.statusCode = code; return res; },
    setHeader(k, v) { res.headers.set(k, String(v)); return res; },
    json(data) { if (!res.headers.has('content-type')) res.headers.set('content-type', 'application/json; charset=utf-8'); res.body = JSON.stringify(data); return res; },
    end(data) { if (data != null) res.body = data; return res; }
  };
  return res;
}

export default async (request) => {
  const url = new URL(request.url);
  const name = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const handler = ROUTES[name];
  if (!handler) return Response.json({ error: 'Finnes ikke' }, { status: 404 });
  const res = makeRes();
  try {
    await handler(await makeReq(request, url), res);
  } catch (e) {
    console.error(name, e);
    return Response.json({ error: 'Serverfeil' }, { status: 500 });
  }
  return new Response(res.body, { status: res.statusCode, headers: res.headers });
};

export const config = { path: '/api/*' };
