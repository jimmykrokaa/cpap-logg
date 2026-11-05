'use strict';
/* global d3, JSZip, CPAPEDF */

const C = { AHI: 5, TIMER: 4, TAK: 20, LEKKASJE: 24, PART: 3 * 1024 * 1024, PUSTEKURVE_MAKS: 15 * 60 };
const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const $ = (id) => document.getElementById(id);
const dag = (s) => { const d = new Date(s + 'T00:00:00Z'); return d.getUTCDate() + '. ' + MND[d.getUTCMonth()]; };
const dagÅr = (s) => dag(s) + ' ' + s.slice(0, 4);
const n = (v, dec = 1) => (v == null || !isFinite(v) ? '–' : Number(v).toFixed(dec).replace('.', ','));
const addDays = (s, k) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const pad = (x) => String(x).padStart(2, '0');
const clock = (t, sec = false) => {
  const s = ((Math.round(t) % 86400) + 86400) % 86400;
  const out = pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60));
  return sec ? out + ':' + pad(s % 60) : out;
};
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null) e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
};

const EV = {
  OA: { navn: 'Obstruktiv apné', farge: '--ev-oa' }, CA: { navn: 'Sentral apné', farge: '--ev-ca' },
  H: { navn: 'Hypopné', farge: '--ev-h' }, UA: { navn: 'Uklassifisert apné', farge: '--ev-ua' },
  AR: { navn: 'Oppvåkning', farge: '--ev-ar' }, RERA: { navn: 'RERA', farge: '--ev-other' }, CSR: { navn: 'Cheyne-Stokes', farge: '--ev-other' }
};
const evInfo = (t) => EV[t] || { navn: t, farge: '--ev-other' };

const S = {
  nights: [], have: new Map(), authed: false, loaded: false,
  sel: { days: 0, from: null, to: null },
  layout: { visning: 'enkel', moduler: null }, draft: null,
  natt: { dato: null, data: null, idx: null, loading: false, err: null, zoom: null, brp: new Map(), brpLoading: false, valgt: null },
  cache: new Map()
};
try { const s = JSON.parse(localStorage.getItem('cpap-periode') || 'null'); if (s && typeof s.days === 'number') S.sel.days = s.days; } catch (e) {}

/* ---------- API ---------- */
async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts });
  if (r.status === 401) { showLogin(); throw Object.assign(new Error('auth'), { auth: true }); }
  let data = null; try { data = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error((data && data.error) || 'Noe gikk galt.');
  return data;
}

async function loadNights() {
  const d = await api('/api/netter');
  S.nights = d.netter || [];
  S.have = new Map(S.nights.map((r) => [r.dato, r]));
  S.loaded = true;
  if (!S.natt.dato || !S.have.has(S.natt.dato)) {
    const raw = S.nights.filter((r) => r.raa);
    S.natt.dato = (raw.length ? raw[raw.length - 1] : S.nights[S.nights.length - 1] || {}).dato || null;
    Object.assign(S.natt, { data: null, idx: null, zoom: null, valgt: null, err: null, brp: new Map() });
  }
  render();
}

