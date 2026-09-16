# Company Finder — far valere la regola d'oro senza perdere copertura

**Data:** 2026-09-17
**Stato:** design approvato, da implementare
**Ambito:** `src/lib/company-finder/`

## Problema

Il Company Finder copre 22 paesi, ma solo 6 rispettano pienamente la regola d'oro
del progetto — *la fonte non si mostra e non si apre: niente iframe, niente link
al registro* — più il Regno Unito, che la rispetta nella risposta finale ma la
viola all'interno del proprio adapter.

Gli altri 15 la violano per costruzione, e la violazione è deliberata: chi ha
scritto `coverage.ts` ha scelto consapevolmente la copertura a scapito della
regola, documentandolo nei commenti. Il motivo tecnico è reale — molti registri
rifiutano le chiamate provenienti da un server (WAF, sessione, CAPTCHA) pur
offrendo il documento gratuitamente a un browser.

Questo design elimina la violazione senza far crollare la copertura da 22 a 7.

## Stato attuale, misurato

`src/lib/company-finder/coverage.ts` organizza i paesi su quattro livelli:

| Livello | Costante | Paesi | Regola d'oro |
|---|---|---|---|
| A — Automatico | `AUTO_ISOS` | DE, NL, DK, FR, EE, NO (6) | ✅ rispettata |
| A — con riserva | `AUTO_ISOS` | UK | ⚠️ rispettata nella risposta finale, violata nell'adapter (vedi sotto) |
| B — Consultazione | `CONSULT_PAGES` | BE, PL, GR, CZ, FI, SK, SI, LV, LT, BG, PT, RO, HR (13) | ❌ iframe del registro |
| B2 — Solo browser | `BROWSER_ONLY_PAGES` | HU, LU (2) | ❌ apre il registro in nuova scheda |
| C — Nessuna fonte gratuita | `NO_FREE_SOURCE` | IT, ES, SE, CY, AT, IE, MT, IS, LI (9) | — non offerti |

Il livello C non è un difetto: è il vincolo "solo fonti gratuite" applicato
correttamente. Resta invariato.

## L'invariante

Il sistema di tipi in `types.ts` codifica già la regola d'oro per i documenti:

```ts
/** Vista client di un documento: nessun URL, cookie o token del registro. */
export interface FinancialDocumentSummary { /* nessun campo url */ }
```

Un `FinancialDocumentSummary` **non può** trasportare l'URL della fonte. L'unico
punto in cui la fonte raggiunge il client è `OfficialPageRef`:

```ts
export interface OfficialPageRef {
  url: string;                        // la fonte, esposta
  mode?: "embed" | "external";        // embed = iframe, external = nuova scheda
}
```

esposto attraverso `SearchResponse.officialPage`. Da qui l'invariante che governa
tutto il lavoro:

> **La regola d'oro vale per un paese se e solo se la sua `SearchResponse` non
> contiene `officialPage`.**

Il vincolo diventa così un'asserzione da una riga, verificabile per ogni paese,
invece di una questione di giudizio.

## Il contratto di riferimento: il pattern estone

`sources/bilanci/ariregister-ee.ts` è l'implementazione modello. Espone tre
operazioni separate, ed è questa separazione a produrre sia la selezione degli
anni sia la regola d'oro:

```
listFilings(azienda)         → anni disponibili      (1 fetch, economico)
resolveFiling(azienda, anno) → riferimento interno   (cache 10 min)
fetchDocument(riferimento)   → byte del documento    (solo l'anno richiesto)
```

L'URL interno ha sempre la forma:

```
/api/company-finder/document?country=XX&company=<rif>&year=<anno>
```

Tre proprietà che ne discendono:

1. **Selezione degli anni.** L'Estonia restituisce fino a 12 esercizi, ognuno con
   il proprio `downloadUrl`. L'utente sceglie quale scaricare.
2. **Regola d'oro strutturale.** Il client riceve `country`, `company`, `year` —
   mai l'URL della fonte. La traduzione anno → identificativo del file avviene
   solo lato server. Non è disciplina del programmatore: è forma del tipo.
3. **Costo minimo.** Si scarica solo l'anno richiesto, su domanda. Nessun
   prelievo di 12 documenti per mostrarne uno — rilevante perché sui paesi
   promossi ogni fetch passa da Firecrawl.

### Il Regno Unito non rispetta questo contratto

`sources/bilanci/companies-house-public.ts` è in `AUTO_ISOS` ma è il più debole
dei sette:

```ts
const documentUrl = HOST + document.documentPath;   // URL grezzo della fonte
years: []                                            // nessun esercizio
```

