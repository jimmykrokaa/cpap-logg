'use strict';
/* global JSZip, CPAPEDF, $, S, C, api, n, dagÅr, loadNights, showLogin, dlg */
// Opplasting av rådata fra SD-kortet. Hver natt pakkes i to komprimerte pakker:
// «liten» (kurver annethvert sekund og hendelser) og «kurve» (pustekurven, 25 målinger i sekundet).
const RAW_PATH = /(?:^|\/)(\d{8})\/(\d{8}_\d{6}_(?:BRP|PLD|EVE|SA2|CSL)\.edf)$/i;
const SAMTIDIGE = 4;

function setMsg(text, kind = '') { const m = $('importMsg'); m.className = 'msg' + (kind ? ' ' + kind : ''); m.textContent = text; }
function setProgress(frac) {
  const p = $('importProgress');
  if (frac == null) { p.hidden = true; return; }
  p.hidden = false; p.firstElementChild.style.width = Math.round(frac * 100) + '%';
}
function openUpload() { if (!busy) { setMsg(''); setProgress(null); } if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
$('uploadBtn').addEventListener('click', openUpload);
$('emptyUpload').addEventListener('click', openUpload);
$('uploadClose').addEventListener('click', () => dlg.close());

// Filene for én natt, sortert, som «navn:størrelse». Brukes til å se om natta er lastet opp fra før og er uendret.
const signature = (files) => files.map((f) => `${f.name}:${f.size}`).sort().join(',');

function groupRaw(entries) {
  const by = new Map();
  for (const e of entries) {
    const p = e.path.replace(/\\/g, '/');
    if (p.includes('__MACOSX/')) continue;
    const m = p.match(RAW_PATH);
    if (!m) continue;
    const dato = `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6)}`;
    if (!by.has(dato)) by.set(dato, []);
    by.get(dato).push({ ...e, name: m[2] });
  }
  return by;
}

async function uploadBytes(dato, name, u8) {
  const parts = Math.max(1, Math.ceil(u8.byteLength / C.PART));
  for (let i = 0; i < parts; i++) {
    const chunk = u8.slice(i * C.PART, (i + 1) * C.PART);
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(`/api/raa?dato=${dato}&fil=${encodeURIComponent(name)}&del=${i}`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: chunk
      });
      if (r.status === 401) { showLogin(); throw Object.assign(new Error('auth'), { auth: true }); }
      if (r.ok) break;
      if (attempt === 2) throw new Error(`Kunne ikke laste opp natta ${dagÅr(dato)}.`);
      await new Promise((ok) => setTimeout(ok, 800 * (attempt + 1)));
    }
  }
  return parts;
}

