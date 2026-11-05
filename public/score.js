'use strict';
/* global S, el, n, dagÅr, clock, d3, MODULES, MOD, PRESETS, PERIOD_RENDER, NIGHT_RENDER, frame, bars, refLine, hover, emptyMsg, selectNight, setZoom */
// Nattscore, «Maske av og på» og tilhørende moduler. Laster etter app.js og natt.js og legger seg inn i modullisten.

/* ---------- Scoren ---------- */
// Hver faktor gir 0–1, ganges med vekten og summeres til 0–100. Faktorer uten data hoppes over, og resten skaleres opp.
const pct = (x) => Math.max(0, Math.min(1, x));
const lin = (v, full, zero) => pct((v - zero) / (full - zero)); // full gir 1, zero gir 0

const SCORE_FAKTORER = [
  { id: 'bruk', navn: 'Brukstid', vekt: 30,
    fn: (r) => {
      if (r.timer == null) return null;
      const t = r.timer;
      return { f: t >= 7 ? 1 : t >= 4 ? 0.5 + 0.5 * (t - 4) / 3 : 0.5 * t / 4, verdi: `${n(t, 1)} timer med maske` };
    } },
  { id: 'ahi', navn: 'Pustehendelser (AHI)', vekt: 30,
    fn: (r) => {
      if (r.ahi == null) return null;
      const a = r.ahi;
      return { f: a <= 1 ? 1 : a <= 5 ? 1 - 0.3 * (a - 1) / 4 : a <= 15 ? 0.7 * (15 - a) / 10 : 0, verdi: `AHI ${n(a, 2)}` };
    } },
  { id: 'lekkasje', navn: 'Maskelekkasje', vekt: 15,
    fn: (r) => {
      if (r.lekkasjeStor != null) return { f: lin(r.lekkasjeStor, 0, 30), verdi: `${n(r.lekkasjeStor, 1)} % av tiden over 24 L/min` };
      if (r.lekkasje90 != null) return { f: lin(r.lekkasje90, 6, 24), verdi: `90 %-lekkasje ${n(r.lekkasje90, 1)} L/min` };
      return null;
    } },
  { id: 'avtak', navn: 'Maske av og på', vekt: 10,
    fn: (r) => {
      const a = r.avbrudd != null ? r.avbrudd : r.okter != null ? Math.max(0, r.okter - 1) : null;
      if (a == null) return null;
      // Avbrudd på tre minutter eller mer teller fullt, kortere (for eksempel justering av masken) teller 40 %
      const eff = r.avbruddLange != null ? r.avbruddLange + 0.4 * (a - r.avbruddLange) : a;
      const tabell = [1, 0.9, 0.8, 0.65, 0.5, 0.35, 0.2, 0];
      const i = Math.min(7, eff), lo = Math.floor(i), hi = Math.min(7, lo + 1);
      const f = tabell[lo] + (tabell[hi] - tabell[lo]) * (i - lo);
      return { f, verdi: a === 0 ? 'Ingen avbrudd' : `Tatt av ${a} ${a === 1 ? 'gang' : 'ganger'} underveis` + (r.avbruddLange != null ? `, ${r.avbruddLange} på tre minutter eller mer` : '') + (r.pauseMin != null ? `, ${n(r.pauseMin, 0)} min totalt` : '') };
    } },
  { id: 'luftvei', navn: 'Luftveier (flowbegrensning og snorking)', vekt: 10,
    fn: (r) => {
      const deler = [];
      if (r.flowbegrensning90 != null) deler.push([7, lin(r.flowbegrensning90, 0.1, 0.5)]);
      if (r.snorking != null) deler.push([3, lin(r.snorking, 0.1, 1)]);
      if (!deler.length) return null;
      const w = deler.reduce((s, d) => s + d[0], 0);
      return { f: deler.reduce((s, d) => s + d[0] * d[1], 0) / w, verdi: `Flowbegrensning ${n(r.flowbegrensning90, 2)}, snorking ${n(r.snorking, 2)}` };
    } },
  { id: 'oppvakning', navn: 'Oppvåkninger', vekt: 5,
    fn: (r) => {
      if (r.oppvakninger == null || !r.timer) return null;
      const rate = r.oppvakninger / r.timer;
      return { f: lin(rate, 1, 10), verdi: `${n(rate, 1)} per time (${r.oppvakninger} totalt)` };
    } }
];

function nattScore(r) {
  const deler = [];
  let sum = 0, vekt = 0;
  for (const f of SCORE_FAKTORER) {
    const x = f.fn(r);
    if (!x) { deler.push({ id: f.id, navn: f.navn, vekt: f.vekt, mangler: true }); continue; }
    deler.push({ id: f.id, navn: f.navn, vekt: f.vekt, f: x.f, poeng: x.f * f.vekt, verdi: x.verdi });
    sum += x.f * f.vekt; vekt += f.vekt;
  }
  const total = vekt ? Math.round((sum / vekt) * 100) : null;
  return { total, ...scoreBand(total), deler };
}
function scoreBand(t) {
  if (t == null) return { navn: 'Ukjent', farge: '--fg-3', serie: 'muted' };
  if (t >= 85) return { navn: 'Svært bra', farge: '--good', serie: 's3' };
  if (t >= 70) return { navn: 'Bra', farge: '--accent-ink', serie: 's1' };
  if (t >= 50) return { navn: 'Middels', farge: '--warn', serie: 's4' };
  return { navn: 'Svak', farge: '--bad', serie: 'bad-mark' };
}
window.nattScore = nattScore;
window.scoreBand = scoreBand;

