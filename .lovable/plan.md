# Attualità — transizione sicura MockRepo → DB reale TP Box (piano, nessun cutover)

## Stato verificato ora (sole letture)

- `/attualita` è servita al 100% lato server dal mock:
  `src/routes/attualita.index.tsx` / `attualita.$area.tsx` → `AttualitaFeed`
  → server fn `getNewsFeed` (`src/lib/portal.functions.ts`)
  → `listNewsFeed` in `src/lib/repositories/news.repository.server.ts`
  → `DEMO_NEWS` / `DEMO_SOURCES` in `src/lib/domain/demo-data.ts`.
- Il repository mock espone già esattamente due letture: `listNewsFeed(filters)` e
  `listSources()`, e applica già `publishedOnly` (solo `PUBLISHED`), health
  `OK/STALE/DEGRADED`, correlation id, timeout, retry, circuit breaker.
- Contratti di ritorno stabili in `src/lib/domain/types.ts`: `NewsFeedResult`,
  `NewsItem` (con `pdfUrl?`), `NewsSource`, `ServiceHealth`.
- Flag pubblici centralizzati in `src/lib/platform/feature-flags.ts` (nessun segreto).
- Database Supabase attualmente collegato: schema `public` **vuoto** (zero tabelle, zero
  viste). Quindi `v_attualita` e `v_biblioteca` **non sono verificabili da qui**, e il ref
  canonico `igtthymjeujkgfpmgoqj` non è quello collegato a questo progetto.

Conseguenza: il realRepo va scritto senza assumere colonne, e non può essere provato prima
del rebinding al progetto canonico. Il piano lo prevede esplicitamente.

## Principi del piano

1. Una sola interfaccia comune, due implementazioni.
2. Default `VITE_USE_REAL_REPO=false`: comportamento di oggi identico, `/attualita` mai vuota.
3. Nessun fallback silenzioso: se il flag è attivo e il repo reale non risponde o restituisce
   dati inattesi, l'utente vede uno stato di errore/servizio ridotto **esplicito**, non i dati
   demo travestiti da reali.
4. Reversibilità: si torna al mock cambiando un solo valore di ambiente.
5. Nessun fetch dal browser: tutto passa dalle server functions esistenti.

## (1) Interfaccia Repo comune

Nuovo file `src/lib/repositories/news.repo.ts` (solo tipi, client-safe):

```ts
export interface NewsRepo {
  readonly kind: "MOCK" | "REAL";
  getPublished(filters: NewsFilters): Promise<NewsFeedResult>;
  getSources(): Promise<NewsSource[]>;
}
```

Il mock attuale viene **adattato, non riscritto**: `src/lib/repositories/news.mock.repo.server.ts`
si limita a incapsulare `listNewsFeed` / `listSources` esistenti dietro l'interfaccia.
`news.repository.server.ts` resta invariato nel comportamento.

## (2) realRepo su DB reale, senza assumere schema

Nuovo file `src/lib/repositories/news.real.repo.server.ts`:

- Client Supabase creato **dentro l'handler** con `SUPABASE_URL` +
  `SUPABASE_PUBLISHABLE_KEY` (`persistSession: false`), quindi soggetto a RLS come `anon`.
  Nessun uso del service-role, nessun secret nel frontend.
- **Sonda di schema prima di leggere**: tentativo su `v_attualita`, poi `v_biblioteca` per la
  parte documentale. Se una vista manca o nega l'accesso, il repo non improvvisa su tabelle
  base: ritorna un esito diagnostico `SCHEMA_UNAVAILABLE`.
- **Validazione Zod di ogni riga** verso `NewsItem`. Righe non conformi non vengono
  "aggiustate": incrementano un contatore `rejectedRows` e il risultato viene marcato
  `UNEXPECTED_SHAPE`.
- Solo elementi pubblicati: filtro esplicito sullo stato di pubblicazione lato query, mai
  lato client.
- Filtri esistenti (testo, area, tema, categoria, paese, solo istituzionali) tradotti in
  predicati SQL/PostgREST; nessun cambio di UI, nessun filtro nuovo.
- Riuso di `withTimeout`, `retryIdempotent`, `CircuitBreaker`, `audit`, `newCorrelationId`
  da `src/lib/platform/resilience.server.ts`.
- Mappatura in un unico punto (`mapRow`) per rendere banale l'allineamento quando lo schema
  reale sarà noto.

## (3) Flag `VITE_USE_REAL_REPO=false` come default

- Lettura in un solo punto, `src/lib/platform/feature-flags.ts`:
  `useRealNewsRepo = import.meta.env.VITE_USE_REAL_REPO === "true"` (default falso anche
  quando la variabile è assente).
- Selettore server-side `src/lib/repositories/news.repo.server.ts` che restituisce mock o
  real in base al flag. Le server functions in `src/lib/portal.functions.ts` chiamano il
  selettore, non più direttamente il mock: firme e payload invariati.