/* ---------- Moduler og visninger ---------- */
const MODULES = [
  { id: 'nokkeltall', del: 'periode', navn: 'Nøkkeltall', wide: true },
  { id: 'ahi', del: 'periode', navn: 'AHI per natt', note: 'Pustestopp og -reduksjoner per time. Under 5 regnes som godt behandlet. Klikk på en natt for å se den i detalj.',
    legend: [['muted', 'Hver natt'], ['s1', 'Snitt siste 7 netter', 'ln'], [null, 'Grense 5', 'dash']] },
  { id: 'hendelser', del: 'periode', navn: 'Hendelser per time',
    legend: [['ev-ca', 'Sentrale apnéer'], ['ev-oa', 'Obstruktive apnéer'], ['ev-h', 'Hypopnéer og uklassifiserte']] },
  { id: 'timer', del: 'periode', navn: 'Timer med maske per natt', note: 'Netter under 4 timer er røde.',
    legend: [['s1', 'Minst 4 timer'], ['bad-mark', 'Under 4 timer']] },
  { id: 'trykk', del: 'periode', navn: 'Trykk per natt', note: 'cmH₂O. Prikkene er nattas høyeste trykk; røde prikker nådde taket på 20.',
    legend: [['s1', 'Snitt', 'ln'], ['s2', '90 %-persentil', 'ln'], ['muted', 'Maks']] },
  { id: 'lekkasje', del: 'periode', navn: 'Lekkasje per natt', note: '90 %-persentil i L/min. Lavt er bra; høye topper kan bety at masken løsnet.',
    legend: [['s3', '90 %-persentil']] },
  { id: 'pustefrekvens', del: 'periode', navn: 'Pustefrekvens per natt', note: 'Snitt i pust per minutt.',
    legend: [['s5', 'Pustefrekvens']] },
  { id: 'tidevolum', del: 'periode', navn: 'Tidevolum per natt', note: 'Snitt luftmengde per pust i mL.',
    legend: [['s4', 'Tidevolum']] },
  { id: 'tabell', del: 'periode', navn: 'Netter i perioden', wide: true, note: 'Nyeste først. Klikk på en natt for å se den i detalj. AHI over 5 og trykk som når 20 er uthevet.' },
  { id: 'ai', del: 'periode', navn: 'Tolkning av perioden', note: 'Valgfritt. En AI-modell leser tallene for perioden du har valgt og skriver en kort tolkning. Ikke medisinsk rådgivning.' },

  { id: 'natt-sammendrag', del: 'natt', navn: 'Nattens tall', wide: true },
  { id: 'natt-tidslinje', del: 'natt', navn: 'Tidslinje', wide: true, raa: true, note: 'Når masken var på, og når hendelsene kom. Dra over et område i en graf for å zoome inn; dobbeltklikk for å zoome ut.' },
  { id: 'natt-trykk', del: 'natt', navn: 'Trykk gjennom natta', wide: true, raa: true, note: 'cmH₂O. Fargede felt viser hendelser.',
    legend: [['s1', 'Trykk', 'ln'], ['s2', 'Masketrykk', 'ln'], ['s3', 'Trykk ved utpust (EPR)', 'ln']] },
  { id: 'natt-lekkasje', del: 'natt', navn: 'Lekkasje gjennom natta', raa: true, note: 'L/min. Den stiplede linjen er 24 L/min, der ResMed regner lekkasjen som stor.',
    legend: [['s3', 'Lekkasje', 'ln']] },
  { id: 'natt-pustefrekvens', del: 'natt', navn: 'Pustefrekvens gjennom natta', raa: true, note: 'Pust per minutt.', legend: [['s5', 'Pustefrekvens', 'ln']] },
  { id: 'natt-minuttventilasjon', del: 'natt', navn: 'Minuttventilasjon gjennom natta', raa: true, note: 'Liter luft per minutt.', legend: [['s1', 'Minuttventilasjon', 'ln']] },
  { id: 'natt-tidevolum', del: 'natt', navn: 'Tidevolum gjennom natta', raa: true, note: 'mL per pust.', legend: [['s4', 'Tidevolum', 'ln']] },
  { id: 'natt-flowbegrensning', del: 'natt', navn: 'Flowbegrensning gjennom natta', raa: true, note: '0 er åpne luftveier, 1 er sterkt begrenset luftstrøm.', legend: [['s2', 'Flowbegrensning', 'ln']] },
  { id: 'natt-snorking', del: 'natt', navn: 'Snorking gjennom natta', raa: true, note: 'Maskinens snorkemål (0–5).', legend: [['s5', 'Snorking', 'ln']] },
  { id: 'natt-pustekurve', del: 'natt', navn: 'Pustekurve', wide: true, raa: true, note: 'Luftstrøm og trykk med 25 målinger i sekundet. Vises når utsnittet er 15 minutter eller kortere: dra over et område i en graf, eller klikk på en hendelse i listen.',
    legend: [['s1', 'Luftstrøm (L/min)', 'ln'], ['s2', 'Trykk (cmH₂O)', 'ln']] },
  { id: 'natt-hendelser', del: 'natt', navn: 'Hendelser', raa: true, note: 'Klikk på en hendelse for å zoome inn på den.' },
  { id: 'natt-spo2', del: 'natt', navn: 'Oksygenmetning og puls', raa: true, note: 'Krever et oksymeter koblet til maskinen.', legend: [['s1', 'SpO₂ (%)', 'ln'], ['s2', 'Puls', 'ln']] },
  { id: 'natt-ai', del: 'natt', navn: 'Tolkning av natta', raa: true, note: 'Valgfritt. En AI-modell leser hendelsene og kurvene for natta og skriver en kort tolkning. Ikke medisinsk rådgivning.' }
];
const MOD = new Map(MODULES.map((m) => [m.id, m]));
const PRESETS = {
  enkel: ['nokkeltall', 'ahi', 'timer', 'natt-sammendrag', 'natt-tidslinje', 'natt-trykk'],
  avansert: MODULES.map((m) => m.id)
};

function activeModules() {
  const v = S.layout.visning;
  if (v === 'egen') return (S.layout.moduler && S.layout.moduler.length ? S.layout.moduler : PRESETS.enkel).filter((id) => MOD.has(id));
  return PRESETS[v] || PRESETS.enkel;
}

async function saveLayout() {
  try { S.layout = await api('/api/oppsett', { method: 'POST', body: JSON.stringify({ visning: S.layout.visning, moduler: S.layout.moduler }) }); }
  catch (e) { if (!e.auth) $('layoutMsg').textContent = 'Kunne ikke lagre oppsettet: ' + e.message; }
}

