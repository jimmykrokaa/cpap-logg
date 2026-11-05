'use strict';
/* global */
// Forklaringer (i) til moduler, nøkkeltall og overskrifter. Hver forklaring har tre deler:
// v = hva det viser, t = slik tolker du det, b = hva du kan bruke det til.
const INFO = {
  natt: {
    tittel: 'Natt',
    v: 'Detaljer for én natt, regnet fra du satte på masken til du tok den av for siste gang. Velg natt med pilene eller listen.',
    t: 'Natta heter etter datoen du la deg (for eksempel «Natt til 5. nov» som startet 4. nov). Klokkeslettene er norsk tid etter innstillingen «Klokke».',
    b: 'Start her for å se hvordan natta gikk. Dra over et område i en graf for å zoome inn og se nøyaktig hva som skjedde.'
  },
  periode: {
    tittel: 'Periode',
    v: 'Samlet bilde over flere netter. Velg 7, 30 eller 90 dager, alt, eller egne datoer.',
    t: 'Se etter retningen over tid, ikke enkeltnetter. En dårlig natt iblant er normalt. Tallene sammenlignes med like mange dager rett før perioden.',
    b: 'Følg om behandlingen holder seg stabil, om endringer (maske, trykk, vaner) har hjulpet, og forbered samtaler med lege eller søvnklinikk.'
  },
  'natt-score': {
    tittel: 'Nattscore',
    v: 'Ett tall fra 0 til 100 som oppsummerer hvor godt behandlingen fungerte denne natta. Scoren er satt sammen av seks faktorer med ulik vekt: brukstid 30, pustehendelser (AHI) 30, maskelekkasje 15, maske av og på 10 (korte avbrudd under tre minutter teller mindre), luftveier (flowbegrensning og snorking) 10 og oppvåkninger 5.',
    t: '85 eller mer er svært bra, 70–84 bra, 50–69 middels og under 50 svak. Søylene viser hvor mange poeng hver faktor ga. En faktor som mangler data, utelates, og resten regnes om til 100. Scoren er en enkel egenutviklet modell, ikke et medisinsk mål og ikke det samme som score i MyAir.',
    b: 'Se raskt hvilke netter som skiller seg ut, og hva som trakk scoren ned: kort brukstid kan løses med vaner, lekkasje med maskejustering, mange hendelser tas opp med lege. Det er trender over tid som betyr noe.'
  },
  'natt-sammendrag': {
    tittel: 'Nattens tall',
    v: 'De viktigste tallene for natta: AHI, tid med maske, trykk, lekkasje, pust, og hvor mange ganger masken ble tatt av.',
    t: 'Hver flis har en egen forklaring med (i). Verdiene er målt av maskinen og regnet ut fra rådataene på SD-kortet.',
    b: 'Rask kontroll av natta. Gå videre til grafene for å se når på natta noe skjedde.'
  },
  'natt-tidslinje': {
    tittel: 'Tidslinje',
    v: 'Når masken var på (blå), og når hver type hendelse kom: obstruktive apnéer, sentrale apnéer, hypopnéer, uklassifiserte apnéer og oppvåkninger.',
    t: 'Hendelser som klumper seg sammen kan ha sammenheng med søvnstadium (mer tendens i dyp drøm, REM, ofte mot slutten av natta) eller sovestilling (ryggleie gir oftere obstruksjon). Hull i den blå linjen er tid uten maske.',
    b: 'Dra over et område for å zoome inn i alle grafene samtidig. Du kan se om problemene hører til en bestemt del av natta, og sjekke trykk og lekkasje for akkurat det tidsrommet.'
  },
  'natt-avtak': {
    tittel: 'Maske av og på',
    v: 'Hver gang masken ble tatt av underveis, når du satte den på igjen, og hvor lenge den var av. Maskinen starter en ny økt hver gang masken settes på, så avbruddene regnes ut fra mellomrommene mellom øktene.',
    t: 'Korte avbrudd på under ett til to minutter er ofte justering av masken eller en kort pause. Lengre avbrudd er vanligvis toalettbesøk eller oppvåkning. Det siste «av» på natta er morgenens avslutning og regnes ikke som avbrudd.',
    b: 'Mange eller lange avbrudd gir mindre behandlingstid og kan henge sammen med lekkasje som vekker deg eller ubehag med masken. Sammenlign med lekkasje og oppvåkninger i samme tidsrom.'
  },
  'natt-trykk': {
    tittel: 'Trykk gjennom natta',
    v: 'Trykket maskinen ga gjennom natta (cmH₂O), masketrykket og trykket ved utpust (EPR). Maskinen din justerer trykket selv innenfor området som er satt, i dette tilfellet 10–20.',
    t: 'Trykket øker når maskinen merker tegn til innsnevring eller hendelser, og synker igjen når det er rolig. Stigning før en hendelse betyr at maskinen oppdaget at noe var på gang. Ligger trykket ofte nær 20, er maskinen på taket sitt. EPR er en liten lettelse ved utpust, derfor ligger den lavere enn trykket ved innpust.',
    b: 'Se om trykket stiger i perioder med mange hendelser, og om det er jevnt ellers. Vedvarende høyt trykk eller trykk i taket er noe du kan ta opp med lege eller søvnklinikk, som kan justere området. Endre aldri innstillinger på egen hånd.'
  },
  'natt-lekkasje': {
    tittel: 'Lekkasje gjennom natta',
    v: 'Luft som lekker ut ved masken utover den vanlige utluftingen, i liter per minutt. Den stiplede linjen ved 24 L/min er grensen der ResMed regner lekkasjen som stor.',
    t: 'Rolig linje nær null er bra. Topper kan komme når masken løsner, du snur deg eller åpner munnen. Vedvarende lekkasje over 24 L/min gjør at behandlingen virker dårligere og kan gi falske hendelser eller oppvåkninger.',
    b: 'Se om lekkasjen kommer i bestemte perioder (for eksempel når du ligger på siden). Juster stroppene, prøv en annen maskestørrelse eller kontakt hjelpemiddelsentralen. Kontroller maskepute og slange for slitasje.'
  },
  'natt-pustefrekvens': {
    tittel: 'Pustefrekvens gjennom natta',
    v: 'Antall pust per minutt, slik maskinen måler det.',
    t: 'I hvile er normalt omtrent 12–20 pust per minutt, og under søvn gjerne litt lavere. Frekvensen går opp og ned gjennom natta med søvnstadiene, og er ofte raskere og mer ujevn i drømmesøvn. Plutselige hopp kan komme ved oppvåkning.',
    b: 'Støttetall for å forstå søvnmønsteret og se om pusten blir ujevn eller uvanlig rask. Ett enkelt tall betyr lite, så se på utviklingen.'
  },
  'natt-minuttventilasjon': {
    tittel: 'Minuttventilasjon gjennom natta',
    v: 'Hvor mange liter luft du puster inn og ut per minutt, altså pustefrekvens ganger tidevolum.',
    t: 'Typisk 5–10 liter per minutt under søvn. Fall i ventilasjonen kan komme før eller under hendelser, og tallet øker ofte rett etter en apné når du tar igjen med dype pust.',
    b: 'Se sammen med hendelsene om ventilasjonen faller før hendelser. Brukes også av søvnklinikker ved vurdering av andre typer pustehjelp.'
  },
  'natt-tidevolum': {
    tittel: 'Tidevolum gjennom natta',
    v: 'Hvor mye luft du puster inn i hvert pust, i milliliter.',
    t: 'Hos voksne er rundt 400–600 mL vanlig i søvn, avhengig av størrelse. Ujevne eller veldig små pust kan henge sammen med hypopnéer (for grunne pust) og oppvåkninger.',
    b: 'Se om tidevolumet faller før hendelser, og følg gjennomsnittet over tid. Små endringer er normalt, store langvarige endringer er verdt å nevne for lege.'
  },
  'natt-flowbegrensning': {
    tittel: 'Flowbegrensning gjennom natta',
    v: 'Hvor avflatet innpusten er, fra 0 til 1. En flat topp på pustekurven betyr at luftveiene er delvis innsnevret.',
    t: 'Nær 0 betyr fri pust. Verdier som stiger mot 0,5 eller høyere i lengre tid betyr at luftveiene er trange, selv om det ikke er registrert noen apné. Det kommer ofte før hendelser eller oppvåkninger.',
    b: 'Fanger opp problemer som AHI ikke viser. Vedvarende høy flowbegrensning med lav AHI kan likevel gi dårlig søvn, og er noe du kan ta opp med lege eller søvnklinikk.'
  },
  'natt-snorking': {
    tittel: 'Snorking gjennom natta',
    v: 'Maskinens mål på snorking, fra 0 til 5, målt som vibrasjon i luftstrømmen.',
    t: 'Nær 0 er stille. Snorking med behandling kan bety at trykket er litt lavt i perioden, at du ligger på ryggen, eller at nesen er tett. Små verdier er normalt.',
    b: 'Se om snorking faller sammen med flowbegrensning og hendelser. Gjentakende snorking med behandling er noe å nevne for lege.'
  },
  'natt-pustekurve': {
    tittel: 'Pustekurve',
    v: 'Selve pusten din med 25 målinger i sekundet: luftstrøm (liter per minutt) og trykk. Oppover er innpust, nedover utpust.',
    t: 'Normale pust ser ut som jevne bølger. En apné vises som en flat linje i minst 10 sekunder, en hypopné som tydelig mindre bølger. Avflatede topper betyr innsnevring (flowbegrensning). Dype pust rett etter en pause er kroppen som tar igjen.',
    b: 'Se nøyaktig hva en hendelse ser ut som. Klikk på en hendelse i listen eller dra over et utsnitt på 15 minutter eller mindre. Nyttig når du vil forstå hvorfor maskinen merket noe som en hendelse.'
  },
  'natt-hendelser': {
    tittel: 'Hendelser',
    v: 'Alle pustehendelser maskinen registrerte, med klokkeslett og varighet. Obstruktiv apné: luftveien lukker seg. Sentral apné: pusteinnsatsen stopper (hjernen sender ikke signal), ofte med åpne luftveier. Hypopné: pusten reduseres tydelig. Uklassifisert apné: pustestopp som maskinen ikke kan skille. Oppvåkning: en kort vekking maskinen merket seg.',
    t: 'En hendelse varer minst 10 sekunder. Noen få hendelser per natt er vanlig, også med behandling. Mange obstruktive hendelser peker på at luftveiene fortsatt faller sammen. Mange sentrale peker på at pustestyringen er ustabil, og kan komme tidlig i behandlingen eller ved høyt trykk.',
    b: 'Klikk på en hendelse for å zoome inn. Se om de klumper seg sammen i tid. Brukes sammen med trykk, lekkasje og pustekurve til å forstå årsaken, og til å forberede en samtale med lege.'
  },
  'natt-spo2': {
    tittel: 'Oksygenmetning og puls',
    v: 'Oksygenmetning i blodet (SpO₂) og puls fra et oksymeter som er koblet til maskinen. Uten oksymeter er denne tom.',
    t: 'Normal SpO₂ er 94–100 %. Små og kortvarige fall under pustehendelser er vanlig. Vedvarende lave verdier er et tegn på at behandlingen ikke er nok, eller at noe annet påvirker pusten.',
    b: 'Ekstra sikkerhet for deg med lungesykdom eller mistanke om oksygenmangel. Tall under 90 % over tid skal alltid følges opp av lege.'
  },
  'natt-ai': {
    tittel: 'Tolkning av natta',
    v: 'En AI-modell leser nattens hendelser og kurver og skriver en kort forklaring.',
    t: 'Forklaringen er et forslag og kan inneholde feil. Den er ikke medisinsk rådgivning.',
    b: 'Få et raskt overblikk, og få ideer til hva du kan spørre lege eller søvnklinikk om.'
  },
  nokkeltall: {
    tittel: 'Nøkkeltall for perioden',
    v: 'Gjennomsnitt for de valgte nettene, sammenlignet med like mange dager rett før. Pilen viser endringen, og grønn betyr bedring.',
    t: 'Se på retningen over tid. Hver flis har en egen forklaring med (i).',
    b: 'Følg om behandlingen blir bedre eller dårligere, og hvor mye endringer i utstyr eller vaner betyr.'
  },
  score: {
    tittel: 'Score per natt',
    v: 'Nattscoren (0–100) for hver natt i perioden. Hold musen over en søyle for å se hva scoren består av, og klikk for å åpne natta.',
    t: 'Over 85 er svært bra, 70–84 bra, 50–69 middels og under 50 svak. En rød søyle mellom blå viser en natt som trakk ned. Se etter mønstre, for eksempel ukedag eller endringer etter justeringer.',
    b: 'Finn dårlige netter raskt og undersøk hva som skjedde. Følg om scoren stiger etter at du har endret noe.'
  },
  ahi: {
    tittel: 'AHI per natt',
    v: 'AHI er antall pustestopp og reduserte pust per time søvn. Hver søyle er én natt, og den blå linjen er snittet for de siste syv nettene.',
    t: 'Under 5 regnes som godt behandlet. 5–15 er mildt, 15–30 moderat og over 30 alvorlig (grenser for ubehandlet søvnapné). Enkeltnetter varierer mye, så se på linjen.',
    b: 'Det viktigste tallet for å se om behandlingen virker. Stiger linjen over tid, kan det være verdt å sjekke maske og lekkasje, og snakke med lege.'
  },
  hendelser: {
    tittel: 'Hendelser per time',
    v: 'Antall hendelser per time fordelt på sentrale apnéer (blå), obstruktive apnéer (oransje) og hypopnéer og uklassifiserte (grønn). Ved lange perioder vises ukesverdier.',
    t: 'Størrelsen på hver farge viser hva slags problem som dominerer. Mye oransje betyr at luftveiene faller sammen. Mye blått betyr at pusten stopper uten blokkering.',
    b: 'Forstå hvilken type problem som er mest fremtredende, og se om det endrer seg etter justeringer. Fordelingen er nyttig informasjon til lege.'
  },
  timer: {
    tittel: 'Timer med maske per natt',
    v: 'Hvor lenge masken var på hver natt.',
    t: 'Under 4 timer (rød) regnes ofte som for lite. Mange krever minst 4 timer på 70 % av nettene for å anse behandlingen som brukt. 7–8 timer er målet for full effekt.',
    b: 'Følg bruken din. Nyttig dersom du må dokumentere bruk for hjelpemiddelsentralen eller lege.'
  },
  trykk: {
    tittel: 'Trykk per natt',
    v: 'Gjennomsnitt (blå) og 90-persentil (oransje) av trykket hver natt, og nattas høyeste trykk som prikker. Røde prikker nådde taket på 20.',
    t: '90-persentilen betyr at trykket var lavere enn dette 90 % av tiden. Ligger snittet stabilt lavt og maks sjelden i taket, har maskinen god margin. Stigende trykk over tid kan bety at luftveiene krever mer støtte.',
    b: 'Se om trykkbehovet endrer seg etter vektendring, forkjølelse eller justering. Snakk med lege hvis trykket ofte treffer taket.'
  },
  lekkasje: {
    tittel: 'Lekkasje per natt',
    v: 'Lekkasjen (90-persentil, liter per minutt) for hver natt. Den lekkasjen som overstiges bare 10 % av tiden.',
    t: 'Lave søyler er bra. Over omtrent 24 L/min regnes som stor lekkasje. Plutselig økning kan bety slitt maskepute, feil stropper eller endret ansiktsform.',
    b: 'Sjekk maskeutstyret når søylene stiger. Skift maskepute i tide og se om justering hjelper.'
  },
  pustefrekvens: {
    tittel: 'Pustefrekvens per natt',
    v: 'Gjennomsnittlig antall pust per minutt hver natt.',
    t: 'Rundt 12–20 er normalt. Rolig og stabil linje er bra. Høyere verdier kan komme ved sykdom, stress eller i perioder med dårlig søvn.',
    b: 'Se etter plutselige skift, som kan fortelle om forkjølelse, sykdom eller endringer i søvnkvalitet.'
  },
  tidevolum: {
    tittel: 'Tidevolum per natt',
    v: 'Gjennomsnittlig luftmengde per pust hver natt, i mL.',
    t: 'Voksne ligger ofte på 400–600 mL i søvn. Gradvis fall over tid kan bety dårligere pusteevne. Små svingninger er normalt.',
    b: 'Støttetall som kan nevnes til lege hvis det endrer seg over tid.'
  },
  tabell: {
    tittel: 'Netter i perioden',
    v: 'Alle nettene i perioden, med score og de viktigste tallene. Nyeste øverst.',
    t: 'Gult tall betyr AHI på 5 eller mer, eller at trykket nådde taket på 20. Klikk på en rad for å åpne natta.',
    b: 'Sammenlign netter side om side, og finn de beste og dårligste.'
  },
  ai: {
    tittel: 'Tolkning av perioden',
    v: 'En AI-modell leser tallene for den valgte perioden og skriver en kort forklaring på norsk.',
    t: 'Forklaringen er et forslag og kan inneholde feil. Den er ikke medisinsk rådgivning.',
    b: 'Få et raskt overblikk over trender, og ideer til hva du kan spørre lege eller søvnklinikk om.'
  }
};

