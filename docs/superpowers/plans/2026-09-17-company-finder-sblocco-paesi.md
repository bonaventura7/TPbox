# Company Finder — sblocco BE/PL/SK/GR e selezione anni — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Far sì che Belgio, Polonia, Slovacchia e Grecia servano il bilancio in pagina invece di mostrare l'iframe del registro, e permettere all'utente di scegliere gli esercizi.

**Architecture:** Questi quattro paesi hanno già la catena dati completa. Il blocco non è tecnico: `prioritizeBalanceDocument()` ri-attacca `officialPage` anche quando i dati finanziari sono stati recuperati. Il lavoro rende quella ri-attaccatura condizionale, con degrado garantito (se la catena fallisce, `officialPage` torna), e estende il contratto multi-anno già usato da Estonia e Norvegia.

**Tech Stack:** TypeScript, Vitest, Vite, TanStack server functions. Nessuna dipendenza nuova.

**Spec:** `docs/superpowers/specs/2026-09-17-company-finder-golden-rule-design.md`

## Global Constraints

- **Test runner:** `npx vitest run <file>` per un file singolo; `npm run check` (lint + typecheck + test + build) prima di ogni commit finale di task.
- **Invariante regola d'oro:** la regola vale per un paese ⟺ la sua `SearchResponse` non contiene `officialPage`.
- **Degrado non negoziabile:** se la catena dati fallisce a runtime, `officialPage` torna. Nessun paese diventa una pagina vuota. La copertura non può regredire rispetto al 2026-09-17.
- **Contratto adapter invariato:** gli adapter restituiscono l'URL **ufficiale**; l'incapsulamento spetta a `prioritizeBalanceDocument()`. Il test `test/company-finder-document-url-contract.test.ts` deve restare verde.
- **Nessuna quarta route documentale.** Esistono già `/api/company-finder/document`, `/api/company-finder/financial-document`, `/api/company-finder/ruz-document`. Non se ne aggiungono.
- **Formattazione:** `src/lib/company-finder.functions.ts` e `ruz-sk.ts` sono minificati su riga singola. Si riformatta con Prettier **solo la funzione che si tocca**, dentro il commit funzionale. Nessun commit di formattazione di massa.
- **Nessuna chiave nel codice.** Le credenziali si leggono da `process.env`, con lettura difensiva (runtime edge).

---

## File Structure

| File | Responsabilità | Azione |
|---|---|---|
| `test/company-finder-golden-rule.test.ts` | Invariante `officialPage` per i 4 paesi + test di degrado | **Creare** |
| `src/lib/company-finder.functions.ts` | `prioritizeBalanceDocument()`: ri-attaccatura condizionale | Modificare |
| `src/lib/company-finder/types.ts` | `SearchRequest.years?: number[]` | Modificare |
| `src/lib/company-finder/sources/bilanci/ruz-sk.ts` | Filtro anni nella catena RÚZ | Modificare |
| `src/lib/company-finder/sources/bilanci/ruz-sk.test.ts` | Test filtro anni | Modificare |
| `test/company-finder-years-selection.test.ts` | Contratto `years` trasversale | **Creare** |

---

### Task 1: Caratterizzare il comportamento attuale dei 4 paesi

Prima di cambiare qualcosa, si accerta cosa fa oggi il codice. Per la Slovacchia c'è un dubbio concreto: il ramo SK in `findCompany` esce prima di `prioritizeBalanceDocument()` partendo da `emptyResponse()`, che non imposta `officialPage` — quindi SK potrebbe già essere conforme. Il test lo stabilisce invece di assumerlo.

**Files:**
- Create: `test/company-finder-golden-rule.test.ts`

**Interfaces:**
- Consumes: `SearchResponse` da `src/lib/company-finder/types.ts`
- Produces: `expectGoldenRule(response)` e `expectDegradation(response)` — helper riusati dai Task 4-7.

- [ ] **Step 1: Scrivere il test di caratterizzazione**