let builtSig = '';
function buildCards() {
  const ids = activeModules();
  const sig = S.layout.visning + '|' + ids.join(',');
  document.querySelectorAll('#viewSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === S.layout.visning)));
  $('customize').hidden = S.layout.visning !== 'egen';
  if (sig === builtSig) return;
  builtSig = sig;
  for (const [del, host] of [['periode', $('periodMods')], ['natt', $('nightMods')]]) {
    host.replaceChildren();
    for (const id of ids) {
      const m = MOD.get(id);
      if (!m || m.del !== del) continue;
      const head = el('div', { class: 'mod-head' }, el('h2', { text: m.navn }));
      if (S.layout.visning === 'egen') {
        head.append(el('button', { class: 'mod-remove', type: 'button', 'aria-label': 'Fjern ' + m.navn, title: 'Fjern modulen', text: '×', onclick: () => removeModule(id) }));
      }
      const card = el('article', { class: 'card mod' + (m.wide ? ' wide' : ''), 'data-mod': id }, head);
      if (m.note) card.append(el('p', { class: 'note', text: m.note }));
      if (m.legend) {
        const lg = el('div', { class: 'legend' });
        for (const [c, t, kind] of m.legend) {
          const sw = el('i', { class: 'sw' + (kind ? ' ' + kind : '') });
          if (c) sw.style.background = `var(--${c})`;
          lg.append(el('span', {}, sw, t));
        }
        card.append(lg);
      }
      card.append(el('div', { class: 'mod-body' }));
      host.append(card);
    }
  }
  $('nightSection').hidden = !ids.some((id) => MOD.get(id).del === 'natt');
}

function removeModule(id) {
  S.layout.moduler = activeModules().filter((x) => x !== id);
  saveLayout();
  render();
}

function body(id) { const c = document.querySelector(`[data-mod="${id}"] .mod-body`); return c; }

/* ---------- Tilpass-panelet ---------- */
function openLayoutPanel() {
  const on = activeModules();
  const order = [...on, ...MODULES.map((m) => m.id).filter((id) => !on.includes(id))];
  S.draft = order.map((id) => ({ id, on: on.includes(id) }));
  drawLayoutPanel();
  $('layoutMsg').textContent = '';
  $('layoutPanel').hidden = false;
  $('layoutPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function drawLayoutPanel() {
  for (const [del, host] of [['periode', $('layoutPeriode')], ['natt', $('layoutNatt')]]) {
    host.replaceChildren();
    const items = S.draft.filter((d) => MOD.get(d.id).del === del);
    items.forEach((d, i) => {
      const m = MOD.get(d.id);
      const cb = el('input', { type: 'checkbox', id: 'lay-' + d.id });
      cb.checked = d.on;
      cb.addEventListener('change', () => { d.on = cb.checked; drawLayoutPanel(); });
      const move = (dir) => {
        const j = i + dir; if (j < 0 || j >= items.length) return;
        const a = S.draft.indexOf(items[i]), b = S.draft.indexOf(items[j]);
        [S.draft[a], S.draft[b]] = [S.draft[b], S.draft[a]];
        drawLayoutPanel();
      };
      const up = el('button', { class: 'btn icon small', type: 'button', 'aria-label': 'Flytt opp', text: '↑', onclick: () => move(-1) });
      const down = el('button', { class: 'btn icon small', type: 'button', 'aria-label': 'Flytt ned', text: '↓', onclick: () => move(1) });
      up.disabled = i === 0; down.disabled = i === items.length - 1;
      host.append(el('li', { class: d.on ? '' : 'off' }, el('label', { for: 'lay-' + d.id }, cb, m.navn), el('span', { class: 'move' }, up, down)));
    });
  }
}

$('customize').addEventListener('click', openLayoutPanel);
$('layoutCancel').addEventListener('click', () => { $('layoutPanel').hidden = true; });
$('layoutSave').addEventListener('click', async () => {
  S.layout.visning = 'egen';
  S.layout.moduler = S.draft.filter((d) => d.on).map((d) => d.id);
  $('layoutMsg').textContent = 'Lagrer …';
  await saveLayout();
  $('layoutPanel').hidden = true;
  render();
});
document.querySelectorAll('#viewSeg button').forEach((b) => b.addEventListener('click', () => {
  S.layout.visning = b.dataset.view;
  if (b.dataset.view === 'egen' && !(S.layout.moduler && S.layout.moduler.length)) S.layout.moduler = [...PRESETS.enkel];
  saveLayout();
  render();
  if (b.dataset.view === 'egen' && S.layout.moduler.join() === PRESETS.enkel.join()) openLayoutPanel();
}));

/* ---------- Opplasting: se upload.js ---------- */
const dlg = $('uploadDlg');

/* ---------- Periode ---------- */
function range() {
  if (!S.nights.length) return null;
  const first = S.nights[0].dato, last = S.nights[S.nights.length - 1].dato;
  if (S.sel.from || S.sel.to) {
    const a = S.sel.from || first, b = S.sel.to || last;
    return a <= b ? { from: a, to: b } : { from: b, to: a };
  }
  if (!S.sel.days) return { from: first, to: last };
  return { from: addDays(last, -(S.sel.days - 1)), to: last };
}
const inRange = (r, g) => r.dato >= g.from && r.dato <= g.to;

document.querySelectorAll('#periodSeg button').forEach((b) => b.addEventListener('click', () => {
  S.sel = { days: Number(b.dataset.days), from: null, to: null };
  try { localStorage.setItem('cpap-periode', JSON.stringify({ days: S.sel.days })); } catch (e) {}
  render();
}));
['from', 'to'].forEach((id) => $(id).addEventListener('change', () => {
  S.sel = { days: -1, from: $('from').value || null, to: $('to').value || null };
  render();
}));

function stats(rows) {
  if (!rows.length) return null;
  const sum = (f) => rows.reduce((s, r) => s + (r[f] || 0), 0);
  const avg = (f) => { const v = rows.filter((r) => r[f] != null); return v.length ? v.reduce((s, r) => s + r[f], 0) / v.length : null; };
  const t = sum('timer');
  return {
    netter: rows.length, ahi: avg('ahi'), timer: avg('timer'), timerSum: t,
    over4: rows.filter((r) => (r.timer || 0) >= C.TIMER).length,
    caH: t ? sum('sentrale') / t : null, oaH: t ? sum('obstruktive') / t : null,
    leak90: avg('lekkasje90'), tak: rows.filter((r) => (r.trykkMaks || 0) >= C.TAK).length
  };
}

function deltaEl(e, cur, prev, dec, lowerIsBetter, label) {
  e.textContent = ''; e.className = 'delta';
  if (cur == null || prev == null) return;
  const d = cur - prev;
  if (Math.abs(d) < Math.pow(10, -dec) / 2) { e.textContent = `Uendret fra ${label}`; return; }
  e.classList.add((lowerIsBetter ? d < 0 : d > 0) ? 'good' : 'bad');
  e.textContent = `${d < 0 ? '▼' : '▲'} ${n(Math.abs(d), dec)} fra ${label}`;
}

/* ---------- Diagrammer per natt i perioden ---------- */
function frame(host, o) {
  host.replaceChildren();
  const W = Math.max(host.clientWidth, 260), H = o.height || 220;
  const svg = d3.select(host).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).style('display', 'block');
  const y = d3.scaleLinear([o.yMin || 0, Math.max(o.yMax || 1, 1e-6)], [H - 26, 12]).nice();
  const ticks = y.ticks(4);
  const tmp = svg.append('g'); let lw = 0;
  ticks.forEach((t) => { lw = Math.max(lw, tmp.append('text').text(n(t, o.yDec || 0)).node().getComputedTextLength()); });
  tmp.remove();
  const m = { l: Math.ceil(lw) + 8, r: 6 };
  const x = d3.scaleBand(o.keys, [m.l, W - m.r]).paddingInner(o.keys.length > 60 ? 0.15 : 0.3).paddingOuter(0.1);
  const g = svg.append('g');
  g.selectAll('line').data(ticks).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).style('stroke', 'var(--grid)');
  g.selectAll('text').data(ticks).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text((t) => n(t, o.yDec || 0));
  const hl = svg.append('rect').attr('y', 6).attr('height', H - 32).attr('width', x.step()).style('fill', 'var(--fg)').style('opacity', 0);
  const sel = svg.append('rect').attr('y', 6).attr('height', H - 32).attr('width', x.step()).style('fill', 'var(--accent)').style('opacity', 0);
  const plot = svg.append('g');
  const y0 = y(y.domain()[0]);
  svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y0).attr('y2', y0).style('stroke', 'var(--line)');
  let lastEnd = -Infinity;
  const xl = svg.append('g');
  o.keys.forEach((k) => {
    const cx = x(k) + x.bandwidth() / 2;
    const t = xl.append('text').attr('x', cx).attr('y', H - 8).attr('text-anchor', 'middle').text((o.xFmt || dag)(k));
    const w = t.node().getComputedTextLength();
    if (cx - w / 2 < lastEnd + 12 || cx - w / 2 < 0 || cx + w / 2 > W) t.remove(); else lastEnd = cx + w / 2;
  });
  const tip = d3.select(host).append('div').attr('class', 'tip');
  const bw = x.bandwidth();
  const f = { svg, plot, x, y, y0, W, H, m, tip, hl, bw, cx: (k) => x(k) + bw / 2, left: (k) => x(k) - (x.step() - bw) / 2 };
  if (S.natt.dato && x(S.natt.dato) != null) sel.attr('x', f.left(S.natt.dato)).style('opacity', 0.1);
  return f;
}