- Nessuna variabile va scritta a mano nel repo: `VITE_USE_REAL_REPO` sarà impostata come
  variabile di progetto quando deciderai il cutover.

## (4) Guardrail health / empty-state, senza fallback silenzioso

`NewsFeedResult` viene esteso in modo additivo con un blocco diagnostico:

```ts
repoKind: "MOCK" | "REAL";
repoStatus: "OK" | "SCHEMA_UNAVAILABLE" | "UNREACHABLE" | "UNEXPECTED_SHAPE" | "EMPTY";
rejectedRows: number;
```

Regole:
- flag falso → `repoKind: "MOCK"`, comportamento identico a oggi.
- flag vero e repo reale OK → dati reali, `health` calcolata dai dati reali.
- flag vero e repo reale non raggiungibile / schema assente / righe inattese → **nessun
  fallback ai dati demo**: `health: "DEGRADED"`, `archive` vuoto e in pagina un riquadro
  `role="alert"` che dichiara che i contenuti reali non sono disponibili, con correlation id
  e pulsante Riprova. Il passaggio al mock resta una decisione tua, espressa dal flag.
- flag vero e dataset reale vuoto → stato `EMPTY` distinto dall'errore, con messaggio
  "nessun contenuto pubblicato" e nessun dato demo.
- `AttualitaFeed` guadagna solo la resa di questi stati; filtri, layout e testi restano quelli
  attuali.

## (5) Wiring reversibile

- Un solo commit additivo: nuovi file più modifiche minime a `portal.functions.ts`,
  `feature-flags.ts`, `types.ts` (campi additivi) e agli stati in `AttualitaFeed`.
- Rollback: rimettere `VITE_USE_REAL_REPO=false` (o rimuovere la variabile). Il mock non viene
  mai cancellato in questa fase.
- Test unitari nuovi (`vitest`) su mappatura, validazione righe e matrice degli stati
  guardrail, senza rete.
- Quality gate finale: `npm run typecheck`, `npm run test`, `npm run build`, più smoke HTTP
  su `/attualita` con flag falso per garantire pagina non vuota.

## (6) Cosa serve su Supabase prima del cutover (fuori da questo commit)

1. **Rebinding** di questo progetto Lovable al ref canonico `igtthymjeujkgfpmgoqj`
   (azione tua): finché il progetto collegato è quello vuoto, il flag reale non può essere
   attivato.
2. **Migrazione** sul progetto canonico: tabella news/pipeline e viste di lettura pubblica
   `v_attualita` (solo pubblicati) e `v_biblioteca` (solo pubblicati con documento), con i
   campi che alimentano `NewsItem`.
3. **RLS + GRANT**: RLS attiva sulle tabelle base; `SELECT` a `anon` e `authenticated`
   limitato alle viste di sola lettura pubblica; nessun accesso pubblico alle bozze; nessuna
   colonna interna esposta.
4. **Seed / contenuti reali**: almeno un insieme di elementi pubblicati, altrimenti il cutover
   produce lo stato `EMPTY`.
5. **Verifica** in lettura: elenco viste presenti, conteggio pubblicati, prova che `anon`
   legga solo le viste. Solo dopo si valuta `VITE_USE_REAL_REPO=true`.

## File coinvolti

Nuovi: `news.repo.ts`, `news.mock.repo.server.ts`, `news.real.repo.server.ts`,
`news.repo.server.ts`, `news.repo.test.ts` (tutti sotto `src/lib/repositories/`).

Modificati: `src/lib/portal.functions.ts`, `src/lib/platform/feature-flags.ts`,
`src/lib/domain/types.ts` (campi additivi), `src/components/news/AttualitaFeed.tsx`
(soli stati diagnostici).

Non toccati: `demo-data.ts`, `news.repository.server.ts` (comportamento), rotte Attualità,
Valora, Amount B, Ravvedimento, Interpelli, PATENTSCOPE, `src/integrations/**`, `src/start.ts`.

Dipendenze: nessuna nuova; si usano `@supabase/supabase-js`, `zod` e `vitest` già presenti.

## Rischi e mitigazioni

- **Schema reale ignoto** → sonda + validazione + mappatura in un punto unico; nessuna query
  su tabelle non verificate.
- **Cutover accidentale** → default falso, flag esplicito, nessun default a `true` nel codice.
- **Pagina vuota per l'utente** → con flag falso nulla cambia; con flag vero gli stati vuoto
  ed errore sono distinti e dichiarati.
- **Fuga di bozze** → lettura solo da viste pubbliche, filtro pubblicati anche in query.
- **Regressione UI** → nessun cambio di layout o filtri; solo blocchi di stato aggiuntivi.

## Conferma che mi serve

Procedo con l'implementazione di (1)–(5) come unico commit additivo, con
`VITE_USE_REAL_REPO` assente e quindi mock attivo, e senza toccare Supabase?
