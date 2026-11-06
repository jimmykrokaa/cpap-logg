import { requireLogin } from '../lib/auth.js';
import { readStore, sortedNights } from '../lib/store.js';

// AI-kall går via Netlify AI Gateway. Netlify setter nøkler og adresser for Gemini, OpenAI og Anthropic
// automatisk i funksjonene (krever en kredittbasert plan og minst én produksjonsdeploy).
// Modeller prøves i rekkefølge: den første som svarer, brukes. Kan overstyres med AI_MODEL (kommaseparert).
const MODELS = (process.env.AI_MODEL || 'gemini-3.5-flash-lite,gpt-5.4-mini,claude-haiku-5-5').split(',').map((m) => m.trim()).filter(Boolean);
const MAX_TOKENS = 4000;

const provider = (model) => (/^gemini/.test(model) ? 'gemini' : /^claude/.test(model) ? 'anthropic' : 'openai');

export function aiAvailable() {
  return MODELS.some((m) => keyFor(provider(m)));
}

function keyFor(p) {
  const env = process.env;
  if (p === 'gemini') return env.GEMINI_API_KEY && env.GOOGLE_GEMINI_BASE_URL;
  if (p === 'anthropic') return env.ANTHROPIC_API_KEY && env.ANTHROPIC_BASE_URL;
  return env.OPENAI_API_KEY && env.OPENAI_BASE_URL;
}

const base = (v) => v.replace(/\/+$/, '');