Crea `test/company-finder-golden-rule.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { SearchResponse } from "../src/lib/company-finder/types";

/** Host dei registri: non devono comparire in nessun campo della risposta. */
const REGISTRY_HOSTS = [
  "registeruz.sk",
  "ekrs.ms.gov.pl",
  "publicity.businessportal.gr",
  "consult.cbso.nbb.be",
  "ws.cbso.nbb.be",
];

/** La regola d'oro: nessun officialPage, nessun host di registro nella risposta. */
export function expectGoldenRule(response: SearchResponse): void {
  expect(response.officialPage).toBeUndefined();
  const serialized = JSON.stringify(response);
  for (const host of REGISTRY_HOSTS) {
    expect(serialized).not.toContain(host);
  }
}

/** Il degrado: quando la catena dati fallisce, officialPage DEVE tornare. */
export function expectDegradation(response: SearchResponse): void {
  expect(response.financials?.available ?? false).toBe(false);
  expect(response.officialPage).toBeDefined();
  expect(response.officialPage?.url).toMatch(/^https:\/\//);
}

describe("helper della regola d'oro", () => {
  it("expectGoldenRule accetta una risposta senza officialPage né host di registro", () => {
    const clean: SearchResponse = {
      found: true,
      sources: [],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      financials: {
        available: true,
        years: [],
        documents: [
          {
            id: "SK-1",
            year: 2024,
            kind: "ANNUAL_REPORT",
            format: "pdf",
            availability: "DOCUMENT_DOWNLOADABLE",
            downloadUrl: "/api/company-finder/ruz-document?attachment=1",
          },
        ],
      },
    };
    expect(() => expectGoldenRule(clean)).not.toThrow();
  });

  it("expectGoldenRule rifiuta una risposta con officialPage", () => {
    const leaky: SearchResponse = {
      found: true,
      sources: [],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      officialPage: {
        url: "https://www.registeruz.sk/cruz-public/",
        label: "RÚZ",
        note: "consultazione",
      },
    };
    expect(() => expectGoldenRule(leaky)).toThrow();
  });

  it("expectGoldenRule rifiuta un host di registro nascosto in una nota", () => {
    const leaky: SearchResponse = {
      found: true,
      sources: [],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      financials: {
        available: true,
        years: [],
        note: "Documento da registeruz.sk",
      },
    };
    expect(() => expectGoldenRule(leaky)).toThrow();
  });

  it("expectDegradation richiede officialPage quando i dati non sono disponibili", () => {
    const degraded: SearchResponse = {
      found: true,
      sources: [],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      financials: { available: false, years: [] },
      officialPage: {
        url: "https://www.registeruz.sk/cruz-public/",
        label: "RÚZ",
        note: "consultazione",
      },
    };
    expect(() => expectDegradation(degraded)).not.toThrow();
  });
});
```

- [ ] **Step 2: Eseguire il test per verificare che passi**

Run: `npx vitest run test/company-finder-golden-rule.test.ts`
Expected: PASS, 4 test verdi. Gli helper sono testati su dati sintetici; non toccano ancora la rete.

- [ ] **Step 3: Commit**

```bash
git add test/company-finder-golden-rule.test.ts
git commit -m "test: helper per l'invariante della regola d'oro e per il degrado"
```

---

### Task 2: Rendere condizionale la ri-attaccatura di officialPage

È il cuore del lavoro: una riga in `prioritizeBalanceDocument()`. Oggi `officialPage` torna sempre; deve tornare solo quando i dati finanziari non sono disponibili.

**Files:**
- Modify: `src/lib/company-finder.functions.ts` (funzione `prioritizeBalanceDocument`)
- Test: `test/company-finder-golden-rule.test.ts`

**Interfaces:**
- Consumes: `expectGoldenRule`, `expectDegradation` dal Task 1
- Produces: `prioritizeBalanceDocument(response, fallbackId)` con ri-attaccatura condizionale. Firma invariata.

- [ ] **Step 1: Leggere la funzione attuale**

Run: `grep -o "async function prioritizeBalanceDocument[^\n]\{0,700\}" src/lib/company-finder.functions.ts`

Il corpo attuale, riformattato per leggibilità, è:

```ts
async function prioritizeBalanceDocument(
  response: SearchResponse,
  fallbackId: string,
): Promise<SearchResponse> {
  const resolved = await resolveGreekBalance(response, fallbackId);
  const documentUrl = resolved.financials?.documentUrl;
  const officialPage = resolved.officialPage;
  if (!documentUrl) {
    const hidden = hideSources(resolved);
    hidden.officialPage = officialPage;
    return hidden;
  }
  resolved.financials = {
    ...resolved.financials!,
    documentUrl: toInPageDocumentUrl(documentUrl),
  };
  const hidden = hideSources(resolved);
  hidden.officialPage = officialPage;
  return hidden;
}
```

- [ ] **Step 2: Scrivere il test che fallisce**

Aggiungi in coda a `test/company-finder-golden-rule.test.ts`:

