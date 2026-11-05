'use strict';
/* global d3, CPAPEDF, $, S, C, el, n, dagÅr, addDays, clock, api, EV, evInfo, MOD, activeModules, body, emptyMsg, showTip, showLogin */
// Visningen av én natt: kurver gjennom natta, tidslinje, hendelser og pustekurve.

/* ---------- Natt ---------- */
function selectNight(dato, scroll) {
  if (S.natt.dato !== dato) Object.assign(S.natt, { dato, data: null, idx: null, zoom: null, valgt: null, err: null, brp: new Map() });
  render();
  if (scroll) $('nightSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('nightSelect').addEventListener('change', (e) => selectNight(e.target.value));
$('nightPrev').addEventListener('click', () => { const i = S.nights.findIndex((r) => r.dato === S.natt.dato); if (i > 0) selectNight(S.nights[i - 1].dato); });
$('nightNext').addEventListener('click', () => { const i = S.nights.findIndex((r) => r.dato === S.natt.dato); if (i >= 0 && i < S.nights.length - 1) selectNight(S.nights[i + 1].dato); });
$('zoomReset').addEventListener('click', () => setZoom(null));

async function fetchFile(dato, f) {
  const parts = [];
  for (let i = 0; i < f.deler; i++) {
    const r = await fetch(`/api/raa?dato=${dato}&fil=${encodeURIComponent(f.navn)}&del=${i}`, { credentials: 'same-origin' });
    if (r.status === 401) { showLogin(); throw Object.assign(new Error('auth'), { auth: true }); }
    if (!r.ok) throw new Error('Kunne ikke hente ' + f.navn);
    parts.push(new Uint8Array(await r.arrayBuffer()));
  }
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out.buffer;
}

async function loadNightData(dato) {
  if (S.cache.has(dato)) { Object.assign(S.natt, S.cache.get(dato)); return; }
  S.natt.loading = true; S.natt.err = null;
  renderNight();
  try {
    const row = S.have.get(dato);
    let files, idx = null;
    if (row && row.bunter) {
      files = await CPAPEDF.unpack(await fetchFile(dato, { navn: 'natt-liten.bin', deler: row.bunter.liten }));
    } else {
      idx = await api('/api/natt?dato=' + dato);
      const small = idx.filer.filter((f) => !/_BRP\.edf$/i.test(f.navn));
      files = await Promise.all(small.map(async (f) => ({ name: f.navn, buf: await fetchFile(dato, f) })));
    }
    const data = CPAPEDF.parseNight(dato, files);
    const entry = { idx, data, brp: new Map() };
    S.cache.set(dato, entry);
    if (S.natt.dato === dato) Object.assign(S.natt, entry);
  } catch (e) {
    if (!e.auth && S.natt.dato === dato) S.natt.err = e.message;
  } finally {
    if (S.natt.dato === dato) { S.natt.loading = false; renderNight(); }
  }
}

function fullDomain(d) {
  const a = d3.min(d.sessions, (s) => s.start), b = d3.max(d.sessions, (s) => s.end);
  return [a, b];
}
function setZoom(z) {
  if (!S.natt.data) return;
  const [a, b] = fullDomain(S.natt.data);
  if (z) {
    let [z0, z1] = z;
    if (z1 - z0 < 20) { const c = (z0 + z1) / 2; z0 = c - 10; z1 = c + 10; }
    z0 = Math.max(a, z0); z1 = Math.min(b, z1);
    S.natt.zoom = z1 - z0 >= (b - a) * 0.98 ? null : [z0, z1];
  } else S.natt.zoom = null;
  renderNight();
}

function plSegs(d, key, scale = 1) {
  return d.sessions.filter((s) => s.ch[key]).map((s) => ({ start: s.start, rate: s.rate, values: s.ch[key], scale }));
}

function seriesPoints(segs, t0, t1, px) {
  const pts = [];
  for (const sg of segs) {
    const len = sg.values.length; const end = sg.start + len / sg.rate;
    if (end < t0 || sg.start > t1) continue;
    const i0 = Math.max(0, Math.floor((t0 - sg.start) * sg.rate)), i1 = Math.min(len - 1, Math.ceil((t1 - sg.start) * sg.rate));
    if (pts.length) pts.push(null);
    const bucket = Math.max(1, Math.floor((i1 - i0 + 1) / (px * 1.5)));
    const sc = sg.scale || 1;
    if (bucket === 1) {
      for (let i = i0; i <= i1; i++) { const v = sg.values[i]; pts.push(Number.isNaN(v) ? null : [sg.start + i / sg.rate, v * sc]); }
    } else {
      for (let b = i0; b <= i1; b += bucket) {
        let lo = Infinity, hi = -Infinity, il = b, ih = b;
        for (let i = b; i < Math.min(b + bucket, i1 + 1); i++) { const v = sg.values[i]; if (v < lo) { lo = v; il = i; } if (v > hi) { hi = v; ih = i; } }
        if (lo === Infinity) { pts.push(null); continue; }
        const first = il <= ih ? [il, lo] : [ih, hi], second = il <= ih ? [ih, hi] : [il, lo];
        pts.push([sg.start + first[0] / sg.rate, first[1] * sc], [sg.start + second[0] / sg.rate, second[1] * sc]);
      }
    }
  }
  return pts;
}

function valueAt(segs, t) {
  for (const sg of segs) {
    const i = Math.round((t - sg.start) * sg.rate);
    if (i >= 0 && i < sg.values.length) return sg.values[i] * (sg.scale || 1);
  }
  return null;
}

function timeTicks(t0, t1, W) {
  const steps = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
  const want = Math.max(2, Math.floor(W / 80));
  const step = steps.find((s) => (t1 - t0) / s <= want) || 7200;
  const out = [];
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) out.push(t);
  return { ticks: out, sec: step < 60 };
}

// Tidsakse: start- og sluttidspunktet står alltid ytterst, hele klokkeslett imellom der det er plass
function timeAxis(svg, x, t0, t1, yPos, sec) {
  const g = svg.append('g');
  const fmt = (t) => clock(t, sec);
  const x0 = x(t0), x1 = x(t1);
  const a = g.append('text').attr('x', x0).attr('y', yPos).attr('text-anchor', 'start').text(fmt(t0)).style('font-weight', 600);
  const b = g.append('text').attr('x', x1).attr('y', yPos).attr('text-anchor', 'end').text(fmt(t1)).style('font-weight', 600);
  const right = x1 - b.node().getComputedTextLength() - 12;
  let last = x0 + a.node().getComputedTextLength() + 12;
  for (const t of timeTicks(t0, t1, x1 - x0).ticks) {
    const cx = x(t);
    const tx = g.append('text').attr('x', cx).attr('y', yPos).attr('text-anchor', 'middle').text(fmt(t));
    const w = tx.node().getComputedTextLength();
    if (cx - w / 2 < last || cx + w / 2 > right) tx.remove(); else last = cx + w / 2 + 12;
  }
}

function eventsIn(d, t0, t1) { return d.events.filter((e) => e.t >= t0 && e.t - e.dur <= t1); }

function timeChart(host, o) {
  host.replaceChildren();
  const d = S.natt.data;
  const full = fullDomain(d);
  const [t0, t1] = o.domain || S.natt.zoom || full;
  const W = Math.max(host.clientWidth, 260), H = o.height || 180;
  const svg = d3.select(host).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).style('display', 'block');
  const series = o.series.map((s) => ({ ...s, pts: seriesPoints(s.segs, t0, t1, W) }));
  const vals = series.flatMap((s) => s.pts.filter(Boolean).map((p) => p[1]));
  if (!vals.length) { host.replaceChildren(el('div', { class: 'empty-mod', text: 'Ingen målinger i dette utsnittet.' })); return; }
  let lo = o.yMin != null ? o.yMin : d3.min(vals), hi = d3.max(vals);
  if (o.yMaxMin != null) hi = Math.max(hi, o.yMaxMin);
  if (hi - lo < 1e-6) hi = lo + 1;
  const y = d3.scaleLinear([lo, hi], [H - 22, 8]).nice();
  const yt = y.ticks(H > 150 ? 4 : 3);
  const dec = o.dec != null ? o.dec : (hi - lo < 3 ? 1 : 0);
  const tmp = svg.append('g'); let lw = 0;
  yt.forEach((t) => { lw = Math.max(lw, tmp.append('text').text(n(t, dec)).node().getComputedTextLength()); });
  tmp.remove();
  const m = { l: Math.ceil(lw) + 8, r: 8 };
  const x = d3.scaleLinear([t0, t1], [m.l, W - m.r]);
  const g = svg.append('g');
  g.selectAll('line').data(yt).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).style('stroke', 'var(--grid)');
  g.selectAll('text').data(yt).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text((t) => n(t, dec));
  timeAxis(svg, x, t0, t1, H - 5, t1 - t0 < 600);
  svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', H - 22).attr('y2', H - 22).style('stroke', 'var(--line)');
  const gaps = [];
  const ss = d.sessions.slice().sort((a, b) => a.start - b.start);
  for (let i = 1; i < ss.length; i++) if (ss[i].start - ss[i - 1].end > 30) gaps.push([ss[i - 1].end, ss[i].start]);
  svg.append('g').selectAll('rect').data(gaps.filter(([a, b]) => b > t0 && a < t1)).join('rect')
    .attr('x', ([a]) => x(Math.max(a, t0))).attr('width', ([a, b]) => Math.max(0, x(Math.min(b, t1)) - x(Math.max(a, t0))))
    .attr('y', 8).attr('height', H - 30).style('fill', 'var(--grid)').style('opacity', 0.6);
  if (o.events !== false) {
    const ev = eventsIn(d, t0, t1);
    const eg = svg.append('g');
    eg.selectAll('rect').data(ev.filter((e) => e.dur > 0)).join('rect')
      .attr('x', (e) => x(Math.max(t0, e.t - e.dur))).attr('width', (e) => Math.max(1, x(Math.min(t1, e.t)) - x(Math.max(t0, e.t - e.dur))))
      .attr('y', 8).attr('height', H - 30).style('fill', (e) => `var(${evInfo(e.type).farge})`).style('opacity', 0.22);
    eg.selectAll('line').data(ev).join('line').attr('x1', (e) => x(e.t)).attr('x2', (e) => x(e.t)).attr('y1', 8).attr('y2', H - 22)
      .style('stroke', (e) => `var(${evInfo(e.type).farge})`).style('stroke-width', 1.5).style('opacity', 0.8);
  }
  if (o.ref != null && y(o.ref) > 8) {
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(o.ref)).attr('y2', y(o.ref)).style('stroke', 'var(--ref)').style('stroke-dasharray', '4 3');
  }
  for (const s of series) {
    svg.append('path').datum(s.pts).attr('d', d3.line().defined((p) => p).x((p) => x(p[0])).y((p) => y(p[1])))
      .style('fill', 'none').style('stroke', `var(--${s.farge})`).style('stroke-width', s.width || 1.5).style('stroke-linejoin', 'round');
  }
  const tip = d3.select(host).append('div').attr('class', 'tip');
  const cross = svg.append('line').attr('y1', 8).attr('y2', H - 22).style('stroke', 'var(--fg-3)').style('opacity', 0);
  const brush = d3.brushX().extent([[m.l, 4], [W - m.r, H - 20]]).on('end', (ev) => {
    if (!ev.selection) return;
    const [a, b] = ev.selection.map(x.invert);
    bg.call(brush.move, null);
    setZoom([a, b]);
  });
  const bg = svg.append('g').attr('class', 'brush').call(brush);
  bg.on('dblclick', () => setZoom(null));
  bg.on('pointermove', (ev) => {
    const [mx] = d3.pointer(ev, svg.node());
    const t = x.invert(mx);
    if (t < t0 || t > t1) return;
    cross.attr('x1', mx).attr('x2', mx).style('opacity', 0.5);
    const lines = series.map((s) => { const v = valueAt(s.segs, t); return [`var(--${s.farge})`, s.navn, v == null || Number.isNaN(v) ? '–' : n(v, s.dec != null ? s.dec : dec + 1) + (s.unit ? ' ' + s.unit : '')]; });
    for (const e of d.events) if (t >= e.t - e.dur - 2 && t <= e.t + 2) lines.push([`var(${evInfo(e.type).farge})`, evInfo(e.type).navn, (e.dur ? Math.round(e.dur) + ' s' : '')]);
    showTip(tip, W, mx, clock(t, true), lines);
  });
  bg.on('pointerleave', () => { tip.style('opacity', 0); cross.style('opacity', 0); });
}

