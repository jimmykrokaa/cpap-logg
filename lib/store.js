import { getJson, putJson, listKeys, removeKeys } from './blob.js';

const PATH = 'cpap/netter.json';
const MARKER = 'cpap/v3.json';
export const FIELDS = ['ahi', 'timer', 'okter', 'sentrale', 'obstruktive', 'hypopneer', 'uklassifisert', 'rera',
  'trykkSnitt', 'trykkMin', 'trykkMaks', 'trykk90', 'lekkasjeSnitt', 'lekkasjeMaks', 'lekkasje90',
  'spo2Snitt', 'spo2Min', 'pulsSnitt', 'oppvakninger', 'maskeTrykk', 'eprTrykk', 'pustefrekvens', 'tidevolum',
  'minuttventilasjon', 'snorking', 'flowbegrensning', 'flowbegrensning90', 'avbrudd', 'avbruddLange', 'pauseMin', 'lekkasjeStor', 'sv'];

// Når MARKER endres, slettes alt som er lagret (unntatt visningsoppsettet) første gang appen åpnes etterpå.
async function cleanupOnce() {
  if (await getJson(MARKER)) return;
  const old = (await listKeys('cpap/')).filter((p) => p !== 'cpap/oppsett.json' && p !== MARKER);
  if (old.length) await removeKeys(old);
  await putJson(MARKER, { ryddet: new Date().toISOString() });
}

export async function readStore() {
  await cleanupOnce();
  const data = await getJson(PATH);
  if (!data) return { netter: {}, importer: [] };
  return { netter: data.netter || {}, importer: data.importer || [] };
}

export async function writeStore(data) {
  await putJson(PATH, data);
}

export function sortedNights(store) {
  return Object.values(store.netter).sort((a, b) => (a.dato < b.dato ? -1 : 1));
}
