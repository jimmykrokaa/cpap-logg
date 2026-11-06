# CPAP-logg

Personlig nettapp for å se og tolke CPAP-data (ResMed AirSense 11) fra SD-kortet. Kjører på Vercel (prosjekt `cpap-logg`, team «Jimmy Krokå's projects»). All tekst i appen er på norsk bokmål.

## Oppbygning

- `public/` – frontend i ren HTML, CSS og JavaScript (ingen rammeverk, ingen byggesteg).
  - `edf.js` leser EDF-filene fra SD-kortet i nettleseren, `upload.js` laster opp, `score.js` beregner nattscore, `natt.js` viser én natt, `info.js` har (i)-forklaringene, `tid.js` håndterer tidssoner.
- `api/` – Vercel-serverfunksjoner (Node 22, ES-moduler). Alle unntatt `login` krever innlogging via `requireLogin`.
  - `tolk.js` sender data til AI-modeller via Vercel AI Gateway (`maxDuration` 60 s i `vercel.json`).
- `lib/` – felles kode: `auth.js` (passord og signert sesjonscookie), `store.js` (nattoppsummeringer), `rawstore.js` (rådata delt opp i biter på 3 MB).

## Lagring

Alt lagres i **Vercel Blob** (privat) under prefikset `cpap/`. Det finnes ingen database.

**Viktig:** `MARKER` i `lib/store.js` (nå `cpap/v3.json`). Hvis den endres, **slettes alle lagrede data** unntatt `cpap/oppsett.json` neste gang appen åpnes. Ikke endre den uten at brukeren uttrykkelig ber om det.

## Miljøvariabler (ligger i Vercel, aldri i koden)

`APP_PASSWORD`, `SESSION_SECRET` (valgfri), `AI_GATEWAY_API_KEY` (valgfri, ellers OIDC), `AI_MODEL` (valgfri), samt Blob-tokenet som Vercel setter selv.

## Arbeidsflyt

- Repoet er koblet til Vercel: push til `main` gir produksjonsdeploy, andre grener gir forhåndsvisning.
- Gjør endringer på en egen gren og åpne en pull request. Sjekk forhåndsvisningen før du slår sammen til `main`.
- Forhåndsvisninger kan bruke samme Blob-lager som produksjon. Vær forsiktig med kode som sletter eller skriver om data.
- Det finnes ingen tester eller byggesteg. Kontroller endringer ved å lese koden nøye og prøve forhåndsvisningen.
- Hold koden enkel og uten rammeverk. Ikke legg til avhengigheter uten grunn.