Un solo documento (il più recente non-interim), nessun array `documents`, nessuna
selezione degli anni, e l'URL della fonte scritto nella risposta dell'adapter.
L'incapsulamento avviene a valle, ma il pattern è fragile: un percorso che salti
l'incapsulamento fa trapelare la fonte.

**Il Regno Unito va quindi portato allo standard estone**, come parte di questo
lavoro e non come miglioria successiva.

## Architettura

### 0. Generalizzare il contratto estone

Ogni adapter — esistente o nuovo — espone `listFilings` / `resolveFiling` /
`fetchDocument`, e non scrive mai un URL della fonte nella risposta. Questo è il
fondamento su cui poggiano tutti i punti seguenti.

`SearchRequest` acquisisce un campo opzionale `years?: number[]`: se presente,
l'adapter limita il lavoro agli esercizi richiesti; se assente, elenca ciò che
trova e non scarica nulla oltre al più recente.

### 1. L'invariante come test

Un test per paese che asserisce `officialPage === undefined`. Oggi fallisce per
15 paesi: quell'elenco **è** la lista di lavoro, e si accorcia da sé a ogni
promozione. Nessun registro di avanzamento separato da tenere allineato a mano.

### 2. Trasporto: fallback nel proxy, un solo punto toccato

`document-proxy.server.ts` è già l'unico varco verso le fonti: allowlist di host
(`ALLOWED_DOCUMENT_HOSTS`), solo https, massimo 4 redirect, 30 MB, timeout 45 s.
Acquisisce un fallback:

```
fetch diretto → se WAF / 403 / CAPTCHA → Firecrawl → altrimenti errore
```

Vincoli sul fallback:

- **Gated da `FIRECRAWL_API_KEY`.** Se la variabile manca, il comportamento è
  identico a oggi, bit per bit. Nessuna regressione possibile in assenza di chiave.
