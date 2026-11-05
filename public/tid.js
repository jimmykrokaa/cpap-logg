'use strict';
/* global S, el, $, api, CPAPEDF, render, clock, dlg */
// Maskinen skriver klokkeslett uten tidssone. Her regnes de om til norsk tid (Europe/Oslo) etter innstillingen «Maskinens klokke».
// modus: 'fast' = maskinen står fast på sommertid (UTC+2), 'oslo' = maskinen følger norsk tid, 'egen' = fast forskyvning fra UTC.
const TID_STANDARD = { modus: 'fast', timer: 2 };
S.tid = { ...TID_STANDARD };
let tidLastet = null;

const osloFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Oslo', timeZoneName: 'shortOffset', hour: 'numeric' });
function osloForskyvning(utcMs) {
  const p = osloFmt.formatToParts(new Date(utcMs)).find((x) => x.type === 'timeZoneName');
  const m = p && p.value.match(/GMT([+-]\d+)?(?::(\d+))?/);
  return m ? Number(m[1] || 0) + (m[2] ? Math.sign(Number(m[1] || 0)) * Number(m[2]) / 60 : 0) : 1;
}

// Antall sekunder klokkeslettene for natta skal flyttes for å bli norsk tid
function tidSkift(dato, startSek) {
  const t = S.tid;
  if (t.modus === 'oslo') return 0;
  const dev = t.modus === 'fast' ? 2 : Number(t.timer) || 0;
  const veggMs = Date.UTC(+dato.slice(0, 4), +dato.slice(5, 7) - 1, +dato.slice(8, 10)) + (startSek || 0) * 1000;
  return (osloForskyvning(veggMs - dev * 3600000) - dev) * 3600;
}

const origParse = CPAPEDF.parseNight, origBrp = CPAPEDF.parseBRP;
CPAPEDF.parseNight = function (night, files) {
  const d = origParse.call(CPAPEDF, night, files);
  const sh = d.sessions.length ? tidSkift(night, d.sessions[0].start) : 0;
  if (sh) {
    for (const s of d.sessions) { s.start += sh; s.end += sh; }
    for (const e of d.events) e.t += sh;
    for (const x of d.sa2) x.start += sh;
  }
  d.skift = sh;
  return d;
};
CPAPEDF.parseBRP = function (buf, night) {
  const b = origBrp.call(CPAPEDF, buf, night);
  b.start += tidSkift(night, b.start);
  return b;
};

async function lastTid() {
  if (!tidLastet) tidLastet = origApi('/api/oppsett').then((r) => { if (r && r.tid) S.tid = r.tid; }).catch(() => {});
  return tidLastet;
}
const origApi = api;
window.api = async function (path, opts) {
  const r = await origApi(path, opts);
  if (path === '/api/oppsett' && r && r.tid) { S.tid = r.tid; tidLastet = Promise.resolve(); }
  return r;
};
const origLoad = loadNightData;
window.loadNightData = async function (dato) { await lastTid(); return origLoad(dato); };
const origLogin = showLogin;
window.showLogin = function () { tidLastet = null; return origLogin(); };

/* ---------- Innstillingsvindu ---------- */
const tdlg = $('tidDlg');
function eksempel() {
  const d = [...S.have.values()].filter((r) => r.raa).pop();
  const el2 = $('tidEksempel');
  if (!d) { el2.textContent = ''; return; }
  const sh = tidSkift(d.dato, 0);
  el2.textContent = sh ? `Klokkeslettene flyttes ${sh / 3600 > 0 ? '+' : '−'}${Math.abs(sh / 3600)} time${Math.abs(sh / 3600) === 1 ? '' : 'r'} for natta ${d.dato}.` : `Klokkeslettene vises slik maskinen har skrevet dem for natta ${d.dato}.`;
}
function tegnTid() {
  const t = S.tid;
  document.querySelectorAll('input[name=tidmodus]').forEach((r) => { r.checked = r.value === t.modus; });
  $('tidTimer').value = t.modus === 'egen' ? String(t.timer) : '2';
  $('tidTimer').disabled = t.modus !== 'egen';
  eksempel();
}
$('tidBtn').addEventListener('click', async () => { await lastTid(); tegnTid(); $('tidMsg').textContent = ''; if (tdlg.showModal) tdlg.showModal(); else tdlg.setAttribute('open', ''); });
$('tidClose').addEventListener('click', () => tdlg.close());
document.querySelectorAll('input[name=tidmodus]').forEach((r) => r.addEventListener('change', () => {
  S.tid = { modus: r.value, timer: Number($('tidTimer').value) || 0 }; tegnTid();
}));
$('tidTimer').addEventListener('input', () => { S.tid = { modus: 'egen', timer: Number($('tidTimer').value) || 0 }; eksempel(); });
$('tidSave').addEventListener('click', async () => {
  $('tidMsg').textContent = 'Lagrer …';
  try {
    await origApi('/api/oppsett', { method: 'POST', body: JSON.stringify({ visning: S.layout.visning, moduler: S.layout.moduler, tid: S.tid }) });
    S.cache.clear();
    Object.assign(S.natt, { data: null, idx: null, zoom: null, valgt: null, err: null, brp: new Map() });
    tdlg.close(); render();
  } catch (e) { if (!e.auth) $('tidMsg').textContent = e.message; }
});