function refLine(f, v, label) {
  const yy = f.y(v);
  if (yy < 8) return;
  f.plot.append('line').attr('x1', f.m.l).attr('x2', f.W - f.m.r).attr('y1', yy).attr('y2', yy)
    .style('stroke', 'var(--ref)').style('stroke-width', 1.5).style('stroke-dasharray', '4 3');
  f.plot.append('text').attr('x', f.W - f.m.r).attr('y', yy - 4).attr('text-anchor', 'end').text(label)
    .style('stroke', 'var(--panel)').style('stroke-width', 3).style('paint-order', 'stroke');
}
function line(f, rows, key, field, color) {
  f.plot.append('path').datum(rows.filter((r) => r[field] != null))
    .attr('d', d3.line().x((r) => f.cx(r[key])).y((r) => f.y(r[field])))
    .style('fill', 'none').style('stroke', color).style('stroke-width', 2).style('stroke-linecap', 'round').style('stroke-linejoin', 'round');
}
function bars(f, rows, key, field, color) {
  f.plot.append('g').selectAll('rect').data(rows.filter((r) => r[field] != null)).join('rect')
    .attr('x', (r) => f.x(r[key])).attr('width', f.bw).attr('y', (r) => f.y(r[field])).attr('height', (r) => Math.max(0, f.y0 - f.y(r[field])))
    .attr('rx', Math.min(3, f.bw / 2)).style('fill', typeof color === 'function' ? color : () => color);
}
function showTip(tip, W, cx, head, lines) {
  tip.selectAll('*').remove();
  tip.append('div').attr('class', 'h').text(head);
  for (const [col, lab, val] of lines) {
    const row = tip.append('div');
    if (col) row.append('i').attr('class', 'sw').style('background', col);
    row.append('span').text(lab + ' ');
    row.append('b').text(val);
  }
  const tw = tip.node().offsetWidth;
  const left = cx + 14 + tw > W ? Math.max(0, cx - 14 - tw) : cx + 14;
  tip.style('left', left + 'px').style('opacity', 1);
}
function hover(f, rows, key, content, clickable = true) {
  f.svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', (r) => f.left(r[key])).attr('width', f.x.step()).attr('y', 0).attr('height', f.H).style('fill', 'transparent')
    .style('cursor', clickable ? 'pointer' : null)
    .on('pointerenter', (ev, r) => {
      const c = content(r);
      showTip(f.tip, f.W, f.cx(r[key]), c.head, c.lines);
      f.hl.attr('x', f.left(r[key])).style('opacity', 0.06);
    })
    .on('pointerleave', () => { f.tip.style('opacity', 0); f.hl.style('opacity', 0); })
    .on('click', (ev, r) => { if (clickable && S.have.has(r[key])) selectNight(r[key], true); });
}
function weekKey(s) { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); }