/* ---------- Registrer modulene ---------- */
function plasser(mod, etter) {
  MODULES.push(mod); MOD.set(mod.id, mod);
  const i = MODULES.indexOf(mod); MODULES.splice(i, 1);
  const j = etter ? MODULES.findIndex((m) => m.id === etter) + 1 : MODULES.findIndex((m) => m.del === mod.del);
  MODULES.splice(j, 0, mod);
}
plasser({ id: 'natt-score', del: 'natt', navn: 'Nattscore', wide: true });
plasser({ id: 'natt-avtak', del: 'natt', navn: 'Maske av og på', raa: true, note: 'Hver gang masken ble tatt av underveis, og hvor lenge den var av. Maskinen starter en ny økt hver gang masken settes på igjen.' }, 'natt-tidslinje');
plasser({ id: 'score', del: 'periode', navn: 'Score per natt', note: 'Samlet score fra 0 til 100 per natt. Klikk på en søyle for å se hva scoren består av.',
  legend: [['s3', 'Svært bra (85+)'], ['s1', 'Bra (70–84)'], ['s4', 'Middels (50–69)'], ['bad-mark', 'Under 50']] }, 'nokkeltall');
PRESETS.enkel = ['natt-score', 'natt-sammendrag', 'natt-tidslinje', 'natt-trykk', 'nokkeltall', 'score', 'ahi', 'timer'];
PRESETS.avansert = MODULES.map((m) => m.id);

/* ---------- Nattscore-modulen ---------- */
const sek = (s) => (s < 90 ? `${Math.round(s)} sek` : `${Math.round(s / 60)} min`);

NIGHT_RENDER['natt-score'] = function (host, nc) {
  const sc = nattScore(nc.sum);
  const stor = el('div', { class: 'score-stor' }, el('span', { class: 'score-tall', text: sc.total == null ? '–' : String(sc.total) }), el('span', { class: 'score-av', text: '/ 100' }));
  stor.style.color = `var(${sc.farge})`;
  const tilgjengelige = sc.deler.filter((d) => !d.mangler);
  const svakest = tilgjengelige.slice().sort((a, b) => (a.f) - (b.f))[0];
  const tekst = svakest && svakest.f < 0.9 ? `Det som trekker mest ned: ${svakest.navn.toLowerCase()}.` : 'Ingen faktorer trekker nevneverdig ned.';
  const venstre = el('div', { class: 'score-hode' }, stor, el('div', {}, el('div', { class: 'score-navn', text: sc.navn }), el('div', { class: 'note', style: 'margin:2px 0 0', text: tekst })));
  const liste = el('div', { class: 'score-liste' });
  for (const d of sc.deler) {
    const rad = el('div', { class: 'score-rad' });
    const topp = el('div', { class: 'score-topp' }, el('span', { text: d.navn }), el('b', { text: d.mangler ? 'ingen data' : `${n(d.poeng, 1)} av ${d.vekt}` }));
    const bar = el('div', { class: 'score-bar' }, el('i'));
    if (!d.mangler) { bar.firstChild.style.width = Math.round(d.f * 100) + '%'; bar.firstChild.style.background = `var(--${scoreBand(d.f * 100).serie})`; }
    rad.append(topp, bar, el('div', { class: 'note', style: 'margin:2px 0 0', text: d.mangler ? 'Tallet finnes ikke for denne natta, og faktoren er holdt utenfor.' : d.verdi }));
    liste.append(rad);
  }
  host.replaceChildren(el('div', { class: 'score-boks' }, venstre, liste));
};

/* ---------- Maske av og på ---------- */
NIGHT_RENDER['natt-avtak'] = function (host, nc) {
  const ss = nc.data.sessions.slice().sort((a, b) => a.start - b.start);
  if (!ss.length) return emptyMsg(host, 'Ingen økter denne natta.');
  const gaps = [];
  for (let i = 1; i < ss.length; i++) if (ss[i].start > ss[i - 1].end) gaps.push({ fra: ss[i - 1].end, til: ss[i].start });
  const sum = gaps.reduce((s, g) => s + (g.til - g.fra), 0);
  const oppsummering = el('p', { style: 'margin:0 0 8px' }, el('b', { text: `Tatt av ${gaps.length} ${gaps.length === 1 ? 'gang' : 'ganger'} underveis` }),
    document.createTextNode(gaps.length ? `, ${sek(sum)} uten maske til sammen. Satt på ${clock(ss[0].start)}, tatt av for natta ${clock(ss[ss.length - 1].end)}.` : `. Satt på ${clock(ss[0].start)}, tatt av for natta ${clock(ss[ss.length - 1].end)}.`));
  const tb = el('tbody');
  gaps.forEach((g, i) => tb.append(el('tr', { class: 'click', tabindex: '0', onclick: () => setZoom([g.fra - 120, g.til + 120]) },
    el('td', { text: String(i + 1) }), el('td', { text: clock(g.fra, true) }), el('td', { text: clock(g.til, true) }), el('td', { text: sek(g.til - g.fra) }))));
  const kids = [oppsummering];
  if (gaps.length) kids.push(el('div', { class: 'tablewrap', style: 'max-height:260px' }, el('table', {},
    el('thead', {}, el('tr', {}, el('th', { text: '#' }), el('th', { text: 'Tatt av' }), el('th', { text: 'Satt på igjen' }), el('th', { text: 'Varighet' }))), tb)));
  host.replaceChildren(...kids);
};

