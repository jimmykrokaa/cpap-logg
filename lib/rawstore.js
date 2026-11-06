import { getBuffer, getJson, putBuffer, putJson, listKeys, removeKeys } from './blob.js';

export const PART_SIZE = 3 * 1024 * 1024; // under Netlifys grense på 6 MB per forespørsel
const DATO = /^\d{4}-\d{2}-\d{2}$/;
const FIL = /^\d{8}_\d{6}_(BRP|PLD|EVE|SA2|CSL)\.edf$/i;

export const validDato = (d) => typeof d === 'string' && DATO.test(d);
export const validFil = (f) => typeof f === 'string' && (FIL.test(f) || /^natt-(liten|kurve)\.bin$/.test(f));

const partKey = (dato, fil, del) => `cpap/raa/${dato}/${fil}.${del}`;
const indexKey = (dato) => `cpap/raa/${dato}/index.json`;

export const putPart = (dato, fil, del, buf) => putBuffer(partKey(dato, fil, del), buf);
export const getPart = (dato, fil, del) => getBuffer(partKey(dato, fil, del));

export async function readJson(path, fallback) {
  const v = await getJson(path);
  return v == null ? fallback : v;
}

export const writeJson = (path, data) => putJson(path, data);

export const readIndex = (dato) => readJson(indexKey(dato), null);
export const writeIndex = (dato, data) => writeJson(indexKey(dato), data);

// Fjerner enkeltfilene fra det gamle formatet når en natt er lastet opp som pakker
export async function removeLooseFiles(dato) {
  const keys = await listKeys(`cpap/raa/${dato}/`);
  const old = keys.filter((p) => !/\/natt-(liten|kurve)\.bin\.\d+$/.test(p) && !p.endsWith('/index.json'));
  if (old.length) await removeKeys(old);
}