function emptyMsg(host, text) { host.replaceChildren(el('div', { class: 'empty-mod', text })); }

const PERIOD_RENDER = {
  nokkeltall(host, ctx) {
    const { s, p, len } = ctx;
    const label = `forrige ${len} dager`;
    const tile = (lbl, big, unit, sub) => el('div', { class: 'tile' }, el('span', { class: 'lbl', text: lbl }),
      el('span', { class: 'big' }, big, unit ? el('span', { class: 'unit', text: unit }) : null), el('span', { class: 'sub' }, ...sub));
    const pill = el('span', { class: 'pill ' + (s.ahi < C.AHI ? 'good' : 'bad'), text: s.ahi < C.AHI ? 'Under 5' : 'Over 5' });
    const d1 = el('span'); deltaEl(d1, s.ahi, p && p.ahi, 2, true, label);
    const d2 = el('span'); deltaEl(d2, s.caH, p && p.caH, 2, true, label);
    const d3_ = el('span'); deltaEl(d3_, s.leak90, p && p.leak90, 1, true, label);
    host.replaceChildren(el('div', { class: 'tiles' },
      tile('AHI, snitt per natt', n(s.ahi, 2), null, [pill, ' ', d1]),
      tile('Timer med maske per natt', n(s.timer, 1), 'timer', [`${s.over4} av ${s.netter} netter over ${C.TIMER} timer`]),
      tile('Sentrale apnéer per time', n(s.caH, 2), null, [d2.textContent ? d2 : `Obstruktive: ${n(s.oaH, 2)} per time`]),
      tile('Lekkasje, 90 %-persentil', n(s.leak90, 1), 'L/min', [d3_.textContent ? d3_ : 'Snitt av nettene i perioden'])
    ));
  },
  ahi(host, ctx) {
    const { R, keys, col } = ctx;
    const f = frame(host, { keys, yMax: Math.max(d3.max(R, (r) => r.ahi) || 0, C.AHI) });
    bars(f, R, 'dato', 'ahi', col.muted);
    refLine(f, C.AHI, `AHI ${C.AHI}`);
    line(f, R, 'dato', 'snitt7', col.s1);
    hover(f, R, 'dato', (r) => ({ head: dagÅr(r.dato), lines: [[col.muted, 'AHI', n(r.ahi, 2)], [col.s1, 'Snitt 7 netter', n(r.snitt7, 2)]] }));
  },
  hendelser(host, ctx) {
    const { R, col } = ctx;
    const weekly = R.length > 45;
    const card = host.closest('.mod');
    card.querySelector('h2').textContent = weekly ? 'Hendelser per time, per uke' : 'Hendelser per time, per natt';
    let groups;
    if (weekly) {
      const m = new Map();
      for (const r of R) {
        const k = weekKey(r.dato); const a = m.get(k) || { k, t: 0, ca: 0, oa: 0, h: 0, n: 0 };
        a.t += r.timer || 0; a.ca += r.sentrale || 0; a.oa += r.obstruktive || 0; a.h += (r.hypopneer || 0) + (r.uklassifisert || 0); a.n++;
        m.set(k, a);
      }
      groups = [...m.values()];
    } else {
      groups = R.map((r) => ({ k: r.dato, t: r.timer || 0, ca: r.sentrale || 0, oa: r.obstruktive || 0, h: (r.hypopneer || 0) + (r.uklassifisert || 0), n: 1 }));
    }
    groups = groups.map((a) => ({ k: a.k, n: a.n, sentrale: a.t ? a.ca / a.t : 0, obstruktive: a.t ? a.oa / a.t : 0, hypo: a.t ? a.h / a.t : 0 }));
    const evKeys = ['sentrale', 'obstruktive', 'hypo'], evCol = [col.ca, col.oa, col.h], evNavn = ['Sentrale', 'Obstruktive', 'Hypopnéer m.m.'];
    const evMax = d3.max(groups, (g) => g.sentrale + g.obstruktive + g.hypo) || 1;
    const f = frame(host, { keys: groups.map((g) => g.k), yMax: evMax, yDec: evMax < 3 ? 1 : 0 });
    d3.stack().keys(evKeys)(groups).forEach((s, i) => {
      f.plot.append('g').selectAll('rect').data(s).join('rect')
        .attr('x', (p) => f.x(p.data.k)).attr('width', f.bw)
        .attr('y', (p) => f.y(p[1]) + (i ? 1 : 0)).attr('height', (p) => Math.max(0, f.y(p[0]) - f.y(p[1]) - (i ? 2 : 0)))
        .attr('rx', i === 2 ? Math.min(3, f.bw / 2) : 0).style('fill', evCol[i]);
    });
    hover(f, groups, 'k', (g) => ({
      head: weekly ? `Uke fra ${dag(g.k)} (${g.n} ${g.n === 1 ? 'natt' : 'netter'})` : dagÅr(g.k),
      lines: [...evKeys.map((k, i) => [evCol[i], evNavn[i], n(g[k], 2) + ' /t']), [null, 'Totalt', n(g.sentrale + g.obstruktive + g.hypo, 2) + ' /t']]
    }), !weekly);
  },
  timer(host, ctx) {
    const { R, keys, col } = ctx;
    const f = frame(host, { keys, yMax: d3.max(R, (r) => r.timer) || C.TIMER });
    bars(f, R, 'dato', 'timer', (r) => (r.timer >= C.TIMER ? col.s1 : col.bad));
    refLine(f, C.TIMER, `${C.TIMER} t`);
    hover(f, R, 'dato', (r) => ({ head: dagÅr(r.dato), lines: [[r.timer >= C.TIMER ? col.s1 : col.bad, 'Timer', n(r.timer, 2)], [null, 'Økter', r.okter == null ? '–' : String(r.okter)]] }));
  },
  trykk(host, ctx) {
    const { R, keys, col } = ctx;
    const f = frame(host, { keys, yMin: 0, yMax: Math.max(d3.max(R, (r) => r.trykkMaks) || 0, C.TAK) });
    f.plot.append('g').selectAll('circle').data(R.filter((r) => r.trykkMaks != null)).join('circle')
      .attr('cx', (r) => f.cx(r.dato)).attr('cy', (r) => f.y(r.trykkMaks)).attr('r', R.length > 120 ? 2 : 3)
      .style('fill', (r) => (r.trykkMaks >= C.TAK ? col.bad : col.muted));
    line(f, R, 'dato', 'trykkSnitt', col.s1);
    line(f, R, 'dato', 'trykk90', col.s2);
    hover(f, R, 'dato', (r) => ({ head: dagÅr(r.dato), lines: [[col.s1, 'Snitt', n(r.trykkSnitt, 1)], [col.s2, '90 %', n(r.trykk90, 1)], [col.muted, 'Maks', n(r.trykkMaks, 1)]] }));
  },
  lekkasje(host, ctx) {
    const { R, keys, col } = ctx;
    const f = frame(host, { keys, yMax: Math.max(d3.max(R, (r) => r.lekkasje90) || 0, 5) });
    bars(f, R, 'dato', 'lekkasje90', col.s3);
    hover(f, R, 'dato', (r) => ({ head: dagÅr(r.dato), lines: [[col.s3, '90 %', n(r.lekkasje90, 1) + ' L/min'], [col.muted, 'Maks', n(r.lekkasjeMaks, 1) + ' L/min'], [null, 'Snitt', n(r.lekkasjeSnitt, 2) + ' L/min']] }));
  },
  pustefrekvens(host, ctx) {
    const { R, keys, col } = ctx;
    if (!R.some((r) => r.pustefrekvens != null)) return emptyMsg(host, 'Ingen netter i perioden.');
    const v = R.filter((r) => r.pustefrekvens != null);
    const f = frame(host, { keys, yMin: Math.floor((d3.min(v, (r) => r.pustefrekvens) - 2) / 2) * 2, yMax: d3.max(v, (r) => r.pustefrekvens) + 1 });
    line(f, R, 'dato', 'pustefrekvens', col.s5);
    f.plot.append('g').selectAll('circle').data(v).join('circle').attr('cx', (r) => f.cx(r.dato)).attr('cy', (r) => f.y(r.pustefrekvens)).attr('r', 3).style('fill', col.s5);
    hover(f, R, 'dato', (r) => ({ head: dagÅr(r.dato), lines: [[col.s5, 'Pustefrekvens', n(r.pustefrekvens, 1) + ' /min'], [null, 'Minuttventilasjon', n(r.minuttventilasjon, 1) + ' L/min']] }));
  },
  tidevolum(host, ctx) {
    const { R, keys, col } = ctx;
    if (!R.some((r) => r.tidevolum != null)) return emptyMsg(host, 'Ingen netter i perioden.');
    const v = R.filter((r) => r.tidevolum != null);
    const f = frame(host, { keys, yMin: Math.max(0, Math.floor((d3.min(v, (r) => r.tidevolum) - 50) / 50) * 50), yMax: d3.max(v, (r) => r.tidevolum) + 20 });
    line(f, R, 'dato', 'tidevolum', col.s4);
    f.plot.append('g').selectAll('circle').data(v).join('circle').attr('cx', (r) => f.cx(r.dato)).attr('cy', (r) => f.y(r.tidevolum)).attr('r', 3).style('fill', col.s4);
    hover(f, R, 'dato', (r) => ({ head: dagÅr(r.dato), lines: [[col.s4, 'Tidevolum', n(r.tidevolum, 0) + ' mL'], [null, 'Flowbegrensning', n(r.flowbegrensning, 2)], [null, 'Snorking', n(r.snorking, 2)]] }));
  },
  tabell(host, ctx) {
    const cols = [['Natt'], ['AHI'], ['Sentrale'], ['Obstruktive'], ['Hypopnéer'], ['Timer'], ['Økter'], ['Trykk snitt'], ['Trykk maks'], ['Lekkasje 90 %'], ['Pustefrekv.'], ['Tidevolum']];
    const thead = el('thead', {}, el('tr', {}, ...cols.map(([t]) => el('th', { text: t }))));
    const tb = el('tbody');
    for (const r of ctx.rows.slice().reverse()) {
      const name = dagÅr(r.dato);
      const cells = [[name], [n(r.ahi, 2), r.ahi >= C.AHI], [n(r.sentrale, 0)], [n(r.obstruktive, 0)], [n(r.hypopneer, 0)], [n(r.timer, 2)], [n(r.okter, 0)],
        [n(r.trykkSnitt, 1)], [n(r.trykkMaks, 1), r.trykkMaks >= C.TAK], [n(r.lekkasje90, 1)], [n(r.pustefrekvens, 1)], [n(r.tidevolum, 0)]];
      const tr = el('tr', { class: 'click' + (r.dato === S.natt.dato ? ' sel' : ''), tabindex: '0', onclick: () => selectNight(r.dato, true), onkeydown: (e) => { if (e.key === 'Enter') selectNight(r.dato, true); } });
      for (const [v, flag] of cells) { const td = el('td', { class: flag ? 'flag' : '' }); td.append(v); tr.append(td); }
      tb.append(tr);
    }
    host.replaceChildren(el('div', { class: 'tablewrap' }, el('table', {}, thead, tb)));
  },
  ai(host, ctx) {
    if (host.dataset.ready) return;
    host.dataset.ready = '1';
    const out = el('div', { class: 'ai-out' }), msg = el('div', { class: 'msg' });
    const btn = el('button', { class: 'btn', type: 'button', text: 'Tolk valgt periode' });
    btn.addEventListener('click', async () => {
      const g = range(); if (!g) return;
      btn.disabled = true; out.textContent = ''; msg.className = 'msg'; msg.textContent = 'Leser tallene, dette tar noen sekunder …';
      try { const r = await api('/api/tolk', { method: 'POST', body: JSON.stringify({ fra: g.from, til: g.to }) }); out.textContent = r.tekst; msg.textContent = ''; }
      catch (e) { if (!e.auth) { msg.className = 'msg err'; msg.textContent = e.message; } }
      finally { btn.disabled = false; }
    });
    host.replaceChildren(el('div', { style: 'display:grid; gap:10px' }, el('div', {}, btn), msg, out));
  }
};