// Legg til en flis i «Nattens tall»
const origSammendrag = NIGHT_RENDER['natt-sammendrag'];
NIGHT_RENDER['natt-sammendrag'] = function (host, nc) {
  origSammendrag(host, nc);
  const rad = host.querySelector('.tiles');
  if (!rad || !nc.data) return;
  const ss = nc.data.sessions.slice().sort((a, b) => a.start - b.start);
  let gaps = 0, pause = 0;
  for (let i = 1; i < ss.length; i++) if (ss[i].start > ss[i - 1].end) { gaps++; pause += ss[i].start - ss[i - 1].end; }
  rad.append(el('div', { class: 'tile' }, el('span', { class: 'lbl', text: 'Maske tatt av' }),
    el('span', { class: 'big' }, String(gaps), el('span', { class: 'unit', text: gaps === 1 ? 'gang' : 'ganger' })),
    el('span', { class: 'sub', text: gaps ? `${sek(pause)} uten maske, tatt av for natta ${clock(ss[ss.length - 1].end)}` : `Tatt av for natta ${clock(ss[ss.length - 1].end)}` })));
};

/* ---------- Periodevisning ---------- */
PERIOD_RENDER.score = function (host, ctx) {
  const { R, keys, col } = ctx;
  const T = R.map((r) => ({ ...r, sc: nattScore(r) }));
  const f = frame(host, { keys, yMax: 100 });
  const farge = (t) => ({ s3: col.s3, s1: col.s1, s4: col.s4, 'bad-mark': col.bad, muted: col.muted }[scoreBand(t).serie]);
  bars(f, T.map((r) => ({ ...r, score: r.sc.total })), 'dato', 'score', (r) => farge(r.sc.total));
  refLine(f, 85, '85'); refLine(f, 70, '70');
  hover(f, T, 'dato', (r) => ({ head: dagÅr(r.dato), lines: [[farge(r.sc.total), `Score (${r.sc.navn})`, String(r.sc.total ?? '–')], ...r.sc.deler.filter((d) => !d.mangler).map((d) => [null, d.navn.split(' (')[0], `${n(d.poeng, 1)}/${d.vekt}`])] }));
};

const origNokkel = PERIOD_RENDER.nokkeltall;
PERIOD_RENDER.nokkeltall = function (host, ctx) {
  origNokkel(host, ctx);
  const rad = host.querySelector('.tiles');
  if (!rad) return;
  const tall = ctx.rows.map((r) => nattScore(r).total).filter((x) => x != null);
  if (!tall.length) return;
  const snitt = tall.reduce((s, x) => s + x, 0) / tall.length;
  const b = scoreBand(snitt);
  const stor = el('span', { class: 'big', text: n(snitt, 0) });
  stor.style.color = `var(${b.farge})`;
  rad.append(el('div', { class: 'tile' }, el('span', { class: 'lbl', text: 'Snittscore' }), stor, el('span', { class: 'sub', text: `${b.navn}. Best ${Math.max(...tall)}, svakest ${Math.min(...tall)}.` })));
};

const origTabell = PERIOD_RENDER.tabell;
PERIOD_RENDER.tabell = function (host, ctx) {
  origTabell(host, ctx);
  const rader = ctx.rows.slice().reverse();
  const tr0 = host.querySelector('thead tr');
  if (!tr0) return;
  tr0.querySelector('th').after(el('th', { text: 'Score' }));
  host.querySelectorAll('tbody tr').forEach((tr, i) => {
    const sc = nattScore(rader[i]);
    const td = el('td', { text: String(sc.total ?? '–') });
    td.style.color = `var(${sc.farge})`; td.style.fontWeight = '600';
    tr.children[0].after(td);
  });
};

// Score i nattvelgeren
const origRenderNight = window.renderNight;
window.renderNight = function () {
  origRenderNight();
  const sel = document.getElementById('nightSelect');
  if (!sel) return;
  for (const o of sel.options) {
    const r = S.have.get(o.value);
    if (r) o.textContent = `${dagÅr(o.value)} · score ${nattScore(r).total ?? '–'}`;
  }
};
