// Leser ResMed AirSense 10/11-filer (EDF/EDF+) fra SD-kortet og regner ut nattoppsummering.
(function (root) {
  const latin = new TextDecoder('latin1');

  function header(buf) {
    const u8 = new Uint8Array(buf);
    const s = (o, l) => latin.decode(u8.subarray(o, o + l)).trim();
    const ns = parseInt(s(252, 4), 10);
    const h = { date: s(168, 8), time: s(176, 8), hlen: parseInt(s(184, 8), 10), nrec: parseInt(s(236, 8), 10), dur: parseFloat(s(244, 8)), ns };
    const fields = [['label', 16], ['trans', 80], ['dim', 8], ['pmin', 8], ['pmax', 8], ['dmin', 8], ['dmax', 8], ['pref', 80], ['nsamp', 8], ['res', 32]];
    const sig = Array.from({ length: ns }, () => ({}));
    let o = 256;
    for (const [k, l] of fields) for (let i = 0; i < ns; i++) { sig[i][k] = s(o, l); o += l; }
    for (const x of sig) { for (const k of ['pmin', 'pmax', 'dmin', 'dmax']) x[k] = parseFloat(x[k]); x.nsamp = parseInt(x.nsamp, 10); }
    h.sig = sig;
    h.recSamples = sig.reduce((a, x) => a + x.nsamp, 0);
    const avail = Math.floor((buf.byteLength - h.hlen) / (h.recSamples * 2));
    h.nrec = h.nrec >= 0 ? Math.min(h.nrec, avail) : avail;
    const [dd, mm, yy] = h.date.split('.').map(Number);
    const [hh, mi, ss] = h.time.split('.').map(Number);
    h.startMs = Date.UTC(2000 + yy, mm - 1, dd, hh, mi, ss);
    return h;
  }

  function signal(buf, h, label) {
    const i = h.sig.findIndex((x) => x.label === label);
    if (i < 0) return null;
    const x = h.sig[i];
    const g = (x.pmax - x.pmin) / (x.dmax - x.dmin);
    const off = h.sig.slice(0, i).reduce((a, y) => a + y.nsamp, 0);
    const dv = new DataView(buf);
    const out = new Float32Array(h.nrec * x.nsamp);
    let valid = false;
    for (let r = 0; r < h.nrec; r++) {
      const base = h.hlen + (r * h.recSamples + off) * 2;
      for (let k = 0; k < x.nsamp; k++) {
        const raw = dv.getInt16(base + k * 2, true);
        if (raw >= x.dmin && raw !== -1) valid = true;
        out[r * x.nsamp + k] = raw < x.dmin ? NaN : (raw - x.dmin) * g + x.pmin;
      }
    }
    return { values: out, rate: x.nsamp / h.dur, dim: x.dim, valid };
  }

  function annotations(buf, h) {
    const i = h.sig.findIndex((x) => x.label === 'EDF Annotations');
    if (i < 0) return [];
    const u8 = new Uint8Array(buf);
    const off = h.sig.slice(0, i).reduce((a, y) => a + y.nsamp, 0);
    const n = h.sig[i].nsamp * 2;
    const out = [];
    for (let r = 0; r < h.nrec; r++) {
      const start = h.hlen + (r * h.recSamples + off) * 2;
      const text = latin.decode(u8.subarray(start, start + n));
      for (const tal of text.split('\x00')) {
        if (!tal) continue;
        const parts = tal.split('\x14');
        const [on, du] = parts[0].split('\x15');
        for (const t of parts.slice(1)) {
          if (t && t !== 'Recording starts') out.push({ onset: parseFloat(on), dur: du ? parseFloat(du) : 0, type: t });
        }
      }
    }
    return out;
  }

  const EVENT_KEYS = {
    'Obstructive Apnea': 'OA', 'Central Apnea': 'CA', 'Hypopnea': 'H', 'Apnea': 'UA',
    'Arousal': 'AR', 'RERA': 'RERA', 'Cheyne Stokes Respiration': 'CSR'
  };

  const FILE_RE = /(\d{8})_(\d{6})_(BRP|PLD|EVE|SA2|CSL)\.edf$/i;

  function parseNight(night, files) {
    const nightMs = Date.UTC(+night.slice(0, 4), +night.slice(5, 7) - 1, +night.slice(8, 10));
    const rel = (h) => (h.startMs - nightMs) / 1000; // sekunder fra midnatt på nattens dato
    const sessions = [];
    const events = [];
    const sa2 = [];
    for (const f of files) {
      const m = f.name.match(FILE_RE);
      if (!m) continue;
      const kind = m[3].toUpperCase();
      const h = header(f.buf);
      if (kind === 'PLD') {
        const ch = {};
        for (const s of h.sig) if (s.label !== 'Crc16') ch[s.label.replace('.2s', '')] = signal(f.buf, h, s.label).values;
        sessions.push({ id: `${m[1]}_${m[2]}`, start: rel(h), end: rel(h) + h.nrec * h.dur, rate: 0.5, ch });
      } else if (kind === 'EVE' || kind === 'CSL') {
        for (const a of annotations(f.buf, h)) events.push({ t: rel(h) + a.onset, dur: a.dur, type: EVENT_KEYS[a.type] || a.type, src: kind });
      } else if (kind === 'SA2') {
        const sp = signal(f.buf, h, 'SpO2.1s'), pu = signal(f.buf, h, 'Pulse.1s');
        if (sp && sp.valid) sa2.push({ start: rel(h), rate: 1, spo2: sp.values, puls: pu ? pu.values : null });
      }
    }
    sessions.sort((a, b) => a.start - b.start);
    const inSession = (t) => sessions.some((s) => t >= s.start && t <= s.end);
    const ev = events.filter((e) => inSession(e.t)).sort((a, b) => a.t - b.t);
    return { night, sessions, events: ev, sa2 };
  }

  function stats(arr) {
    const v = [];
    for (const a of arr) for (let i = 0; i < a.length; i++) if (!Number.isNaN(a[i])) v.push(a[i]);
    if (!v.length) return null;
    const sum = v.reduce((s, x) => s + x, 0);
    const sorted = Float64Array.from(v).sort();
    return { avg: sum / v.length, p90: sorted[Math.floor(0.9 * sorted.length)], max: sorted[sorted.length - 1], min: sorted[0] };
  }

  const SV = 3; // versjon på sammendraget; økes når nye felt legges til, så eldre netter regnes ut på nytt
  const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

  function summarize(d) {
    const hours = d.sessions.reduce((s, x) => s + (x.end - x.start), 0) / 3600;
    const count = (k) => d.events.filter((e) => e.type === k).length;
    const ch = (k) => d.sessions.map((s) => s.ch[k]).filter(Boolean);
    const press = stats(ch('Press')), leak = stats(ch('Leak')), mask = stats(ch('MaskPress')), epr = stats(ch('EprPress'));
    const rr = stats(ch('RespRate')), tv = stats(ch('TidVol')), mv = stats(ch('MinVent')), sn = stats(ch('Snore')), fl = stats(ch('FlowLim'));
    const spo2 = stats(d.sa2.map((x) => x.spo2)), puls = stats(d.sa2.map((x) => x.puls).filter(Boolean));
    const oa = count('OA'), ca = count('CA'), h = count('H'), ua = count('UA');
    const ss = d.sessions.slice().sort((a, b) => a.start - b.start);
    let pause = 0, avbrudd = 0, lange = 0;
    for (let i = 1; i < ss.length; i++) { const g = ss[i].start - ss[i - 1].end; if (g > 0) { avbrudd++; pause += g; if (g >= 180) lange++; } }
    let stor = 0, tot = 0;
    for (const s of d.sessions) { const v = s.ch.Leak; if (!v) continue; for (let i = 0; i < v.length; i++) if (!Number.isNaN(v[i])) { tot++; if (v[i] > 0.4) stor++; } }
    return {
      dato: d.night,
      ahi: hours ? r2((oa + ca + h + ua) / hours) : null,
      timer: r2(hours), okter: d.sessions.length,
      sentrale: ca, obstruktive: oa, hypopneer: h, uklassifisert: ua, rera: count('RERA'), oppvakninger: count('AR'),
      trykkSnitt: r2(press && press.avg), trykkMin: r2(press && press.min), trykkMaks: r2(press && press.max), trykk90: r2(press && press.p90),
      lekkasjeSnitt: r2(leak && leak.avg * 60), lekkasjeMaks: r2(leak && leak.max * 60), lekkasje90: r2(leak && leak.p90 * 60),
      maskeTrykk: r2(mask && mask.avg), eprTrykk: r2(epr && epr.avg),
      pustefrekvens: r2(rr && rr.avg), tidevolum: tv ? Math.round(tv.avg * 1000) : null, minuttventilasjon: r2(mv && mv.avg),
      snorking: r2(sn && sn.avg), flowbegrensning: r2(fl && fl.avg), flowbegrensning90: r2(fl && fl.p90),
      spo2Snitt: r2(spo2 && spo2.avg), spo2Min: r2(spo2 && spo2.min), pulsSnitt: r2(puls && puls.avg),
      avbrudd, avbruddLange: lange, pauseMin: r2(pause / 60), lekkasjeStor: tot ? Math.round((stor / tot) * 1000) / 10 : null,
      sv: SV, raa: true
    };
  }

  function parseBRP(buf, night) {
    const nightMs = Date.UTC(+night.slice(0, 4), +night.slice(5, 7) - 1, +night.slice(8, 10));
    const h = header(buf);
    const flow = signal(buf, h, 'Flow.40ms'), press = signal(buf, h, 'Press.40ms');
    return { start: (h.startMs - nightMs) / 1000, rate: flow.rate, flow: flow.values, press: press ? press.values : null };
  }


  // ---------- Pakking: alle filene for en natt i én komprimert pakke ----------
  // BRP-filene (pustekurven) deltakodes før komprimering: forskjellen mellom nabomålinger er liten og komprimeres mye bedre.
  function delta(buf, decode) {
    const u8 = new Uint8Array(buf.slice(0));
    const hlen = parseInt(latin.decode(u8.subarray(184, 192)).trim(), 10);
    const dv = new DataView(u8.buffer);
    const count = (u8.length - hlen) >> 1;
    let prev = 0;
    for (let i = 0; i < count; i++) {
      const o = hlen + i * 2, v = dv.getInt16(o, true);
      if (decode) { const x = (prev + v) << 16 >> 16; dv.setInt16(o, x, true); prev = x; }
      else { dv.setInt16(o, (v - prev) << 16 >> 16, true); prev = v; }
    }
    return u8.buffer;
  }

  async function streamBytes(u8, transform) {
    return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(transform)).arrayBuffer());
  }

  // files: [{name, buf}] -> komprimert Uint8Array
  async function pack(files) {
    const parts = files.map((f) => {
      const d = /_BRP\.edf$/i.test(f.name);
      return { name: f.name, d, bytes: new Uint8Array(d ? delta(f.buf, false) : f.buf) };
    });
    const manifest = new TextEncoder().encode(JSON.stringify({ v: 1, filer: parts.map((p) => ({ navn: p.name, lengde: p.bytes.length, delta: p.d })) }));
    const total = 4 + manifest.length + parts.reduce((s, p) => s + p.bytes.length, 0);
    const out = new Uint8Array(total);
    new DataView(out.buffer).setUint32(0, manifest.length, true);
    out.set(manifest, 4);
    let o = 4 + manifest.length;
    for (const p of parts) { out.set(p.bytes, o); o += p.bytes.length; }
    return streamBytes(out, new CompressionStream('gzip'));
  }

  // komprimert pakke -> [{name, buf}]
  async function unpack(buf) {
    const u8 = await streamBytes(new Uint8Array(buf), new DecompressionStream('gzip'));
    const mlen = new DataView(u8.buffer).getUint32(0, true);
    const manifest = JSON.parse(new TextDecoder().decode(u8.subarray(4, 4 + mlen)));
    let o = 4 + mlen;
    return manifest.filer.map((f) => {
      const raw = u8.slice(o, o + f.lengde).buffer; o += f.lengde;
      return { name: f.navn, buf: f.delta ? delta(raw, true) : raw };
    });
  }

  const api = { header, signal, annotations, parseNight, summarize, parseBRP, pack, unpack, FILE_RE, SV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CPAPEDF = api;
})(typeof window !== 'undefined' ? window : globalThis);