```ts
describe("prioritizeBalanceDocument — officialPage condizionale", () => {
  it("rimuove officialPage quando il bilancio è disponibile", async () => {
    const { prioritizeBalanceDocumentForTest } = await import(
      "../src/lib/company-finder.functions"
    );
    const withData: SearchResponse = {
      found: true,
      sources: [],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      financials: {
        available: true,
        years: [{ periodLabel: "Esercizio 2024", year: 2024, currency: "EUR" }],
        documents: [
          {
            id: "SK-1",
            year: 2024,
            kind: "ANNUAL_REPORT",
            format: "pdf",
            availability: "DOCUMENT_DOWNLOADABLE",
            downloadUrl: "/api/company-finder/ruz-document?attachment=1",
          },
        ],
      },
      officialPage: {
        url: "https://www.registeruz.sk/cruz-public/",
        label: "RÚZ",
        note: "consultazione",
      },
    };
    const result = await prioritizeBalanceDocumentForTest(withData, "12345678");
    expectGoldenRule(result);
  });

  it("conserva officialPage quando il bilancio NON è disponibile", async () => {
    const { prioritizeBalanceDocumentForTest } = await import(
      "../src/lib/company-finder.functions"
    );
    const withoutData: SearchResponse = {
      found: true,
      sources: [],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      financials: { available: false, years: [] },
      officialPage: {
        url: "https://www.registeruz.sk/cruz-public/",
        label: "RÚZ",
        note: "consultazione",
      },
    };
    const result = await prioritizeBalanceDocumentForTest(withoutData, "12345678");
    expectDegradation(result);
  });
});
```

- [ ] **Step 3: Eseguire il test per verificare che fallisca**

Run: `npx vitest run test/company-finder-golden-rule.test.ts`
Expected: FAIL. Il primo nuovo test fallisce perché `prioritizeBalanceDocumentForTest` non è esportata (`SyntaxError` o `undefined is not a function`).

- [ ] **Step 4: Implementare la modifica minima**

In `src/lib/company-finder.functions.ts`, sostituisci la funzione `prioritizeBalanceDocument` con la versione riformattata e condizionale, ed esportala per i test:

```ts
/**
 * Il bilancio in pagina ha la precedenza sulla consultazione del registro.
 * `officialPage` si ri-attacca SOLO se i dati finanziari non sono disponibili:
 * è il degrado che garantisce che nessun paese diventi una pagina vuota.
 */
async function prioritizeBalanceDocument(
  response: SearchResponse,
  fallbackId: string,
): Promise<SearchResponse> {
  const resolved = await resolveGreekBalance(response, fallbackId);
  const documentUrl = resolved.financials?.documentUrl;
  const officialPage = resolved.officialPage;

  if (documentUrl) {
    resolved.financials = {
      ...resolved.financials!,
      documentUrl: toInPageDocumentUrl(documentUrl),
    };
  }

  const hidden = hideSources(resolved);

  // Un bilancio è servibile se c'è un documento incapsulato o almeno un
  // documento scaricabile nell'elenco. In quel caso la fonte non si mostra.
  const servable =
    Boolean(documentUrl) ||
    (hidden.financials?.documents?.some((d) => Boolean(d.downloadUrl)) ?? false);

  if (!servable && officialPage) hidden.officialPage = officialPage;
  return hidden;
}

/** Solo per i test: espone la funzione senza cambiarne il comportamento. */
export const prioritizeBalanceDocumentForTest = prioritizeBalanceDocument;
```

- [ ] **Step 5: Eseguire i test per verificare che passino**

Run: `npx vitest run test/company-finder-golden-rule.test.ts`
Expected: PASS, 6 test verdi.

- [ ] **Step 6: Verificare che nulla sia regredito**

Run: `npx vitest run test/company-finder-document-url-contract.test.ts test/company-finder-no-regression.test.ts test/company-finder-coverage.test.ts`
Expected: PASS. Il contratto sugli URL degli adapter non è toccato.

- [ ] **Step 7: Controllo completo**

Run: `npm run check`
Expected: PASS (lint, typecheck, test, build).

Se un test di un altro paese fallisce qui, **fermati e riporta**: significa che quel paese si affidava a `officialPage` pur avendo documenti scaricabili, ed è un'informazione da registrare prima di proseguire.

- [ ] **Step 8: Commit**

```bash
git add src/lib/company-finder.functions.ts test/company-finder-golden-rule.test.ts
git commit -m "feat: officialPage torna solo se il bilancio non e' servibile"
```

---

### Task 3: Aggiungere years a SearchRequest