function renderPeriod() {
  const g = range();
  const first = S.nights[0].dato, last = S.nights[S.nights.length - 1].dato;
  document.querySelectorAll('#periodSeg button').forEach((b) => b.setAttribute('aria-pressed', String(!S.sel.from && !S.sel.to && Number(b.dataset.days) === S.sel.days)));
  $('from').value = g.from; $('to').value = g.to; $('from').min = $('to').min = first; $('from').max = $('to').max = last;
  const rows = S.nights.filter((r) => inRange(r, g));
  const len = daysBetween(g.from, g.to) + 1;
  const prevRows = S.nights.filter((r) => inRange(r, { from: addDays(g.from, -len), to: addDays(g.from, -1) }));
  $('periodLabel').textContent = `${dagÅr(g.from)} – ${dagÅr(g.to)} · ${rows.length} netter`;
  const roll = new Map();
  S.nights.forEach((r, i) => {
    const w = S.nights.slice(Math.max(0, i - 6), i + 1).filter((x) => x.ahi != null);
    roll.set(r.dato, w.length ? w.reduce((s, x) => s + x.ahi, 0) / w.length : null);
  });
  const R = rows.map((r) => ({ ...r, snitt7: roll.get(r.dato) }));
  const col = { s1: cssVar('--s1'), s2: cssVar('--s2'), s3: cssVar('--s3'), s4: cssVar('--s4'), s5: cssVar('--s5'), muted: cssVar('--muted'), bad: cssVar('--bad-mark'),
    oa: cssVar('--ev-oa'), ca: cssVar('--ev-ca'), h: cssVar('--ev-h') };
  const s = stats(rows), p = prevRows.length >= Math.min(3, rows.length) ? stats(prevRows) : null;
  const ctx = { rows, R, keys: R.map((r) => r.dato), col, s, p, len };
  for (const id of activeModules()) {
    const m = MOD.get(id);
    if (m.del !== 'periode') continue;
    const host = body(id); if (!host) continue;
    if (!rows.length && id !== 'ai') { emptyMsg(host, 'Ingen netter i perioden.'); continue; }
    PERIOD_RENDER[id](host, ctx);
  }
}

