import { getStore } from '@netlify/blobs';

// Netlify Blobs. Én butikk for hele appen, med sterk konsistens så det som nettopp er skrevet kan leses med en gang.
const store = () => getStore({ name: 'cpap-logg', consistency: 'strong' });

export async function getBuffer(key) {
  const ab = await store().get(key, { type: 'arrayBuffer' });
  return ab ? Buffer.from(ab) : null;
}

export async function getJson(key) {
  return store().get(key, { type: 'json' });
}

export async function putBuffer(key, buf) {
  // Kopier til en egen ArrayBuffer (Buffer kan dele et større minneområde)
  await store().set(key, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

export async function putJson(key, data) {
  await store().setJSON(key, data);
}

export async function listKeys(prefix) {
  const { blobs } = await store().list({ prefix });
  return blobs.map((b) => b.key);
}

export async function removeKeys(keys) {
  await Promise.all(keys.map((k) => store().delete(k)));
}