function evTypes(d) { return [...new Set(d.events.map((e) => e.type))].sort((a, b) => Object.keys(EV).indexOf(a) - Object.keys(EV).indexOf(b)); }

const NIGHT_RENDER = {
  'natt-sammendrag'(host, nc) {
    const r = nc.sum;
    const tile = (lbl, big, unit, sub) => el('div', { class: 'tile' }, el('span', { class: 'lbl', text: lbl }),
      el('span', { class: 'big' }, big, unit ? el('span', { class: 'unit', text: unit }) : null), sub ? el('span', { class: 'sub', text: sub }) : null);
    const okter = nc.data ? nc.data.sessions.map((s) => `${clock(s.start)}–${clock(s.end)}`).join(', ') : null;
    const kids = [
      tile('AHI', n(r.ahi, 2), null, `${n(r.obstruktive, 0)} obstruktive, ${n(r.sentrale, 0)} sentrale, ${n(r.hypopneer, 0)} hypopnéer` + (r.uklassifisert ? `, ${r.uklassifisert} uklassifiserte` : '')),
      tile('Tid med maske', n(r.timer, 1), 'timer', `${n(r.okter, 0)} ${r.okter === 1 ? 'økt' : 'økter'}` + (okter ? `: ${okter}` : '')),
      tile('Trykk', n(r.trykkSnitt, 1), 'cmH₂O', `90 %: ${n(r.trykk90, 1)} · maks ${n(r.trykkMaks, 1)}`),
      tile('Lekkasje, 90 %', n(r.lekkasje90, 1), 'L/min', `Maks ${n(r.lekkasjeMaks, 1)} L/min`)
    ];
    if (r.pustefrekvens != null) {
      kids.push(tile('Pustefrekvens', n(r.pustefrekvens, 1), '/min', `Minuttventilasjon ${n(r.minuttventilasjon, 1)} L/min`));
      kids.push(tile('Tidevolum', n(r.tidevolum, 0), 'mL', `Flowbegrensning ${n(r.flowbegrensning, 2)} · snorking ${n(r.snorking, 2)}`));
    }
    host.replaceChildren(el('div', { class: 'tiles inner' }, ...kids));
  },
  'natt-tidslinje'(host, nc) {
    host.replaceChildren();
    const d = nc.data; const [t0, t1] = fullDomain(d);
    const types = evTypes(d);
    const rows = ['maske', ...types];
    const rowH = 18, W = Math.max(host.clientWidth, 260), H = 10 + rows.length * rowH + 22;
    const svg = d3.select(host).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).style('display', 'block');
    const labels = rows.map((r) => (r === 'maske' ? 'Maske på' : evInfo(r).navn));
    const tmp = svg.append('g'); let lw = 0;
    labels.forEach((t) => { lw = Math.max(lw, tmp.append('text').text(t).node().getComputedTextLength()); });
    tmp.remove();
    const m = { l: Math.ceil(lw) + 10, r: 8 };
    const x = d3.scaleLinear([t0, t1], [m.l, W - m.r]);
    const yRow = (i) => 10 + i * rowH;
    svg.append('g').selectAll('text').data(labels).join('text').attr('x', m.l - 8).attr('y', (_, i) => yRow(i) + rowH / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text((t) => t);
    svg.append('g').selectAll('rect').data(d.sessions).join('rect').attr('x', (s) => x(s.start)).attr('width', (s) => Math.max(1, x(s.end) - x(s.start)))
      .attr('y', yRow(0) + 3).attr('height', rowH - 6).attr('rx', 3).style('fill', 'var(--s1)').style('opacity', 0.8);
    types.forEach((t, i) => {
      svg.append('g').selectAll('rect').data(d.events.filter((e) => e.type === t)).join('rect')
        .attr('x', (e) => x(e.t - e.dur)).attr('width', (e) => Math.max(2, x(e.t) - x(e.t - e.dur)))
        .attr('y', yRow(i + 1) + 3).attr('height', rowH - 6).style('fill', `var(${evInfo(t).farge})`);
    });
    timeAxis(svg, x, t0, t1, H - 5, false);
    if (S.natt.zoom) {
      svg.append('rect').attr('x', x(S.natt.zoom[0])).attr('width', Math.max(2, x(S.natt.zoom[1]) - x(S.natt.zoom[0])))
        .attr('y', 4).attr('height', H - 24).style('fill', 'var(--accent)').style('opacity', 0.12).style('stroke', 'var(--accent)');
    }
    const brush = d3.brushX().extent([[m.l, 4], [W - m.r, H - 20]]).on('end', (ev) => {
      if (!ev.selection) return;
      const [a, b] = ev.selection.map(x.invert);
      bg.call(brush.move, null);
      setZoom([a, b]);
    });
    const bg = svg.append('g').attr('class', 'brush').call(brush);
    bg.on('dblclick', () => setZoom(null));
    if (!types.length) host.append(el('p', { class: 'note', style: 'margin:6px 0 0', text: 'Ingen hendelser registrert denne natta.' }));
  },
  'natt-trykk'(host, nc) {
    timeChart(host, { height: 200, yMin: 0, yMaxMin: C.TAK, series: [
      { navn: 'Trykk', farge: 's1', segs: plSegs(nc.data, 'Press'), unit: 'cmH₂O', dec: 1, width: 1.8 },
      { navn: 'Masketrykk', farge: 's2', segs: plSegs(nc.data, 'MaskPress'), unit: 'cmH₂O', dec: 1 },
      { navn: 'EPR', farge: 's3', segs: plSegs(nc.data, 'EprPress'), unit: 'cmH₂O', dec: 1 }
    ] });
  },
  'natt-lekkasje'(host, nc) {
    timeChart(host, { height: 160, yMin: 0, yMaxMin: 10, ref: C.LEKKASJE, series: [{ navn: 'Lekkasje', farge: 's3', segs: plSegs(nc.data, 'Leak', 60), unit: 'L/min', dec: 1 }] });
  },
  'natt-pustefrekvens'(host, nc) {
    timeChart(host, { height: 150, series: [{ navn: 'Pustefrekvens', farge: 's5', segs: plSegs(nc.data, 'RespRate'), unit: '/min', dec: 1 }] });
  },
  'natt-minuttventilasjon'(host, nc) {
    timeChart(host, { height: 150, yMin: 0, series: [{ navn: 'Minuttventilasjon', farge: 's1', segs: plSegs(nc.data, 'MinVent'), unit: 'L/min', dec: 1 }] });
  },
  'natt-tidevolum'(host, nc) {
    timeChart(host, { height: 150, yMin: 0, dec: 0, series: [{ navn: 'Tidevolum', farge: 's4', segs: plSegs(nc.data, 'TidVol', 1000), unit: 'mL', dec: 0 }] });
  },
  'natt-flowbegrensning'(host, nc) {
    timeChart(host, { height: 130, yMin: 0, yMaxMin: 0.5, series: [{ navn: 'Flowbegrensning', farge: 's2', segs: plSegs(nc.data, 'FlowLim'), dec: 2 }] });
  },
  'natt-snorking'(host, nc) {
    timeChart(host, { height: 130, yMin: 0, yMaxMin: 1, series: [{ navn: 'Snorking', farge: 's5', segs: plSegs(nc.data, 'Snore'), dec: 2 }] });
  },
  'natt-pustekurve'(host, nc) {
    const z = S.natt.zoom;
    if (!z || z[1] - z[0] > C.PUSTEKURVE_MAKS) {
      const first = nc.data.events.find((e) => ['OA', 'CA', 'H', 'UA'].includes(e.type));
      const kids = [el('div', { class: 'empty-mod', text: 'Velg et utsnitt på 15 minutter eller kortere for å se pustekurven.' })];
      if (first) kids.push(el('div', { style: 'text-align:center' }, el('button', { class: 'btn small', type: 'button', text: `Vis første hendelse (${clock(first.t)})`, onclick: () => setZoom([first.t - first.dur - 60, first.t + 60]) })));
      host.replaceChildren(...kids);
      return;
    }
    const need = nc.data.sessions.filter((s) => s.end > z[0] && s.start < z[1]);
    const missing = need.filter((s) => !S.natt.brp.has(s.id));
    if (missing.length) {
      emptyMsg(host, 'Henter pustekurven …');
      if (!S.natt.brpLoading) loadBrp(nc.dato, missing);
      return;
    }
    const brp = need.map((s) => S.natt.brp.get(s.id)).filter(Boolean);
    if (!brp.length) return emptyMsg(host, 'Fant ingen pustekurve for dette utsnittet.');
    const a = el('div'), b = el('div');
    host.replaceChildren(a, b);
    timeChart(a, { height: 190, series: [{ navn: 'Luftstrøm', farge: 's1', segs: brp.map((x) => ({ start: x.start, rate: x.rate, values: x.flow, scale: 60 })), unit: 'L/min', dec: 0, width: 1.2 }] });
    timeChart(b, { height: 120, events: false, series: [{ navn: 'Trykk', farge: 's2', segs: brp.filter((x) => x.press).map((x) => ({ start: x.start, rate: x.rate, values: x.press })), unit: 'cmH₂O', dec: 1, width: 1.2 }] });
  },
  'natt-hendelser'(host, nc) {
    const ev = nc.data.events;
    if (!ev.length) return emptyMsg(host, 'Ingen hendelser registrert denne natta.');
    const tb = el('tbody');
    for (const e of ev) {
      const sw = el('i', { class: 'sw' }); sw.style.background = `var(${evInfo(e.type).farge})`;
      const sel = S.natt.valgt === e;
      tb.append(el('tr', { class: 'click' + (sel ? ' sel' : ''), tabindex: '0',
        onclick: () => { S.natt.valgt = e; setZoom([e.t - e.dur - 60, e.t + 60]); },
        onkeydown: (k) => { if (k.key === 'Enter') { S.natt.valgt = e; setZoom([e.t - e.dur - 60, e.t + 60]); } } },
      el('td', { text: clock(e.t - e.dur, true) }), el('td', {}, el('span', { class: 'tag' }, sw, evInfo(e.type).navn)), el('td', { text: e.dur ? Math.round(e.dur) + ' s' : '–' })));
    }
    host.replaceChildren(el('div', { class: 'tablewrap', style: 'max-height:300px' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', { text: 'Start' }), el('th', { text: 'Type', style: 'text-align:left' }), el('th', { text: 'Varighet' }))), tb)));
    host.querySelectorAll('td:nth-child(2)').forEach((td) => { td.style.textAlign = 'left'; });
  },
  'natt-spo2'(host, nc) {
    const sa = nc.data.sa2;
    if (!sa.length) return emptyMsg(host, 'Ingen oksymeter var koblet til denne natta.');
    const a = el('div'), b = el('div');
    host.replaceChildren(a, b);
    timeChart(a, { height: 150, series: [{ navn: 'SpO₂', farge: 's1', segs: sa.map((x) => ({ start: x.start, rate: 1, values: x.spo2 })), unit: '%', dec: 0 }] });
    timeChart(b, { height: 130, series: [{ navn: 'Puls', farge: 's2', segs: sa.filter((x) => x.puls).map((x) => ({ start: x.start, rate: 1, values: x.puls })), unit: '/min', dec: 0 }] });
  },
  'natt-ai'(host, nc) {
    if (host.dataset.dato === nc.dato) return;
    host.dataset.dato = nc.dato;
    const out = el('div', { class: 'ai-out' }), msg = el('div', { class: 'msg' });
    const btn = el('button', { class: 'btn', type: 'button', text: 'Tolk denne natta' });
    btn.addEventListener('click', async () => {
      btn.disabled = true; out.textContent = ''; msg.className = 'msg'; msg.textContent = 'Leser natta, dette tar noen sekunder …';
      try {
        const r = await api('/api/tolk', { method: 'POST', body: JSON.stringify({ natt: nightPayload(nc) }) });
        out.textContent = r.tekst; msg.textContent = '';
      } catch (e) { if (!e.auth) { msg.className = 'msg err'; msg.textContent = e.message; } }
      finally { btn.disabled = false; }
    });
    host.replaceChildren(el('div', { style: 'display:grid; gap:10px' }, el('div', {}, btn), msg, out));
  }
};

function nightPayload(nc) {
  const d = nc.data;
  const hendelser = d.events.map((e) => ({ tid: clock(e.t - e.dur, true), type: evInfo(e.type).navn, varighet: Math.round(e.dur) }));
  const okter = d.sessions.map((s) => ({ fra: clock(s.start), til: clock(s.end) }));
  const minutter = [];
  const [a, b] = fullDomain(d);
  const avg = (key, t0, t1, scale = 1) => {
    let sum = 0, cnt = 0;
    for (const s of d.sessions) {
      const v = s.ch[key]; if (!v) continue;
      const i0 = Math.max(0, Math.floor((t0 - s.start) * s.rate)), i1 = Math.min(v.length, Math.floor((t1 - s.start) * s.rate));
      for (let i = i0; i < i1; i++) if (!Number.isNaN(v[i])) { sum += v[i]; cnt++; }
    }
    return cnt ? n((sum / cnt) * scale, 2) : '–';
  };
  for (let t = Math.floor(a / 600) * 600; t < b; t += 600) {
    const p = avg('Press', t, t + 600);
    if (p === '–') continue;
    minutter.push(`${clock(t)} trykk ${p}, lekkasje ${avg('Leak', t, t + 600, 60)}, pustefrekvens ${avg('RespRate', t, t + 600)}, minuttventilasjon ${avg('MinVent', t, t + 600)}, flowbegrensning ${avg('FlowLim', t, t + 600)}, snorking ${avg('Snore', t, t + 600)}`);
  }
  return { dato: nc.dato, hendelser, okter, minutter };
}

async function loadBrp(dato, sessions) {
  S.natt.brpLoading = true;
  try {
    const row = S.have.get(dato);
    if (row && row.bunter) {
      // Hele pustekurven for natta ligger i én pakke
      if (row.bunter.kurve) {
        const files = await CPAPEDF.unpack(await fetchFile(dato, { navn: 'natt-kurve.bin', deler: row.bunter.kurve }));
        for (const f of files) { const m = f.name.match(/^(\d{8}_\d{6})_BRP\.edf$/i); if (m) S.natt.brp.set(m[1], CPAPEDF.parseBRP(f.buf, dato)); }
      }
      for (const s of S.natt.data.sessions) if (!S.natt.brp.has(s.id)) S.natt.brp.set(s.id, null);
    } else {
      for (const s of sessions) {
        const f = S.natt.idx.filer.find((x) => x.navn.toUpperCase() === (s.id + '_BRP.edf').toUpperCase());
        if (!f) { S.natt.brp.set(s.id, null); continue; }
        const buf = await fetchFile(dato, f);
        S.natt.brp.set(s.id, CPAPEDF.parseBRP(buf, dato));
      }
    }
  } catch (e) { if (!e.auth) sessions.forEach((s) => { if (!S.natt.brp.has(s.id)) S.natt.brp.set(s.id, null); }); }
  finally {
    S.natt.brpLoading = false;
    if (S.natt.dato === dato) renderNight();
  }
}

function renderNight() {
  const sel = $('nightSelect');
  const opts = S.nights.slice().reverse();
  if (sel.options.length !== opts.length || sel.dataset.sig !== opts.map((r) => r.dato + (r.raa ? '*' : '')).join()) {
    sel.replaceChildren(...opts.map((r) => el('option', { value: r.dato, text: dagÅr(r.dato) })));
    sel.dataset.sig = opts.map((r) => r.dato + (r.raa ? '*' : '')).join();
  }
  const dato = S.natt.dato;
  if (!dato) return;
  sel.value = dato;
  const i = S.nights.findIndex((r) => r.dato === dato);
  $('nightPrev').disabled = i <= 0; $('nightNext').disabled = i >= S.nights.length - 1;
  const row = S.have.get(dato);
  $('nightTitle').textContent = 'Natt til ' + dagÅr(addDays(dato, 1)).replace(/ \d{4}$/, '') + ` (${dagÅr(dato)})`;
  const ids = activeModules().filter((id) => MOD.get(id).del === 'natt');

  if (row.raa && !S.natt.data && S.cache.has(dato)) Object.assign(S.natt, S.cache.get(dato));
  if (row.raa && !S.natt.data && !S.natt.loading && !S.natt.err) { loadNightData(dato); return; }

  const z = S.natt.zoom;
  $('zoomBar').hidden = !z;
  if (z) $('zoomInfo').textContent = `Viser ${clock(z[0], z[1] - z[0] < 600)}–${clock(z[1], z[1] - z[0] < 600)} (${z[1] - z[0] < 120 ? Math.round(z[1] - z[0]) + ' sekunder' : Math.round((z[1] - z[0]) / 60) + ' minutter'})`;
  $('nightNote').textContent = S.natt.loading ? 'Henter rådata …' : S.natt.err ? 'Kunne ikke hente rådata: ' + S.natt.err : '';

  if (S.natt.data) {
    const [a, b] = fullDomain(S.natt.data);
    $('nightTitle').textContent += ` · ${clock(a)}–${clock(b)}`;
  }
  const nc = { dato, row, data: S.natt.data, sum: S.natt.data ? { ...row, ...CPAPEDF.summarize(S.natt.data) } : row };
  for (const id of ids) {
    const host = body(id); if (!host) continue;
    const m = MOD.get(id);
    if (m.raa && !nc.data) { emptyMsg(host, row.raa ? (S.natt.err ? 'Rådata kunne ikke hentes.' : 'Henter rådata …') : 'Krever rådata fra SD-kortet.'); continue; }
    NIGHT_RENDER[id](host, nc);
  }
}

(async () => {
  try {
    const s = await (await fetch('/api/session', { credentials: 'same-origin' })).json();
    if (s.innlogget) showApp(); else showLogin();
  } catch (e) { $('status').textContent = 'Fikk ikke kontakt med serveren.'; }
})();