- **Il diretto si prova sempre per primo.** Firecrawl viene pagato solo dove il
  paese resterebbe altrimenti scoperto. Questa è la disciplina di costo decisa:
  il vincolo "tutto gratis" vale sulle fonti (il bilancio non deve costare
  all'utente), non vieta un costo di infrastruttura, ma lo tiene al minimo
  misurabile.
- **L'allowlist resta il confine di sicurezza.** Firecrawl cambia il trasporto,
  non l'insieme degli host raggiungibili. Ogni host promosso va aggiunto
  esplicitamente ad `ALLOWED_DOCUMENT_HOSTS`.

### 3. Resolver per paese, solo dove serve

Molti registri espongono il PDF a URL diretto una volta superato il WAF: per
quelli il punto 2 è sufficiente e non si scrive codice nuovo. Un resolver
dedicato in `sources/bilanci/` si scrive **solo** dove la catena richiede
navigazione via form (ricerca → scheda azienda → elenco depositi → documento).

Questo è ciò che tiene il lavoro non cervellotico: 13 adapter scritti a priori
sarebbero 13 catene fragili da mantenere, molte delle quali inutili.

### 4. La promozione si guadagna

Un paese passa da `CONSULT_PAGES` ad `AUTO_ISOS` **solo quando il suo test
end-to-end passa**. Il test è il cancello, non la documentazione del cancello.

Corollario: un paese che fallisce **resta in iframe**. Non diventa mai "rotto in
silenzio". Il vincolo di progetto dice che un paese coperto a metà va escluso; qui
la formulazione è più forte — la copertura non può regredire rispetto a oggi.

### 5. Verifica reale

Per ogni paese promosso, il test end-to-end esegue la catena vera in rete e
asserisce:

1. i byte del documento iniziano con `%PDF-` (o il formato dichiarato);
2. `officialPage` è assente dalla risposta;
3. nessun campo della risposta contiene l'host della fonte;
4. `documents[]` contiene più di un esercizio quando il registro ne espone più
   di uno, e ogni `downloadUrl` ha la forma interna `?country=…&company=…&year=…`;
5. richiedere un anno specifico restituisce **quell'**anno, e richiederne uno non
   depositato produce un errore che elenca gli esercizi disponibili (come fa già
   `resolveEeFiling`).

L'asserzione 3 è la rete di sicurezza: impedisce che l'URL del registro rientri
da un campo non previsto (`note`, `source`, `documentTitle`). Le asserzioni 4 e 5
sono ciò che rende la selezione degli anni una garanzia verificata e non una
funzionalità dichiarata.

## Flusso dati

```
SearchRequest
  → orchestrator.runSearch
      → adapter paese (sources/bilanci/*)
          → documento individuato
              ├─ scaricabile  → FinancialDocumentSummary
              │                   availability: DOCUMENT_DOWNLOADABLE
              │                   downloadUrl: /api/company-finder/document?...
              │                   (nessun URL della fonte)   ✅ regola d'oro
              └─ non scaricabile → officialPage: OfficialPageRef   ❌ da eliminare
```

Promuovere un paese significa esattamente spostarlo dal ramo inferiore a quello
superiore.

## Gestione errori

Il degrado è **sempre** verso il comportamento attuale, mai verso il vuoto:

| Situazione | Esito |
|---|---|
| `FIRECRAWL_API_KEY` assente | Comportamento identico a oggi |
| Fetch diretto fallisce, Firecrawl riesce | Documento servito, paese promosso |
| Entrambi falliscono | Resta `officialPage` (iframe), come oggi |
| Documento > 30 MB o timeout | `restriction: SOURCE_UNAVAILABLE`, iframe |
| Host non in allowlist | 403 dal proxy — invariato |

I codici `RestrictionCode` già definiti in `types.ts` (`CAPTCHA_REQUIRED`,
`SESSION_BOUND`, `RATE_LIMITED`, …) coprono i casi: non servono tipi nuovi.

## Chiavi e variabili d'ambiente

| Variabile | Paese | Stato |
|---|---|---|
| `OPENREGISTER_API_KEY` | DE | ✅ disponibile |
| `FIRECRAWL_API_KEY` | trasporto | ✅ disponibile, **da aggiungere a Vercel** |
| `COMPANIES_HOUSE_API_KEY` | UK | ❌ da registrare (gratuita) |
| `CVR_DEV_TOKEN` | DK | ❌ da registrare (gratuita) |
| `INPI_RNE_USERNAME` / `INPI_RNE_PASSWORD` | FR | ❌ da registrare (gratuita) |
| `NBB_CBSO_API_KEY` | BE | ❌ da registrare (gratuita) — vedi `docs/be-nbb-cbso-chiave.md` |

I paesi la cui chiave manca restano spenti **con nota esplicita di
indisponibilità**, mai con un errore silenzioso: il modo di fallire osservato in
passato faceva sembrare il tool rotto mentre stava obbedendo al vincolo.

Brightdata è stato valutato e **scartato**: l'account autentica
(`status: active`) ma non ha zone provisionate (`can_make_requests: false`,
`auth_fail_reason: zone_not_found`), il token è a permessi ridotti, e il prodotto
Web Unlocker è a pagamento. Firecrawl copre lo stesso bisogno ed è operativo:
verificato il 2026-09-17 contro `registeruz.sk` con esito positivo.

## Ordine di lavoro

**Passo 0 — il Regno Unito allo standard estone.** Si fa per primo, prima di
qualsiasi promozione, per tre motivi: non richiede rete nuova né Firecrawl (il
sito pubblico di Companies House risponde già), corregge una perdita di URL
esistente, ed è il banco di prova del contratto generalizzato su un paese di cui
conosciamo già il comportamento. Se il contratto non regge qui, non reggerà
altrove.

Poi tre paesi di livello B provati end-to-end prima di generalizzare:

1. **SK** — `registeruz.sk`. Raggiungibilità via Firecrawl già verificata.
2. **CZ** — `or.justice.cz`, registro con URL documentali diretti.
3. **FI** — `tietopalvelu.ytj.fi`, idem.

Solo dopo che i tre passano si estende ai restanti dieci di livello B. HU e LU
(livello B2) si valutano separatamente: il loro `mode: "external"` segnala un
controllo anti-bot che va completato da una persona, e aggirarlo non è nel
perimetro.

## Fuori perimetro

- **Livello C** (IT, ES, SE, CY, AT, IE, MT, IS, LI): i bilanci costano. Restano
  non offerti, con la nota sul costo. L'Italia inclusa, benché il portale sia
  italiano.
- **HU, LU**: richiedono verifica umana anti-bot; nessun tentativo di aggiramento.
- **Rotazione delle credenziali** in `Documents/api.txt`: necessaria e urgente
  (contiene PAT GitHub e token Vercel in chiaro), ma è igiene di sicurezza
  separata da questo lavoro.

## Criteri di completamento

1. Il test dell'invariante passa per ogni paese in `AUTO_ISOS`.
2. Ogni paese promosso ha un test end-to-end che scarica un documento reale.
3. Nessun paese è regredito rispetto alla copertura del 2026-09-17.
4. `CONSULT_PAGES` contiene solo paesi il cui test end-to-end non passa, ciascuno
   con il motivo registrato.
5. Ogni paese in `AUTO_ISOS` espone `documents[]` con tutti gli esercizi che il
   registro rende disponibili, non solo il più recente.
6. Nessun adapter scrive un URL della fonte nella risposta — verificato dal test,
   non per ispezione.
7. Il Regno Unito rispetta il contratto estone (punti 5 e 6 inclusi).