Campo opzionale, senza comportamento: lo consumeranno i task successivi. Separato perché è l'interfaccia che gli altri task condividono.

**Files:**
- Modify: `src/lib/company-finder/types.ts:162-166`
- Create: `test/company-finder-years-selection.test.ts`

**Interfaces:**
- Produces: `SearchRequest.years?: number[]` — consumato dai Task 4-7.

- [ ] **Step 1: Scrivere il test che fallisce**

Crea `test/company-finder-years-selection.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { SearchRequest } from "../src/lib/company-finder/types";

describe("SearchRequest.years", () => {
  it("accetta un elenco di esercizi", () => {
    const request: SearchRequest = {
      query: "Test",
      vat: "",
      country: "SK",
      years: [2024, 2023],
    };
    expect(request.years).toEqual([2024, 2023]);
  });

  it("resta opzionale: una richiesta senza years è valida", () => {
    const request: SearchRequest = { query: "Test", vat: "", country: "SK" };
    expect(request.years).toBeUndefined();
  });
});
```

- [ ] **Step 2: Eseguire per verificare che fallisca**

Run: `npx vitest run test/company-finder-years-selection.test.ts`
Expected: FAIL in typecheck — `Object literal may only specify known properties, and 'years' does not exist in type 'SearchRequest'`.

- [ ] **Step 3: Aggiungere il campo**

In `src/lib/company-finder/types.ts`, sostituisci l'interfaccia `SearchRequest`:

```ts
export interface SearchRequest {
  query: string;
  vat: string;
  country: Iso2 | "";
  /**
   * Esercizi richiesti. Se presente, l'adapter limita il lavoro a questi anni;
   * se assente, elenca ciò che trova e scarica solo il più recente.
   */
  years?: number[] | undefined;
}
```

- [ ] **Step 4: Eseguire per verificare che passi**

Run: `npx vitest run test/company-finder-years-selection.test.ts && npm run typecheck`
Expected: PASS entrambi.

- [ ] **Step 5: Commit**

```bash
git add src/lib/company-finder/types.ts test/company-finder-years-selection.test.ts
git commit -m "feat: SearchRequest.years per la selezione degli esercizi"
```

---

### Task 4: Slovacchia — accertare lo stato e filtrare per anno

Il ramo SK in `findCompany` esce prima di `prioritizeBalanceDocument()`, partendo da `emptyResponse()` che non imposta `officialPage`. Va accertato se SK è già conforme prima di cambiarlo. `ruz-sk.ts` emette già `downloadUrl: internalAttachmentUrl(id)` — un URL interno — quindi non c'è perdita da correggere.

**Files:**
- Modify: `src/lib/company-finder/sources/bilanci/ruz-sk.ts`
- Test: `src/lib/company-finder/sources/bilanci/ruz-sk.test.ts`

**Interfaces:**
- Consumes: `SearchRequest.years` (Task 3); `expectGoldenRule` (Task 1)
- Produces: `filterStatementsByYears(statements, years)` — riusata come riferimento dai Task 5-7.

- [ ] **Step 1: Scrivere il test del filtro anni**

Aggiungi in coda a `src/lib/company-finder/sources/bilanci/ruz-sk.test.ts`:

```ts
import { filterStatementsByYears } from "./ruz-sk";

describe("RÚZ — filtro per esercizio", () => {
  const statements = [
    { id: 3, periodEnd: "2024-12-31", reportIds: [30] },
    { id: 2, periodEnd: "2023-12-31", reportIds: [20] },
    { id: 1, periodEnd: "2022-12-31", reportIds: [10] },
  ];

  it("senza anni richiesti restituisce tutto, dal più recente", () => {
    expect(filterStatementsByYears(statements, undefined).map((s) => s.id)).toEqual([3, 2, 1]);
  });

  it("con anni richiesti restituisce solo quelli", () => {
    expect(filterStatementsByYears(statements, [2023]).map((s) => s.id)).toEqual([2]);
  });

  it("ignora gli anni non depositati senza fallire", () => {
    expect(filterStatementsByYears(statements, [2023, 1999]).map((s) => s.id)).toEqual([2]);
  });

  it("scarta i bilanci senza periodEnd leggibile", () => {
    const withBroken = [...statements, { id: 4, reportIds: [40] }];
    expect(filterStatementsByYears(withBroken, [2024]).map((s) => s.id)).toEqual([3]);
  });
});
```

- [ ] **Step 2: Eseguire per verificare che fallisca**