// Forklaringer til enkeltflisene (nøkkel er teksten på flisen)
const FLIS_INFO = {
  'AHI': 'natt-sammendrag-ahi',
  'AHI, snitt per natt': 'flis-ahi',
  'Tid med maske': 'flis-tid',
  'Timer med maske per natt': 'flis-timer',
  'Trykk': 'flis-trykk',
  'Lekkasje, 90 %': 'flis-lekkasje',
  'Lekkasje, 90 %-persentil': 'flis-lekkasje',
  'Pustefrekvens': 'flis-pust',
  'Tidevolum': 'flis-tide',
  'Maske tatt av': 'flis-avtak',
  'Sentrale apnéer per time': 'flis-sentral',
  'Snittscore': 'flis-score'
};
Object.assign(INFO, {
  'natt-sammendrag-ahi': { tittel: 'AHI', v: 'Antall pustestopp og reduserte pust per time søvn denne natta, med fordelingen mellom typene.', t: 'Under 5 er godt behandlet. Tallet påvirkes av hvor mye tid du faktisk brukte masken: færre timer gir et mer usikkert tall.', b: 'Hovedmålet for om behandlingen virker. Se hvilken type hendelser som dominerer.' },
  'flis-ahi': { tittel: 'AHI, snitt per natt', v: 'Gjennomsnittlig AHI i perioden, med endring fra perioden før.', t: 'Under 5 er godt behandlet. Grønn pil ned betyr bedring.', b: 'Se om behandlingen holder seg stabil over tid.' },
  'flis-tid': { tittel: 'Tid med maske', v: 'Total tid masken var på, og når øktene var. Hver gang masken tas av og settes på igjen, blir det en ny økt.', t: 'Sikte mot 7 timer eller mer. Under 4 timer regnes ofte som for lite.', b: 'Mange økter betyr mange avbrudd. Se «Maske av og på» for detaljer.' },
  'flis-timer': { tittel: 'Timer med maske per natt', v: 'Gjennomsnittlig brukstid per natt, og hvor mange netter som var over 4 timer.', t: 'Mange krever minst 4 timer på 70 % av nettene for å anse behandlingen som brukt.', b: 'Dokumenter bruk og se om vanene dine endrer seg.' },
  'flis-trykk': { tittel: 'Trykk', v: 'Gjennomsnittlig trykk natta, trykket 90 % av tiden lå under, og høyeste trykk.', t: 'Trykket justeres automatisk mellom 10 og 20. Stabilt moderat snitt er vanlig. Maks nær 20 betyr at maskinen tok i.', b: 'Se om trykkbehovet endrer seg over tid.' },
  'flis-lekkasje': { tittel: 'Lekkasje, 90 %', v: 'Lekkasjen som overstiges bare 10 % av tiden, i liter per minutt.', t: 'Lavt er bra. Over omtrent 24 L/min regnes som stor.', b: 'Høy verdi tyder på at masken sitter dårlig. Juster stroppene eller bytt maskepute.' },
  'flis-pust': { tittel: 'Pustefrekvens', v: 'Gjennomsnittlig antall pust per minutt, og minuttventilasjon (liter luft per minutt).', t: 'Rundt 12–20 pust per minutt er normalt, og 5–10 L/min ventilasjon.', b: 'Støttetall for å se om pusten er jevn.' },
  'flis-tide': { tittel: 'Tidevolum', v: 'Gjennomsnittlig luftmengde per pust, i mL, pluss flowbegrensning og snorking.', t: 'Voksne ligger ofte på 400–600 mL. Flowbegrensning og snorking nær null er bra.', b: 'Følg utviklingen over tid.' },
  'flis-avtak': { tittel: 'Maske tatt av', v: 'Antall ganger masken ble tatt av underveis på natta, og hvor lenge til sammen.', t: 'Hver gang masken settes på igjen, starter maskinen en ny økt. Det siste «av» om morgenen telles ikke med.', b: 'Mange avbrudd gir mindre behandlingstid. Se «Maske av og på» for tidspunktene.' },
  'flis-sentral': { tittel: 'Sentrale apnéer per time', v: 'Pustestopp der luftveiene er åpne, men pusteinnsatsen uteblir.', t: 'Lave tall er normalt. Høye verdier kan komme tidlig i behandlingen eller ved høyt trykk.', b: 'Følg utviklingen og nevn det for lege hvis det øker.' },
  'flis-score': { tittel: 'Snittscore', v: 'Gjennomsnittet av nattscoren i perioden.', t: 'Over 85 er svært bra. Se «Nattscore» for hva scoren består av.', b: 'Et enkelt tall for å følge hvor godt behandlingen går.' }
});