// Sender prompten til én modell. Gir { ok, status, tekst, detalj }.
async function callModel(model, prompt) {
  const env = process.env;
  const p = provider(model);
  let r;
  if (p === 'gemini') {
    r = await fetch(`${base(env.GOOGLE_GEMINI_BASE_URL)}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: MAX_TOKENS } })
    });
  } else if (p === 'anthropic') {
    r = await fetch(`${base(env.ANTHROPIC_BASE_URL)}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: prompt }] })
    });
  } else {
    r = await fetch(`${base(env.OPENAI_BASE_URL)}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model, max_completion_tokens: MAX_TOKENS, messages: [{ role: 'user', content: prompt }] })
    });
  }
  if (!r.ok) return { ok: false, status: r.status, detalj: (await r.text()).slice(0, 300) };
  const d = await r.json();
  let tekst = '';
  if (p === 'gemini') tekst = (d.candidates?.[0]?.content?.parts || []).filter((x) => !x.thought).map((x) => x.text || '').join('');
  else if (p === 'anthropic') tekst = (d.content || []).filter((x) => x.type === 'text').map((x) => x.text).join('');
  else tekst = d.choices?.[0]?.message?.content || '';
  return { ok: true, status: r.status, tekst: tekst.trim() };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const f2 = (v) => (v == null ? '' : Number(v).toFixed(2));
const COLS = ['dato', 'ahi', 'timer', 'sentrale', 'obstruktive', 'hypopneer', 'uklassifisert', 'oppvakninger', 'trykkSnitt', 'trykk90', 'trykkMaks',
  'lekkasje90', 'lekkasjeMaks', 'okter', 'pustefrekvens', 'tidevolum', 'minuttventilasjon', 'flowbegrensning', 'snorking'];

const INTRO = 'Du hjelper en person å forstå sine egne CPAP-data fra en ResMed AirSense 11 (automatisk CPAP med trykkområde 10–20 cmH2O). Skriv på norsk bokmål, vennlig og konkret.';
const STIL = 'Skriv ren tekst uten markdown-tegn som # eller **. Bruk korte overskrifter på egen linje og korte avsnitt. Bruk komma som desimaltegn. Avslutt med én setning om at dette ikke er medisinsk rådgivning og at endringer i innstillinger bør tas med lege.';

function periodPrompt(rows, fra, til) {
  const t = rows.reduce((s, r) => s + (r.timer || 0), 0);
  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const avg = (k) => { const v = rows.filter((r) => r[k] != null); return v.length ? v.reduce((s, r) => s + r[k], 0) / v.length : null; };
  const csv = [COLS.join(',')].concat(rows.map((r) => COLS.map((k) => (r[k] == null ? '' : r[k])).join(','))).join('\n');
  return `${INTRO}

Tolk perioden ${fra} til ${til} (${rows.length} netter). Beskriv:
1. Hovedinntrykket i to-tre setninger.
2. Trender i AHI og hendelsestyper (sentrale, obstruktive, hypopnéer) gjennom perioden.
3. Bruk (timer per natt, netter under 4 timer, antall økter).
4. Trykk og lekkasje, inkludert netter der trykket når 20.
5. Pust (pustefrekvens, tidevolum, minuttventilasjon, flowbegrensning, snorking) der det finnes tall.
6. Netter som skiller seg ut, med dato.
7. Hva som kan være lurt å følge med på.

${STIL}

Sammendrag: snitt AHI ${f2(avg('ahi'))}, snitt timer ${f2(avg('timer'))}, sentrale per time ${f2(t ? sum('sentrale') / t : null)}, obstruktive per time ${f2(t ? sum('obstruktive') / t : null)}, netter over 4 timer: ${rows.filter((r) => (r.timer || 0) >= 4).length} av ${rows.length}, netter med trykk 20: ${rows.filter((r) => (r.trykkMaks || 0) >= 20).length}. Tomme felt betyr at tallet ikke finnes for den natta.

Data per natt (CSV):
${csv}`;
}

function nightPrompt(row, natt) {
  const ev = (Array.isArray(natt.hendelser) ? natt.hendelser : []).slice(0, 400)
    .map((e) => `${String(e.tid).slice(0, 8)} ${String(e.type).slice(0, 30)} ${Number(e.varighet) || 0}s`).join('\n');
  const okter = (Array.isArray(natt.okter) ? natt.okter : []).slice(0, 30).map((o) => `${String(o.fra).slice(0, 5)}–${String(o.til).slice(0, 5)}`).join(', ');
  const minutter = (Array.isArray(natt.minutter) ? natt.minutter : []).slice(0, 1000).map((m) => String(m).slice(0, 160)).join('\n');
  return `${INTRO}

Tolk natta som startet ${row.dato}. Beskriv:
1. Hovedinntrykket i to-tre setninger.
2. Når på natta hendelsene kom, og om de klumper seg sammen.
3. Hvordan trykket og lekkasjen oppførte seg gjennom natta, og om det henger sammen med hendelsene.
4. Pust, flowbegrensning og snorking.
5. Økter og avbrudd (masken av og på).
6. Hva som kan være lurt å følge med på.

${STIL}

Nattens tall: ${COLS.map((k) => `${k}=${row[k] == null ? '' : row[k]}`).join(', ')}
Økter (klokkeslett): ${okter}

Hendelser (klokkeslett, type, varighet):
${ev || 'ingen'}

Snitt per 10 minutter (klokkeslett; trykk cmH2O; lekkasje L/min; pustefrekvens; minuttventilasjon L/min; flowbegrensning 0–1; snorking):
${minutter}`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireLogin(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();
  const b = req.body || {};
  const all = sortedNights(await readStore());
  let prompt;
  if (b.natt && ISO.test(b.natt.dato)) {
    const row = all.find((r) => r.dato === b.natt.dato);
    if (!row) return res.status(400).json({ error: 'Fant ikke natta.' });
    prompt = nightPrompt(row, b.natt);
  } else {
    const { fra, til } = b;
    if (!ISO.test(fra) || !ISO.test(til)) return res.status(400).json({ error: 'Ugyldig periode.' });
    const rows = all.filter((r) => r.dato >= fra && r.dato <= til);
    if (!rows.length) return res.status(400).json({ error: 'Ingen netter i perioden.' });
    prompt = periodPrompt(rows, fra, til);
  }

  const modeller = MODELS.filter((m) => keyFor(provider(m)));
  if (!modeller.length) {
    return res.status(503).json({ error: 'AI er ikke tilgjengelig ennå. Netlify AI Gateway krever en kredittbasert plan (også gratisplanen) og minst én produksjonsdeploy.' });
  }

  try {
    let lastStatus = 0;
    for (const model of modeller) {
      const r = await callModel(model, prompt);
      if (r.ok) {
        if (r.tekst) return res.json({ tekst: r.tekst, modell: model });
        continue;
      }
      lastStatus = r.status;
      console.error('AI Gateway', model, r.status, r.detalj);
      if (r.status === 429) return res.status(502).json({ error: 'For mange forespørsler, eller AI-kvoten på Netlify er brukt opp for nå. Prøv igjen om litt.' });
      if (r.status === 402) return res.status(502).json({ error: 'Netlify-kontoen er tom for kreditter til AI. Sjekk kreditter under Billing i Netlify.' });
    }
    res.status(502).json({ error: `AI-tjenesten svarte ikke som forventet (${lastStatus || 'tomt svar'}).` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Tolkningen feilet.' });
  }
}
