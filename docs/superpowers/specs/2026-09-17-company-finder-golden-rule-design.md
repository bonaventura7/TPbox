# Company Finder — regola d'oro e selezione degli anni

**Data:** 2026-09-17 (riscritta dopo lettura completa del codice)
**Stato:** design approvato, da implementare
**Ambito:** `src/lib/company-finder/`, `src/lib/company-finder.functions.ts`

## Nota sulla revisione

Una prima stesura di questo documento conteneva quattro affermazioni errate,
scritte prima di aver letto `company-finder.functions.ts` e
`document-resolver.server.ts`. Sono corrette qui, ed è utile registrarle perché
ciascuna avrebbe prodotto lavoro inutile:

1. *«La regola d'oro non è applicata centralmente»* — **falso.** Esiste
   `hideSources()`.
2. *«Serve un sistema che nasconda l'URL della fonte»* — **esiste già**, a token
   opachi, ed è migliore di quello proposto.
3. *«L'URL esterno nell'adapter UK è una perdita da correggere»* — **è una scelta
   deliberata, protetta da un test di contratto.**
4. *«Servono Firecrawl e nuovi adapter per i paesi bloccati»* — **non per i primi
   quattro:** hanno già la catena dati completa.

## Problema

Il Company Finder copre 22 paesi. Sette li serve automaticamente; quindici
mostrano invece la pagina del registro — tredici in iframe, due in scheda nuova.
Questo viola la regola d'oro del progetto: *la fonte non si mostra e non si
apre*.

Ma quattro di quei quindici **hanno già la catena dati completa**. Non sono
bloccati da un limite tecnico: sono bloccati perché il codice attacca loro
`officialPage` anche quando i dati finanziari sono stati recuperati con successo.

## Come la regola d'oro è applicata oggi

In `src/lib/company-finder.functions.ts`, `prioritizeBalanceDocument()`:

```ts
resolved.financials = { ...resolved.financials!, documentUrl: toInPageDocumentUrl(documentUrl) };
const hidden = hideSources(resolved);   // rimuove le fonti dalla risposta
hidden.officialPage = officialPage;      // ma officialPage viene ri-attaccato
```

`hideSources()` è l'applicazione centralizzata della regola. `officialPage` è
**l'unico campo esplicitamente escluso** dall'occultamento — deliberatamente,
perché è il meccanismo di consultazione di livello B.

Da qui l'invariante che governa il lavoro:

> **La regola d'oro vale per un paese se e solo se la sua `SearchResponse` non
> contiene `officialPage`.**

Non è una convenzione imposta dall'esterno: è la struttura che il codice si è già
dato. L'invariante è verificabile con un'asserzione da una riga.

### Il contratto degli adapter — da rispettare, non da cambiare

`test/company-finder-document-url-contract.test.ts` asserisce esplicitamente:

```ts
it("documentUrl è l'URL esterno di Companies House", …)
it("documentUrl non passa dal proxy interno:
    l'incapsulamento spetta a prioritizeBalanceDocument()", …)
```

Gli adapter restituiscono l'URL **ufficiale**; l'incapsulamento avviene **una
volta sola a valle**. Questo contratto resta invariato: il lavoro non lo tocca.

### Infrastruttura documentale esistente

Due percorsi, entrambi già in produzione:

| Route | Modulo | Meccanismo |
|---|---|---|
| `/api/company-finder/document` | `document-proxy.server.ts` | `?url=` + allowlist host |
| `/api/company-finder/financial-document` | `document-resolver.server.ts` | token opachi, TTL 15 min, circuit breaker, retry, validazione formato, SHA-256 |

Il secondo è la soluzione più forte per la regola d'oro: il client riceve un
token che non contiene né host né percorso. **Il lavoro usa questi due percorsi e
non ne aggiunge un terzo.**

## Stato attuale, misurato

Adapter bilanci presenti in `sources/bilanci/` più `greek-filing.ts`:
EE, NO, BE, UK, DE, NL, FR, PL, DK, SK, GR.

Incrociando con `coverage.ts`:

| Gruppo | Paesi | Catena dati | Lavoro |
|---|---|---|---|
| Già automatici | DE, NL, DK, UK, FR, EE, NO (7) | ✅ | Nessuno |
| **Sbloccabili** | **BE, PL, SK, GR (4)** | ✅ presente | **Smettere di attaccare `officialPage`** |
| Da costruire | CZ, FI, SI, LV, LT, BG, PT, RO, HR (9) | ❌ assente | Adapter nuovo — fuori perimetro |
| Solo browser | HU, LU (2) | — | Fuori perimetro (anti-bot umano) |
| Non gratuiti | IT, ES, SE, CY, AT, IE, MT, IS, LI (9) | — | Restano esclusi, corretto |

I quattro paesi sbloccabili hanno già il codice: `cbso-be.ts`,
`poland-esef.ts` / `poland-krs-filings.ts`, `ruz-sk.ts`, `greek-filing.ts`, con
`attachSlovakFinancials`, `attachPolishEsefFinancials`, `attachPolishKrsFilings`
e `resolveGreekBalance` già cablati nel functions.

## Perimetro di questo lavoro

**Dentro:** i 4 paesi sbloccabili (BE, PL, SK, GR) e la selezione degli anni.

**Fuori:** i 9 paesi senza adapter. Sono un progetto distinto, con una propria
spec, perché richiedono ricerca fonte per fonte e non condividono codice con
questo lavoro. Sbloccare 4 paesi è software funzionante e consegnabile da solo;
accorparli ai 9 ritarderebbe entrambi.