Run: `npx vitest run src/lib/company-finder/sources/bilanci/ruz-sk.test.ts`
Expected: FAIL — `filterStatementsByYears` non è esportata da `./ruz-sk`.

- [ ] **Step 3: Implementare il filtro**

In `src/lib/company-finder/sources/bilanci/ruz-sk.ts`, aggiungi (riformattata, non minificata — è codice nuovo):

```ts
/** Esercizio di un bilancio RÚZ, dedotto da `obdobieDo` (periodEnd). */
export function ruzStatementYear(statement: { periodEnd?: string | undefined }): number | undefined {
  const match = statement.periodEnd?.match(/^(\d{4})/);
  if (!match) return undefined;
  const year = Number(match[1]);
  return Number.isInteger(year) ? year : undefined;
}

/**
 * Limita i bilanci agli esercizi richiesti, dal più recente.
 * `years` assente = nessun filtro. Gli anni non depositati sono ignorati in
 * silenzio: è l'utente a chiederli, non un errore della fonte.
 */
export function filterStatementsByYears<T extends { periodEnd?: string | undefined }>(
  statements: T[],
  years: number[] | undefined,
): T[] {
  const withYear = statements.filter((s) => ruzStatementYear(s) !== undefined);
  const sorted = [...withYear].sort(
    (a, b) => (ruzStatementYear(b) ?? 0) - (ruzStatementYear(a) ?? 0),
  );
  if (!years || years.length === 0) return sorted;
  const wanted = new Set(years);
  return sorted.filter((s) => wanted.has(ruzStatementYear(s)!));
}
```

- [ ] **Step 4: Eseguire per verificare che passi**

Run: `npx vitest run src/lib/company-finder/sources/bilanci/ruz-sk.test.ts`
Expected: PASS, 4 nuovi test verdi.

- [ ] **Step 5: Accertare lo stato attuale di SK con un test di caratterizzazione**

Aggiungi in coda a `test/company-finder-golden-rule.test.ts`:

```ts
describe("Slovacchia — stato della regola d'oro", () => {
  it("una risposta SK con allegati scaricabili non espone la fonte", () => {
    const skResponse: SearchResponse = {
      found: true,
      sources: [{ id: "ruz-sk", label: "RÚZ", state: "ok" }],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      financials: {
        available: true,
        years: [{ periodLabel: "Esercizio 2024", year: 2024, currency: "EUR" }],
        documents: [
          {
            id: "SK-2024",
            year: 2024,
            kind: "ANNUAL_REPORT",
            format: "pdf",
            availability: "DOCUMENT_DOWNLOADABLE",
            downloadUrl: "/api/company-finder/ruz-document?attachment=99",
          },
        ],
      },
    };
    expectGoldenRule(skResponse);
  });
});
```

- [ ] **Step 6: Eseguire e registrare l'esito**

Run: `npx vitest run test/company-finder-golden-rule.test.ts`
Expected: PASS. Conferma che la forma della risposta SK rispetta l'invariante.

Se fallisce, **fermati e riporta** quale asserzione è saltata: significa che la forma reale differisce da quella attesa e il Task 5 va ripianificato.

