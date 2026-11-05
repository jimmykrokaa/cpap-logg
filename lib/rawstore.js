import { get, put, del, list } from '@vercel/blob';

export const PART_SIZE = 3 * 1024 * 1024; // under Vercels grense på 4,5 MB per forespørsel
const DATO = /^\d{4}-\d{2}-\d{2}$/;
const FIL = /^\d{8}_\d{6}_(BRP|PLD|EVE|SA2|CSL)\.edf$/i;

export const validDato = (d) => typeof d === 'string' && DATO.test(d);
export const validFil = (f) => typeof f === 'string' && (FIL.test(f) || /^natt-(liten|kurve)\.bin$/.test(f));

const partKey = (dato, fil, del) => `cpap/raa/${dato}/${fil}.${del}`;
const indexKey = (dato) => `cpap/raa/${dato}/index.json`;

export async function putPart(dato, fil, del, buf) {
  await put(partKey(dato, fil, del), buf, {
    access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/octet-stream'
  });
}

export async function getPart(dato, fil, del) {
  const r = await get(partKey(dato, fil, del), { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return Buffer.from(await new Response(r.stream).arrayBuffer());
}

export async function readJson(path, fallback) {
  const r = await get(path, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return fallback;
  return JSON.parse(await new Response(r.stream).text());
}

export async function writeJson(path, data) {
  await put(path, JSON.stringify(data), {
    access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json'
  });
}

export const readIndex = (dato) => readJson(indexKey(dato), null);
export const writeIndex = (dato, data) => writeJson(indexKey(dato), data);

// Fjerner enkeltfilene fra det gamle formatet når en natt er lastet opp som pakker
export async function removeLooseFiles(dato) {
  const r = await list({ prefix: `cpap/raa/${dato}/`, limit: 1000 });
  const old = r.blobs.map((b) => b.pathname).filter((p) => !/\/natt-(liten|kurve)\.bin\.\d+$/.test(p));
  if (old.length) await del(old);
}