**Fuori, con motivo:** Firecrawl e Brightdata. L'indagine condotta il 2026-09-17
ha stabilito che Brightdata non è utilizzabile (account senza zone,
`can_make_requests: false`, prodotto a pagamento) e che Firecrawl funziona
(verificato contro `registeruz.sk`). Ma **nessuno dei due serve qui**: i quattro
paesi sbloccabili non hanno un problema di raggiungibilità. La valutazione resta
registrata per la spec dei 9 paesi, dove sarà pertinente.

## Selezione degli anni

Estonia e Norvegia implementano già il contratto:

```
listFilings(azienda)         → anni disponibili      (1 fetch)
resolveFiling(azienda, anno) → riferimento file      (cache 10 min)
fetchDocument(riferimento)   → byte                  (solo l'anno richiesto)
```

con URL interno `/api/company-finder/document?country=XX&company=<rif>&year=<anno>`
(verificato in `brreg-no.test.ts`) e `documents[]` che elenca fino a 12 esercizi,
ciascuno col proprio `downloadUrl`.

Il lavoro estende questo contratto ai quattro paesi sbloccati, e aggiunge a
`SearchRequest` un campo opzionale:

```ts
years?: number[];   // se presente, l'adapter limita il lavoro a questi esercizi
```

Assente, il comportamento resta quello attuale: elenca gli esercizi trovati e
scarica solo il più recente.

## Criterio di sblocco

Un paese esce da `CONSULT_PAGES` **quando il suo test end-to-end passa**, non
prima. Il test è il cancello.

Regola di degrado, non negoziabile: se la catena dati fallisce a runtime,
`officialPage` **torna**. Un paese non diventa mai una pagina vuota. La copertura
non può regredire rispetto al 2026-09-17.

Concretamente, in `prioritizeBalanceDocument()` la riga:

```ts
hidden.officialPage = officialPage;
```

diventa condizionale: `officialPage` si ri-attacca **solo se** i dati finanziari
non sono disponibili.

## Verifica

Per ogni paese sbloccato, un test che asserisce:

1. `officialPage` è assente quando la catena dati riesce;
2. `officialPage` è **presente** quando la catena dati fallisce (test del degrado);
3. nessun campo della risposta contiene l'host della fonte — rete di sicurezza
   contro rientri da `note`, `source`, `documentTitle`;
4. `documents[]` elenca più di un esercizio quando il registro ne espone più di
   uno, e ogni `downloadUrl` ha la forma interna;
5. chiedere un anno specifico restituisce quell'anno; chiederne uno non
   depositato produce un errore che elenca gli esercizi disponibili.

L'asserzione 2 è la più importante: è quella che impedisce allo sblocco di
trasformarsi in una regressione silenziosa.

## Chiavi

| Variabile | Paese | Stato |
|---|---|---|
| `NBB_CBSO_API_KEY` | BE | ❌ **necessaria per sbloccare il Belgio** — gratuita, vedi `docs/be-nbb-cbso-chiave.md` |
| `OPENREGISTER_API_KEY` | DE | ✅ disponibile |
| `COMPANIES_HOUSE_API_KEY` | UK | ❌ non necessaria: si usa il sito pubblico |
| `CVR_DEV_TOKEN` | DK | ❌ da registrare — DK è già automatico, la chiave aggiunge dati |
| `INPI_RNE_USERNAME` / `_PASSWORD` | FR | ❌ da registrare — FR è già automatico |

PL, SK e GR non richiedono chiavi. Il Belgio resta in `CONSULT_PAGES` finché
`NBB_CBSO_API_KEY` non è configurata: `document-proxy.server.ts` già restituisce
un 503 con messaggio azionabile in sua assenza, comportamento corretto da
preservare.

## Ordine di lavoro

1. **SK** — `ruz-sk.ts` è completo e `attachSlovakFinancials` è già cablato con
   risoluzione per IČO, DIČ e denominazione. È il caso più pulito: nessuna chiave,
   nessun formato esotico.
2. **PL** — ESEF e depositi KRS già cablati, con `pl-pdf-gate.ts` a decidere.
   Più complesso: la logica di `officialPage` per la Polonia ha già una condizione
   (`if (page && !esefAttached)`) da estendere.
3. **GR** — `resolveGreekBalance` opera già dentro `prioritizeBalanceDocument`.
4. **BE** — per ultimo: dipende dalla chiave NBB-CBSO, che è esterna al codice.

## Salute del codice

`src/lib/company-finder.functions.ts` è minificato su riga singola (righe da
migliaia di caratteri). È il file che applica la regola d'oro, ed è illeggibile in
revisione. Si riformatta **solo ciò che si tocca**, con Prettier, all'interno dei
commit funzionali — nessun commit di formattazione di massa su un file critico.

## Criteri di completamento

1. BE, PL, SK, GR non restituiscono `officialPage` quando la catena dati riesce.
2. Ognuno dei quattro ha un test del degrado: fallimento della catena →
   `officialPage` torna.
3. Ognuno espone `documents[]` con tutti gli esercizi resi disponibili dal
   registro, non solo il più recente.
4. `SearchRequest.years` è onorato dai quattro adapter.
5. Nessun paese è regredito rispetto alla copertura del 2026-09-17.
6. `npm run check` passa (lint, typecheck, test, build).
7. Il contratto in `company-finder-document-url-contract.test.ts` resta verde:
   gli adapter continuano a restituire l'URL ufficiale.
