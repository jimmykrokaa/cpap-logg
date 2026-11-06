# CPAP-logg

Personlig nettapp for å se og tolke CPAP-data (ResMed AirSense 11) fra SD-kortet. Kjører på Netlify (cpap-logg.netlify.app). Flyttet fra Vercel i november 2026. All tekst i appen er på norsk bokmål.

## Oppbygning

- `public/` – frontend i ren HTML, CSS og JavaScript (ingen rammeverk, ingen byggesteg).
  - `edf.js` leser EDF-filene fra SD-kortet i nettleseren, `upload.js` laster opp, `score.js` beregner nattscore, `natt.js` viser én natt, `info.js` har (i)-forklaringene, `tid.js` håndterer tidssoner.
- `api/` – serverhandlere i (req, res)-stil (Node 22, ES-moduler). Alle unntatt `login`, `logout` og `session` krever innlogging via `requireLogin`.
  - `tolk.js` sender data til AI-modeller via Netlify AI Gateway (Gemini, OpenAI og Anthropic prøves i rekkefølge). Netlify setter nøkler og adresser selv.
  - `session.js` sier om AI er tilgjengelig (`ai`) og om lagringen svarer (`lagring`).
- `netlify/functions/api.js` – én Netlify-funksjon på `/api/*` som oversetter Request/Response til handlerne i `api/`. Nye handlere må legges inn i `ROUTES` der.
- `netlify.toml` – publiserer `public/` og setter sikkerhetsheadere. Funksjoner har en grense på 60 s og 6 MB per forespørsel.
- `lib/` – felles kode: `blob.js` (Netlify Blobs), `auth.js` (passord og signert sesjonscookie), `store.js` (nattoppsummeringer), `rawstore.js` (rådata delt opp i biter på 3 MB).

## Lagring

Alt lagres i **Netlify Blobs** (butikken `cpap-logg`, sterk konsistens) under prefikset `cpap/`. Det finnes ingen database, og ingenting må settes opp: Netlify kobler lagringen til funksjonene selv. Gamle data i Vercel Blob ble ikke flyttet med.

**Viktig:** `MARKER` i `lib/store.js` (nå `cpap/v3.json`). Hvis den endres, **slettes alle lagrede data** unntatt `cpap/oppsett.json` neste gang appen åpnes. Ikke endre den uten at brukeren uttrykkelig ber om det.

## Miljøvariabler (ligger i Netlify, aldri i koden)

`APP_PASSWORD`, `SESSION_SECRET` (valgfri), `AI_MODEL` (valgfri, kommaseparert liste over modeller). AI-nøklene (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` med tilhørende `*_BASE_URL`) setter Netlify AI Gateway selv. Ikke sett dem manuelt, da slås gatewayen av for den leverandøren.

## Arbeidsflyt

- Repoet er koblet til Netlify: push til `main` gir produksjonsdeploy, pull requests gir en forhåndsvisning (deploy preview).
- Gjør endringer på en egen gren og åpne en pull request. Sjekk forhåndsvisningen før du slår sammen til `main`.
- Forhåndsvisninger bruker samme Blobs-lager som produksjon. Vær forsiktig med kode som sletter eller skriver om data.
- Det finnes ingen tester eller byggesteg. API-et kan kjøres lokalt mot `BlobsServer` fra `@netlify/blobs/server`. Kontroller endringer ved å lese koden nøye og prøve forhåndsvisningen.
- Hold koden enkel og uten rammeverk. Ikke legg til avhengigheter uten grunn.
