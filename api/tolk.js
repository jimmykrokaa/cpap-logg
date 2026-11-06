import { requireLogin } from '../lib/auth.js';
import { readStore, sortedNights } from '../lib/store.js';

// Modeller prøves i rekkefølge: den første som svarer, brukes. Kan overstyres med AI_MODEL (kommaseparert).
const MODELS = (process.env.AI_MODEL || 'google/gemini-2.5-flash-lite,openai/gpt-4o-mini,anthropic/claude-haiku-4.5').split(',').map((m) => m.trim()).filter(Boolean);
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

  const token = process.env.AI_GATEWAY_API_KEY;
  if (!token) return res.status(503).json({ error: 'AI er ikke satt opp. Legg inn miljøvariabelen AI_GATEWAY_API_KEY på Netlify.' });

  try {
    let lastStatus = 0;
    for (const model of MODELS) {
      const r = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
      });
      if (r.ok) {
        const data = await r.json();
        const text = data.choices?.[0]?.message?.content || '';
        if (text) return res.json({ tekst: text, modell: model });
        continue;
      }
      lastStatus = r.status;
      const detail = (await r.text()).slice(0, 300);
      console.error('AI Gateway', model, r.status, detail);
      if (r.status === 403 || r.status === 402) {
        return res.status(502).json({ error: /credit card/i.test(detail) ? 'Vercel krever et betalingskort på kontoen for å bruke AI. Legg det til under AI Gateway i Vercel.' : 'AI-kvoten er brukt opp for nå, eller kontoen mangler tilgang. Prøv igjen senere.' });
      }
      if (r.status === 429) return res.status(502).json({ error: 'For mange forespørsler akkurat nå. Prøv igjen om litt.' });
    }
    res.status(502).json({ error: `AI-tjenesten svarte ikke som forventet (${lastStatus || 'ingen svar'}).` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Tolkningen feilet.' });
  }
}