/* ---------- Hovedtegning ---------- */
function render() {
  if (!S.loaded || !S.authed) return;
  buildCards();
  const empty = !S.nights.length;
  $('emptyState').hidden = !empty;
  $('main').hidden = empty;
  if (empty) { $('status').textContent = 'Ingen netter lastet opp ennå.'; return; }
  const first = S.nights[0].dato, last = S.nights[S.nights.length - 1].dato;
  $('status').textContent = `${S.nights.length} netter lastet opp, ${dagÅr(first)} – ${dagÅr(last)}.`;
  renderPeriod();
  renderNight();
}

let rt, lastW = 0;
new ResizeObserver(() => {
  const w = document.querySelector('.wrap').clientWidth;
  if (w === lastW) return;
  lastW = w;
  clearTimeout(rt); rt = setTimeout(render, 150);
}).observe(document.querySelector('.wrap'));

/* ---------- Innlogging ---------- */
function showLogin() {
  S.authed = false; S.loaded = false; S.nights = []; S.have = new Map(); S.cache.clear();
  S.natt = { dato: null, data: null, idx: null, loading: false, err: null, zoom: null, brp: new Map(), brpLoading: false, valgt: null };
  builtSig = '';
  $('periodMods').replaceChildren(); $('nightMods').replaceChildren();
  $('loginCard').hidden = false; $('main').hidden = true; $('emptyState').hidden = true;
  if (dlg.open) dlg.close();
  $('topActions').hidden = true; $('layoutPanel').hidden = true;
  $('status').textContent = 'Privat. Logg inn for å fortsette.';
  setTimeout(() => $('pw').focus(), 0);
}
async function showApp() {
  S.authed = true;
  $('loginCard').hidden = true; $('topActions').hidden = false;
  $('status').textContent = 'Henter netter …';
  try {
    const [lay] = await Promise.all([api('/api/oppsett').catch(() => null), loadNights()]);
    if (lay) { S.layout = { visning: lay.visning || 'enkel', moduler: lay.moduler || null }; builtSig = ''; render(); }
  } catch (e) { if (!e.auth) $('status').textContent = 'Kunne ikke hente nettene. Last siden på nytt.'; }
}
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const m = $('loginMsg'); m.className = 'msg'; m.textContent = 'Logger inn …';
  try {
    const r = await fetch('/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passord: $('pw').value }) });
    if (!r.ok) { m.className = 'msg err'; m.textContent = r.status === 401 ? 'Feil passord.' : 'Innloggingen feilet.'; return; }
    $('pw').value = ''; m.textContent = '';
    showApp();
  } catch (err) { m.className = 'msg err'; m.textContent = 'Fikk ikke kontakt med serveren.'; }
});
$('logout').addEventListener('click', async () => {
  try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) {}
  showLogin();
});