const pop = document.createElement('div');
pop.id = 'infoPop'; pop.className = 'infopop'; pop.hidden = true; pop.setAttribute('role', 'dialog');
document.body.append(pop);
let aapen = null;

function skjul() { pop.hidden = true; if (aapen) aapen.setAttribute('aria-expanded', 'false'); aapen = null; }
function vis(knapp) {
  const i = INFO[knapp.dataset.info];
  if (!i) return;
  if (aapen === knapp) { skjul(); return; }
  skjul();
  pop.replaceChildren();
  const add = (kicker, tekst) => {
    if (!tekst) return;
    const d = document.createElement('div'); d.className = 'ip-del';
    const k = document.createElement('b'); k.textContent = kicker;
    const p = document.createElement('p'); p.textContent = tekst;
    d.append(k, p); pop.append(d);
  };
  const h = document.createElement('div'); h.className = 'ip-tittel'; h.textContent = i.tittel; pop.append(h);
  add('Hva det viser', i.v); add('Slik tolker du det', i.t); add('Hva du kan bruke det til', i.b);
  const f = document.createElement('p'); f.className = 'ip-fot'; f.textContent = 'Ikke medisinsk rådgivning. Snakk med lege eller søvnklinikk før du endrer behandlingen.'; pop.append(f);
  pop.hidden = false;
  const r = knapp.getBoundingClientRect(), w = pop.offsetWidth, ph = pop.offsetHeight;
  const venstre = Math.max(8, Math.min(r.left + window.scrollX - 12, window.scrollX + document.documentElement.clientWidth - w - 8));
  let topp = r.bottom + window.scrollY + 8;
  if (r.bottom + ph + 16 > window.innerHeight && r.top - ph - 16 > 0) topp = r.top + window.scrollY - ph - 8;
  pop.style.left = venstre + 'px'; pop.style.top = topp + 'px';
  knapp.setAttribute('aria-expanded', 'true'); aapen = knapp;
}
document.addEventListener('click', (e) => {
  const k = e.target.closest('.info');
  if (k) { e.preventDefault(); e.stopPropagation(); vis(k); return; }
  if (!e.target.closest('#infoPop')) skjul();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') skjul(); });

function infoKnapp(nokkel) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'info'; b.dataset.info = nokkel; b.setAttribute('aria-label', 'Forklaring: ' + (INFO[nokkel] ? INFO[nokkel].tittel : '')); b.setAttribute('aria-expanded', 'false'); b.textContent = 'i';
  return b;
}

// Legg til (i) i modulkortene og flisene hver gang siden er tegnet
function leggTil() {
  document.querySelectorAll('.mod[data-mod]').forEach((kort) => {
    const h2 = kort.querySelector('.mod-head h2');
    if (!h2 || h2.parentElement.classList.contains('mod-tittel') || !INFO[kort.dataset.mod]) return;
    const w = document.createElement('div'); w.className = 'mod-tittel';
    h2.replaceWith(w); w.append(h2, infoKnapp(kort.dataset.mod));
  });
  document.querySelectorAll('.tile .lbl').forEach((l) => {
    const nokkel = FLIS_INFO[l.textContent.trim()];
    if (!nokkel || l.querySelector('.info') || !INFO[nokkel]) return;
    l.append(' ', infoKnapp(nokkel));
  });
}
const origBuild = window.buildCards;
window.buildCards = function () { origBuild(); leggTil(); };
const origRender = window.render;
window.render = function () { origRender(); leggTil(); };
const origNight = window.renderNight;
window.renderNight = function () { origNight(); leggTil(); };
document.querySelectorAll('.info[data-info]').forEach((b) => { b.setAttribute('aria-expanded', 'false'); });
