import { get, put, del, list } from '@vercel/blob';

const PATH = 'cpap/netter.json';
const MARKER = 'cpap/v3.json';
export const FIELDS = ['ahi', 'timer', 'okter', 'sentrale', 'obstruktive', 'hypopneer', 'uklassifisert', 'rera',
  'trykkSnitt', 'trykkMin', 'trykkMaks', 'trykk90', 'lekkasjeSnitt', 'lekkasjeMaks', 'lekkasje90',
  'spo2Snitt', 'spo2Min', 'pulsSnitt', 'oppvakninger', 'maskeTrykk', 'eprTrykk', 'pustefrekvens', 'tidevolum',
  'minuttventilasjon', 'snorking', 'flowbegrensning', 'flowbegrensning90', 'avbrudd', 'avbruddLange', 'pauseMin', 'lekkasjeStor', 'sv'];

// Når MARKER endres, slettes alt som er lagret (unntatt visningsoppsettet) første gang appen åpnes etterpå.
async function cleanupOnce() {
  const m = await get(MARKER, { access: 'private', useCache: false });
  if (m && m.statusCode === 200) return;
  let cursor;
  do {
    const r = await list({ prefix: 'cpap/', cursor, limit: 1000 });
    const old = r.blobs.map((b) => b.pathname).filter((p) => p !== 'cpap/oppsett.json' && p !== MARKER);
    if (old.length) await del(old);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  await put(MARKER, JSON.stringify({ ryddet: new Date().toISOString() }), {
    access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json'
  });
}

export async function readStore() {
  await cleanupOnce();
  const r = await get(PATH, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return { netter: {}, importer: [] };
  const data = JSON.parse(await new Response(r.stream).text());
  return { netter: data.netter || {}, importer: data.importer || [] };
}

export async function writeStore(data) {
  await put(PATH, JSON.stringify(data), {
    access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json'
  });
}

export function sortedNights(store) {
  return Object.values(store.netter).sort((a, b) => (a.dato < b.dato ? -1 : 1));
}