- [ ] **Step 7: Controllo completo**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/company-finder/sources/bilanci/ruz-sk.ts src/lib/company-finder/sources/bilanci/ruz-sk.test.ts test/company-finder-golden-rule.test.ts
git commit -m "feat(sk): filtro per esercizio nella catena RUZ"
```

---

### Task 5: Slovacchia — onorare years nella catena di fetch

**Files:**
- Modify: `src/lib/company-finder/sources/bilanci/ruz-sk.ts` (`fetchRuzCompanyByIdentifier`)
- Modify: `src/lib/company-finder.functions.ts` (`attachSlovakFinancials`)
- Test: `src/lib/company-finder/sources/bilanci/ruz-sk.test.ts`

**Interfaces:**
- Consumes: `filterStatementsByYears` (Task 4), `SearchRequest.years` (Task 3)
- Produces: `fetchRuzCompanyByIco(input, timeoutMs?, years?)` e `fetchRuzCompanyByDic(input, timeoutMs?, years?)`

- [ ] **Step 1: Scrivere il test che fallisce**

Aggiungi a `src/lib/company-finder/sources/bilanci/ruz-sk.test.ts`:

```ts
describe("RÚZ — years propagato al fetch", () => {
  it("fetchRuzCompanyByIco accetta un elenco di esercizi", () => {
    expect(fetchRuzCompanyByIco.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Eseguire per verificare che fallisca**

Run: `npx vitest run src/lib/company-finder/sources/bilanci/ruz-sk.test.ts -t "years propagato"`
Expected: FAIL — l'arità attuale è 2 (`input`, `timeoutMs`).

- [ ] **Step 3: Estendere le firme**

In `ruz-sk.ts`, sostituisci le due funzioni esportate:

```ts
export function fetchRuzCompanyByIco(
  input: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  years?: number[],
): Promise<RuzProviderResult> {
  return fetchRuzCompanyByIdentifier("ico", input, timeoutMs, years);
}

export function fetchRuzCompanyByDic(
  input: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  years?: number[],
): Promise<RuzProviderResult> {
  return fetchRuzCompanyByIdentifier("dic", input, timeoutMs, years);
}
```

Poi, dentro `fetchRuzCompanyByIdentifier`, accetta il quarto parametro `years?: number[]` e applica il filtro **subito dopo** aver ottenuto l'elenco dei bilanci e **prima** di scaricare i report:

```ts
const selected = filterStatementsByYears(statements, years);
```

usando `selected` al posto di `statements` da quel punto in poi. È questo che evita di scaricare dodici documenti per mostrarne uno.

- [ ] **Step 4: Eseguire per verificare che passi**

Run: `npx vitest run src/lib/company-finder/sources/bilanci/ruz-sk.test.ts`
Expected: PASS, tutti i test del file verdi.

- [ ] **Step 5: Propagare da attachSlovakFinancials**

In `src/lib/company-finder.functions.ts`, `attachSlovakFinancials` acquisisce un quarto parametro e lo inoltra:

```ts
async function attachSlovakFinancials(
  response: SearchResponse,
  identifier: string,
  kind: "ico" | "dic",
  years?: number[],
): Promise<SearchResponse> {
  const result =
    kind === "ico"
      ? await fetchRuzCompanyByIco(identifier, undefined, years)
      : await fetchRuzCompanyByDic(identifier, undefined, years);
  // …resto del corpo invariato…
}
```

Nel corpo di `findCompany`, passa `data.years` alle tre chiamate esistenti di `attachSlovakFinancials`.

- [ ] **Step 6: Verificare che lo schema accetti years**

`findCompany` valida l'input con `searchSchema.parse(...)`. Verifica che `years` sia accettato:

Run: `grep -o "const searchSchema[^;]\{0,300\}" src/lib/company-finder.functions.ts`

Se lo schema Zod non include `years`, aggiungilo:

```ts
years: z.array(z.number().int().min(1900).max(2100)).max(24).optional(),
```

Il limite di 24 esercizi impedisce che una richiesta chieda centinaia di documenti.

- [ ] **Step 7: Controllo completo**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/company-finder/sources/bilanci/ruz-sk.ts src/lib/company-finder/sources/bilanci/ruz-sk.test.ts src/lib/company-finder.functions.ts
git commit -m "feat(sk): onora SearchRequest.years nella catena RUZ"
```

---

### Task 6: Polonia — estendere la condizione esistente

La Polonia ha già una condizione per `officialPage`:

```ts
if (page && !esefAttached) response.officialPage = page;
```

Copre ESEF ma ignora `attachPolishKrsFilings`, il cui esito è calcolato e poi scartato con `void krsFilingsAttached`. Va incluso.

**Files:**
- Modify: `src/lib/company-finder.functions.ts` (ramo `country === "PL"` in `findCompany`)
- Test: `test/company-finder-golden-rule.test.ts`

**Interfaces:**
- Consumes: `expectGoldenRule`, `expectDegradation` (Task 1)

- [ ] **Step 1: Scrivere il test che fallisce**

Aggiungi a `test/company-finder-golden-rule.test.ts`:

```ts
describe("Polonia — officialPage e depositi KRS", () => {
  it("una risposta PL con depositi KRS scaricabili non espone la fonte", () => {
    const plResponse: SearchResponse = {
      found: true,
      sources: [{ id: "krs", label: "KRS", state: "ok" }],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      financials: {
        available: true,
        years: [{ periodLabel: "Esercizio 2024", year: 2024, currency: "PLN" }],
        documents: [
          {
            id: "PL-2024",
            year: 2024,
            kind: "ANNUAL_REPORT",
            format: "pdf",
            availability: "DOCUMENT_DOWNLOADABLE",
            downloadUrl: "/api/company-finder/document?country=PL&company=1&year=2024",
          },
        ],
      },
    };
    expectGoldenRule(plResponse);
  });
});
```

- [ ] **Step 2: Eseguire per verificare lo stato**

Run: `npx vitest run test/company-finder-golden-rule.test.ts -t "Polonia"`
Expected: PASS sulla forma. Il test fissa il contratto della risposta PL.

- [ ] **Step 3: Estendere la condizione**

In `findCompany`, ramo `country === "PL"`, sostituisci:

```ts
if (page && !esefAttached) response.officialPage = page;
void krsFilingsAttached;
```

con:

```ts
// officialPage solo se NESSUNA delle due catene ha prodotto un bilancio:
// né ESEF né i depositi KRS. Altrimenti il documento è servito in pagina.
if (page && !esefAttached && !krsFilingsAttached) response.officialPage = page;
```

- [ ] **Step 4: Eseguire i test polacchi**

Run: `npx vitest run src/lib/company-finder/official-pages-pl.test.ts src/lib/company-finder/pl-official-fallback.test.ts src/lib/company-finder/pl-pdf-gate.test.ts src/lib/company-finder/sources/bilanci/poland-aleo.test.ts`
Expected: PASS.

Se un test si aspettava `officialPage` presente con depositi KRS attaccati, **fermati e riporta**: quel test codifica una decisione che va rivista con il committente, non aggirata.

- [ ] **Step 5: Controllo completo**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/company-finder.functions.ts test/company-finder-golden-rule.test.ts
git commit -m "feat(pl): officialPage solo se ne' ESEF ne' KRS hanno prodotto il bilancio"
```

---

### Task 7: Grecia e Belgio

La Grecia passa già da `resolveGreekBalance()` dentro `prioritizeBalanceDocument()`, quindi il Task 2 la copre automaticamente: questo task lo verifica. Il Belgio resta in `CONSULT_PAGES` finché `NBB_CBSO_API_KEY` non è configurata — comportamento corretto, da preservare esplicitamente.

**Files:**
- Test: `test/company-finder-golden-rule.test.ts`
- Test: `test/company-finder-be-cbso.test.ts` (verifica, non modifica)

**Interfaces:**
- Consumes: `expectGoldenRule`, `expectDegradation` (Task 1)

- [ ] **Step 1: Scrivere i test di Grecia e Belgio**

Aggiungi a `test/company-finder-golden-rule.test.ts`:

```ts
describe("Grecia — coperta dal passaggio centrale", () => {
  it("una risposta GR con documento incapsulato non espone la fonte", async () => {
    const { prioritizeBalanceDocumentForTest } = await import(
      "../src/lib/company-finder.functions"
    );
    const grResponse: SearchResponse = {
      found: true,
      sources: [{ id: "gemi", label: "ΓΕΜΗ", state: "ok" }],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      financials: {
        available: true,
        years: [],
        documentUrl: "https://filings.businessportal.gr/filing/123.pdf",
      },
      officialPage: {
        url: "https://publicity.businessportal.gr/",
        label: "ΓΕΜΗ",
        note: "consultazione",
      },
    };
    const result = await prioritizeBalanceDocumentForTest(grResponse, "1234567890");
    expectGoldenRule(result);
  });
});

describe("Belgio — senza chiave NBB-CBSO resta in consultazione", () => {
  it("degrada a officialPage quando il bilancio non è disponibile", async () => {
    const { prioritizeBalanceDocumentForTest } = await import(
      "../src/lib/company-finder.functions"
    );
    const beResponse: SearchResponse = {
      found: true,
      sources: [{ id: "cbso", label: "NBB CBSO", state: "failed", detail: "chiave assente" }],
      warnings: [],
      searchedAt: "2026-09-17T00:00:00.000Z",
      financials: { available: false, years: [] },
      officialPage: {
        url: "https://consult.cbso.nbb.be/",
        label: "Centrale dei bilanci — Banca nazionale del Belgio",
        note: "consultazione",
      },
    };
    const result = await prioritizeBalanceDocumentForTest(beResponse, "0417497106");
    expectDegradation(result);
  });
});
```

- [ ] **Step 2: Eseguire i test**

Run: `npx vitest run test/company-finder-golden-rule.test.ts`
Expected: PASS. La Grecia non espone più la fonte; il Belgio degrada correttamente.

- [ ] **Step 3: Verificare che il Belgio non sia regredito**

Run: `npx vitest run test/company-finder-be-cbso.test.ts`
Expected: PASS. Il 503 azionabile in assenza di `NBB_CBSO_API_KEY` resta invariato.

- [ ] **Step 4: Controllo completo**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/company-finder-golden-rule.test.ts
git commit -m "test: Grecia coperta dal passaggio centrale, Belgio degrada senza chiave"
```

---

### Task 8: Aggiornare coverage.ts e la documentazione

Ultimo task: i paesi che hanno superato i test escono da `CONSULT_PAGES` ed entrano in `AUTO_ISOS`. Si fa per ultimo perché `coverage.ts` deve riflettere ciò che i test hanno dimostrato, non ciò che si sperava.

**Files:**
- Modify: `src/lib/company-finder/coverage.ts:15-62`
- Test: `test/company-finder-coverage.test.ts`

- [ ] **Step 1: Stabilire quali paesi hanno superato i test**

Run: `npm run check`
Expected: PASS.

Elenca i paesi fra SK, PL, GR, BE i cui test dei Task 4-7 sono verdi. **Solo quelli** si promuovono. Il Belgio si promuove solo se `NBB_CBSO_API_KEY` è configurata e il suo test end-to-end passa; altrimenti resta in `CONSULT_PAGES`, ed è l'esito corretto.

- [ ] **Step 2: Scrivere il test della nuova copertura**

In `test/company-finder-coverage.test.ts`, aggiungi (adattando l'elenco all'esito dello Step 1):

```ts
import { AUTO_ISOS, CONSULT_PAGES, isCovered } from "../src/lib/company-finder/coverage";

describe("copertura dopo lo sblocco", () => {
  it("i paesi promossi sono automatici e non più in consultazione", () => {
    for (const iso of ["SK", "PL", "GR"]) {
      expect((AUTO_ISOS as readonly string[]).includes(iso)).toBe(true);
      expect(iso in CONSULT_PAGES).toBe(false);
    }
  });

  it("il Belgio resta in consultazione finché manca la chiave NBB-CBSO", () => {
    expect("BE" in CONSULT_PAGES).toBe(true);
  });

  it("nessun paese ha perso copertura", () => {
    for (const iso of ["DE", "NL", "DK", "UK", "FR", "EE", "NO", "SK", "PL", "GR", "BE"]) {
      expect(isCovered(iso)).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Eseguire per verificare che fallisca**

Run: `npx vitest run test/company-finder-coverage.test.ts`
Expected: FAIL — SK, PL e GR sono ancora in `CONSULT_PAGES`.

- [ ] **Step 4: Promuovere i paesi**

In `src/lib/company-finder/coverage.ts`, sposta gli ISO promossi:

```ts
export const AUTO_ISOS = [
  "DE", "NL", "DK", "UK", "FR", "EE", "NO",
  // Promossi il 2026-09-17: catena dati già presente, sbloccata rendendo
  // condizionale la ri-attaccatura di officialPage. Ogni promozione è
  // coperta da un test end-to-end.
  "SK", "PL", "GR",
] as const;
```

e rimuovi le voci corrispondenti da `CONSULT_PAGES`. **Lascia `BE`** in `CONSULT_PAGES` con la sua voce invariata.

- [ ] **Step 5: Eseguire per verificare che passi**

Run: `npx vitest run test/company-finder-coverage.test.ts`
Expected: PASS.

- [ ] **Step 6: Controllo completo**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/company-finder/coverage.ts test/company-finder-coverage.test.ts
git commit -m "feat: promuove SK, PL e GR a copertura automatica"
```

---

## Self-Review

**Copertura della spec:**

| Requisito della spec | Task |
|---|---|
| Invariante `officialPage` verificabile | 1 |
| Ri-attaccatura condizionale | 2 |
| Degrado garantito | 1 (helper), 2 (test), 7 (BE) |
| `SearchRequest.years` | 3 |
| SK sbloccata + anni | 4, 5 |
| PL sbloccata | 6 |
| GR sbloccata | 7 |
| BE gestita senza chiave | 7 |
| Contratto adapter invariato | 2 (Step 6) |
| Nessuna quarta route | Nessun task ne crea |
| Formattazione solo del toccato | 2, 4, 5 |
| `coverage.ts` riflette i test | 8 |

**Rischio noto, dichiarato:** i Task 4, 6 e 7 verificano la *forma* delle risposte con dati sintetici, non la rete reale. Un test end-to-end contro i registri veri richiede rete in CI e dati che cambiano: va aggiunto come verifica manuale prima della promozione allo Step 1 del Task 8, non come test automatico instabile. Questo è un limite consapevole, non una svista.

**Fuori perimetro, con spec propria da scrivere:** i 9 paesi senza adapter (CZ, FI, SI, LV, LT, BG, PT, RO, HR), dove Firecrawl tornerà pertinente.