let busy = false;
async function importRaw(entries) {
  if (busy) return;
  const by = groupRaw(entries);
  if (!by.size) {
    setMsg('Fant ingen nattmapper fra AirSense-maskinen. Velg SD-kortet eller mappen DATALOG på kortet, eller en zip som inneholder mapper som «20261104».', 'err');
    return;
  }
  busy = true;
  const all = [...by.keys()].sort();
  const plan = all.map((dato) => {
    const files = by.get(dato);
    const sign = signature(files);
    const prev = S.have.get(dato);
    // Netter lastet opp i det gamle formatet (én fil per forespørsel) pakkes og lastes opp på nytt
    const sammeFiler = prev && prev.filer === sign && prev.bunter;
    // «sammendrag»: filene er lastet opp fra før, men nattas tall mangler nyere felt og regnes ut på nytt uten ny opplasting
    const status = !prev ? 'ny' : sammeFiler ? (prev.sv === CPAPEDF.SV ? 'lik' : 'sammendrag') : 'endret';
    return { dato, files, sign, status };
  });
  const todo = plan.filter((p) => p.status !== 'lik');
  const nye = todo.filter((p) => p.status === 'ny').length, regnet = todo.filter((p) => p.status === 'sammendrag').length, endret = todo.length - nye - regnet, like = plan.length - todo.length;
  if (!todo.length) {
    setMsg(`Fant ${all.length} netter på kortet. Alle er lastet opp fra før og er uendret, så ingenting ble sendt.`, 'ok');
    busy = false; return;
  }
  const head = `Fant ${all.length} netter: ${nye} nye, ${endret} endret, ${regnet} regnes ut på nytt, ${like} uendret.`;
  let done = 0, sentBytes = 0, rawBytes = 0;
  const pending = [];
  let saved = 0;
  const flush = async () => {
    if (!pending.length) return;
    const rows = pending.splice(0);
    await api('/api/netter', { method: 'POST', body: JSON.stringify({ rader: rows, fil: 'SD-kort' }) });
    saved += rows.length;
  };
  const queue = todo.slice();
  const worker = async () => {
    while (queue.length) {
      const p = queue.shift();
      const files = [];
      for (const f of p.files) files.push({ name: f.name, buf: await f.read() });
      const data = CPAPEDF.parseNight(p.dato, files);
      if (data.sessions.length && p.status === 'sammendrag') {
        pending.push({ ...CPAPEDF.summarize(data), filer: p.sign, bunter: S.have.get(p.dato).bunter });
        if (pending.length >= 10) await flush();
      } else if (data.sessions.length) {
        const liten = await CPAPEDF.pack(files.filter((f) => !/_BRP\.edf$/i.test(f.name)));
        const brp = files.filter((f) => /_BRP\.edf$/i.test(f.name));
        const kurve = brp.length ? await CPAPEDF.pack(brp) : null;
        const bunter = { liten: await uploadBytes(p.dato, 'natt-liten.bin', liten) };
        if (kurve) bunter.kurve = await uploadBytes(p.dato, 'natt-kurve.bin', kurve);
        sentBytes += liten.byteLength + (kurve ? kurve.byteLength : 0);
        rawBytes += files.reduce((s, f) => s + f.buf.byteLength, 0);
        pending.push({ ...CPAPEDF.summarize(data), filer: p.sign, bunter });
        S.cache.delete(p.dato);
        if (pending.length >= 10) await flush();
      }
      done++;
      setProgress(done / todo.length);
      setMsg(`${head} Laster opp … ${done} av ${todo.length} ferdig.`);
    }
  };
  try {
    setMsg(`${head} Laster opp …`); setProgress(0);
    await Promise.all(Array.from({ length: Math.min(SAMTIDIGE, todo.length) }, worker));
    await flush();
    setProgress(null);
    setMsg(`Ferdig: ${nye} nye og ${endret} endrede netter lastet opp, ${regnet} regnet ut på nytt. Sendte ${n(sentBytes / 1048576, 1)} MB komprimert (${n(rawBytes / 1048576, 1)} MB på kortet).` + (like ? ` ${like} netter var lastet opp fra før og ble hoppet over.` : ''), 'ok');
    Object.assign(S.natt, { dato: null, data: null, idx: null, zoom: null, valgt: null, err: null, brp: new Map() });
    await loadNights();
  } catch (e) {
    setProgress(null);
    queue.length = 0;
    try { await flush(); } catch (e2) {}
    if (!e.auth) setMsg((e.message || 'Opplastingen feilet.') + (saved ? ` ${saved} netter ble lagret før feilen. Last opp på nytt for å fullføre resten; de som er lagret blir hoppet over.` : ' Prøv igjen.'), 'err');
    if (saved) { try { await loadNights(); } catch (e3) {} }
  } finally { busy = false; }
}

async function importZip(file) {
  setMsg('Pakker ut zip-fila …');
  try {
    const zip = await JSZip.loadAsync(file);
    const entries = [];
    zip.forEach((path, entry) => {
      if (!entry.dir) entries.push({ path, size: (entry._data && entry._data.uncompressedSize) || 0, read: () => entry.async('arraybuffer') });
    });
    await importRaw(entries);
  } catch (e) { if (!e.auth) setMsg('Kunne ikke lese zip-fila.', 'err'); }
}

// Mapper som dras inn: gå gjennom innholdet
function readDirEntry(entry, out) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((f) => { out.push({ path: entry.fullPath.replace(/^\//, ''), size: f.size, read: () => f.arrayBuffer() }); resolve(); }, () => resolve());
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const batch = () => reader.readEntries(async (list) => {
        if (!list.length) { resolve(); return; }
        for (const e of list) await readDirEntry(e, out);
        batch();
      }, () => resolve());
      batch();
    } else resolve();
  });
}

$('zipInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importZip(f); e.target.value = ''; });
$('dirInput').addEventListener('change', (e) => {
  const files = [...e.target.files];
  if (files.length) importRaw(files.map((f) => ({ path: f.webkitRelativePath || f.name, size: f.size, read: () => f.arrayBuffer() })));
  e.target.value = '';
});
const drop = $('drop');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', async (e) => {
  const items = [...(e.dataTransfer.items || [])].map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
  const dirs = items.filter((i) => i.isDirectory);
  if (dirs.length) {
    setMsg('Leser mappen …');
    const out = [];
    for (const d of dirs) await readDirEntry(d, out);
    return importRaw(out);
  }
  const f = e.dataTransfer.files[0];
  if (f && /\.zip$/i.test(f.name)) return importZip(f);
  setMsg('Dra inn SD-kortet, mappen DATALOG eller en zip-fil.', 'err');
});
