# TPBox — Integrazione Attualità, Biblioteca e Admin Monitor (piano additivo)

## Blocco rilevato prima di ogni modifica: schema mismatch

Verificato ora con una query di sola lettura sul database del progetto:
**lo schema `public` è completamente vuoto — zero tabelle e zero viste.**

Conseguenze dirette:
- `v_attualita` **non esiste**.
- Non esiste alcuna tabella news/pipeline, quindi non esistono le colonne
  `status`, `gate_result`, `flag_pending_review`, `published_at`, né uno stato `RETRACTED`.
- Non esiste nessuna tabella per un ruolo redazionale (né `user_roles`).
- Tutta l'Attualità attuale è servita dal mock server-side:
  `src/lib/repositories/news.repository.server.ts` su `src/lib/domain/demo-data.ts`,
  esposto via `getNewsFeed` in `src/lib/portal.functions.ts`, con filtro
  "solo `PUBLISHED`" già applicato lato server e stato servizio OK/STALE/DEGRADED.
- `NewsItem` ha già `pdfUrl?`, quindi la Biblioteca è realizzabile subito sui dati esistenti.
- Non esiste `src/routes/_authenticated/`: il gate per l'area riservata va creato.

Poiché mi hai chiesto di mantenere **Supabase LOCKED**, il piano legge dal percorso
esistente (published news query) dietro un unico punto di sostituzione, così l'aggancio a
`v_attualita` diventa una modifica di poche righe quando la vista esisterà.

## Cosa cambia per chi usa il portale

- **/attualita** — invariata nell'aspetto e nei filtri (ricerca, area, tema, categoria,
  paese, solo fonti istituzionali, stati loading/empty/error/stale/degraded). Cambia solo
  la provenienza dei dati, che passa da un lettore generico a un lettore dichiaratamente
  "solo contenuti pubblicati".
- **/biblioteca** — nuova pagina: elenco dei soli contenuti pubblicati che hanno un
  documento PDF, con ricerca, filtro per area e per anno, e link al documento ufficiale.
  Voce aggiunta al menu principale.
- **/admin/monitor** — nuova area riservata, accessibile solo dopo l'accesso. Mostra per
  ciascun elemento: stato, esito del controllo redazionale, indicatore di revisione
  necessaria e data di pubblicazione. L'unica azione disponibile è il **ritiro** di un
  contenuto pubblicato (PUBLISHED → RETRACTED). Nessuna cancellazione, nessuna
  pubblicazione automatica.

## File e route esatti che toccherei

Nuovi:
- `src/routes/biblioteca.tsx` — pagina Biblioteca con `head()` proprio.
- `src/components/news/BibliotecaList.tsx` — elenco + filtri (ricerca, area, anno).
- `src/routes/_authenticated/route.tsx` — gate `ssr: false` con redirect a `/auth`
  (creato insieme al primo figlio, come richiesto dal router).
- `src/routes/_authenticated/admin.monitor.tsx` — pannello monitor.
- `src/components/admin/MonitorTable.tsx` — tabella stati + azione di ritiro.
- `src/lib/attualita/published.ts` — tipi e mappatura del contratto di lettura pubblica
  (il punto unico che verrà ripuntato su `v_attualita`).
- `src/lib/attualita/monitor.functions.ts` — server functions protette:
  `getMonitorRows` e `retractPublishedItem`, entrambe con `requireSupabaseAuth`.

Modificati:
- `src/lib/portal.functions.ts` — aggiunte `getBibliotecaItems` e `getPublishedNewsFeed`
  (wrapper espliciti "solo pubblicati"); nessuna firma esistente rimossa.
- `src/lib/repositories/news.repository.server.ts` — aggiunti i lettori dedicati a
  biblioteca e monitor, riusando il filtro `publishedOnly` già presente.
- `src/lib/domain/types.ts` — aggiunti i tipi `MonitorRow`, `GateResult` e lo stato
  `RETRACTED` accanto a quelli esistenti (additivo, nessuna rimozione).
- `src/components/site/SiteHeader.tsx` — voce di menu `Biblioteca`.
- `src/routes/attualita.index.tsx` e `src/routes/attualita.$area.tsx` — nessun cambio di
  UI, solo passaggio al lettore "solo pubblicati".

Non toccati: Amount B, Ravvedimento, Valora, Interpelli, PATENTSCOPE, Company Finder,
`src/integrations/**`, `src/start.ts`, `supabase/**`.

## Regole editoriali e di sicurezza rispettate

- Lettura pubblica limitata ai soli elementi `PUBLISHED`; le bozze non escono mai.
- Nessun riferimento a RegFollower, a provider esterni o a dettagli tecnici di
  acquisizione nell'interfaccia.
- Nessun secret nel frontend; nessun uso del client service-role; nessun `AUTO_PUBLISH`.
- Rollback esclusivamente `PUBLISHED → RETRACTED`; nessun `DELETE` in nessun percorso.
- Nessun fetch esterno dal browser; tutte le letture passano da server functions.
- Nessun deploy, nessuna pubblicazione, nessuna migrazione in questa fase.

## Note tecniche

- Il monitor usa `createServerFn` + `requireSupabaseAuth`; il bearer è già attaccato da
  `attachSupabaseAuth` registrato in `src/start.ts`, quindi non serve altro wiring.
- Il monitor sta sotto `_authenticated/` con `ssr: false`: nessun gate su route pubbliche,
  nessun loop di redirect al refresh.
- Finché lo schema è vuoto, `getMonitorRows` e `retractPublishedItem` operano sul repository
  esistente e il ritiro non è persistente tra sessioni: il pannello è pienamente funzionale
  come interfaccia e diventa persistente quando la tabella/vista esisterà. Questo limite
  sarà indicato in pagina in modo esplicito.
- Accessibilità: HTML semantico, label esplicite, `aria-live` sugli esiti, focus visibile,
  `Intl.*` con timezone `Europe/Rome`, nessuna `transition: all`.
- Quality gate finale: `npm run typecheck`, `npm run test`, `npm run build`, ESLint sui soli
  file toccati.

## Decisione che mi serve da te

Il punto bloccante è uno solo: il database è vuoto.
- **A (predefinita, Supabase LOCKED)** — implemento le tre superfici sul percorso dati
  attuale, con il seam pronto per `v_attualita`. Zero migrazioni.
- **B** — prima definiamo insieme lo schema (tabella news + `v_attualita` + ruolo
  redazionale + RLS/GRANT) e poi collego la UI ai dati reali. Richiede di sbloccare Supabase.
