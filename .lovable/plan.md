# Verifica tecnica TPBox: collegamento repo reale e senso di `VITE_USE_REAL_REPO=true`

## 1. Stato attuale

**Chiarimento sui due significati di "repository".** Nel progetto convivono due cose distinte:

- **Repository GitHub** (codice). Il git remote di questo progetto è il remote interno gestito dalla piattaforma (`git.private.lovable-gcp...` + mirror S3). **Nessun remote GitHub configurato** in questa copia. In `.github/workflows` esiste solo `tmp-smoke-generate-v1.yml`, non un Quality Gate ufficiale. Quindi il collegamento al repository GitHub reale **non è previsto né configurato lato codice**: è un'operazione di piattaforma (Plus (+) → GitHub), non un file da modificare.
- **Repository dati Attualità** (pattern software). È l'unica cosa che `VITE_USE_REAL_REPO` governa: la scelta tra dati demo e lettura dal database.

**Stato del flag.** `VITE_USE_REAL_REPO` non è presente in `.env` → default **mock**. Il flag è letto in un solo punto e usato in un solo selettore. Non esiste alcun riferimento a `USE_REAL_REPO` senza prefisso `VITE_`: quella variabile oggi **non ha nessun effetto** nel codice.

**Stato del database collegato.** Il backend attualmente collegato (`ajrcfcxwslbbrallgnsy`, Lovable Cloud gestito) **non è più vuoto**: contiene `news_items`, `news_sources`, `news_discovery`, `news_gate_log`, `normative` e le viste `v_attualita`, `v_biblioteca` — esattamente le relazioni che il repo reale interroga. Conteggi: `news_sources` = 6 righe; `news_items`, `v_attualita`, `v_biblioteca` = **0 righe**.

**Blocco decisivo.** Nessun GRANT esiste sullo schema `public` per `anon`, `authenticated`, `service_role` (query su `information_schema.role_table_grants`: risultato vuoto). Il repo reale legge con la publishable key, cioè come `anon`: senza GRANT la lettura è negata.

## 2. Evidenze (percorsi file)

| Evidenza | Percorso |
|---|---|
| Lettura del flag (unico punto) | `src/lib/platform/feature-flags.ts:22` — `import.meta.env["VITE_USE_REAL_REPO"] === "true"` |
| Selettore mock/real | `src/lib/repositories/news.repo.server.ts:10-12` |
| Interfaccia comune + risultato "vuoto dichiarato" | `src/lib/repositories/news.repo.ts` (`NewsRepo`, `RepoStatus`, `emptyRealResult`) |
| Adapter mock (incapsula i dati demo) | `src/lib/repositories/news.mock.repo.server.ts` |
| Repo reale: client publishable server-side, viste ammesse, classificazione errori | `src/lib/repositories/news.real.repo.server.ts:25-28, 33-49, 51-68` |
| Env server lette dal repo reale | `src/lib/repositories/news.real.repo.server.ts:52-53` — `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` |
| `getSources()` reale volutamente vuoto (nessuna query improvvisata) | `src/lib/repositories/news.real.repo.server.ts:203-209` |
| Consumo dal server function | `src/lib/portal.functions.ts:27-37` |
| Tipi generati che già contengono `v_attualita` | `src/integrations/supabase/types.ts:248` |
| Test che fissa il default mock | `src/lib/repositories/news.repo.test.ts:192-193` |
| Env attualmente generate (6, tutte del progetto gestito) | `.env` — `SUPABASE_URL/PUBLISHABLE_KEY/PROJECT_ID` + le tre `VITE_*` |
| Nessun remote GitHub, solo workflow temporaneo | `git remote -v`, `.github/workflows/tmp-smoke-generate-v1.yml` |

## 3. L'opzione A (sola variabile a `true`) è sufficiente?

**No.** Impostare `VITE_USE_REAL_REPO=true` oggi produce un risultato prevedibile e non utile:

1. Nessun GRANT su `public` → la `select` su `v_attualita` fallisce con permission denied, che `classifyReadError` mappa a `SCHEMA_UNAVAILABLE`.
2. Anche con i GRANT, `v_attualita` ha **0 righe** → `repoStatus: "EMPTY"`.

In entrambi i casi `/attualita` resta **senza contenuti** e mostra l'avviso diagnostico: per design non c'è fallback silenzioso ai dati demo. Nessun crash, nessuna perdita di dati, ma la pagina si svuota. Inoltre `getSources()` reale restituisce sempre `[]`, quindi in modalità reale la lista fonti sparisce comunque anche se le news arrivassero.

Nota secondaria: il flag è `VITE_*`, quindi inlinato a build time nel bundle client; è letto però da un modulo eseguito server-side. Funziona (Vite sostituisce `import.meta.env` anche nel bundle SSR), ma richiede rebuild per avere effetto — non è un interruttore a runtime.

## 4. Workaround più sicuro per attivare il repository reale senza rompere demo/prototipo

Ordine obbligato, ogni passo verificabile e reversibile:

1. **Prerequisiti database, prima del flag** (nessuna modifica al codice):
   - `GRANT USAGE ON SCHEMA public TO anon` + `GRANT SELECT ON public.v_attualita, public.v_biblioteca TO anon`, limitato alle sole viste pubbliche;
   - verifica che le viste espongano solo righe `PUBLISHED` e nessun campo interno;
   - popolare almeno una riga reale in `v_attualita`, altrimenti "reale" equivale a "vuoto".
   Finché questi tre punti non sono veri, il flag non va toccato.
2. **Sonda di sola lettura prima del cutover**: verificare la leggibilità come `anon` (conteggio righe visibili) senza attivare il flag, così l'esito è noto prima che l'utente lo veda.
3. **Attivazione per ambiente, non globale**: `VITE_USE_REAL_REPO=true` solo in preview, mantenendo il default assente altrove. Il flag resta un singolo punto di verità: rollback = rimuovere la variabile + rebuild, nessun codice da revertire.
4. **Non svuotare la pagina in caso di anomalia**: se si vuole che `/attualita` non resti mai vuota, la strada corretta **non** è il fallback silenzioso (vietato dal design attuale), ma una modalità dichiarata: contenuti demo mostrati con etichetta esplicita "dati dimostrativi" quando `repoStatus != "OK"`. È una modifica di UI/contratto da approvare a parte.
5. **`getSources()` reale**: da implementare su una vista fonti verificata, oppure lasciare esplicito che in modalità reale l'elenco fonti è assente. Oggi la seconda cosa avviene in silenzio.

**Sul repository GitHub reale**: non serve alcuna modifica di codice. Va collegato dal pannello (Plus (+) → GitHub → Connect project); il sync è bidirezionale. Il flag dati e il collegamento GitHub sono indipendenti.

## Cosa non è stato fatto

Nessun file modificato, nessuna env cambiata, nessun GRANT eseguito, nessun deploy, `VITE_USE_REAL_REPO` non attivato.

## Decisione richiesta

Se vuoi procedere: confermo per prima cosa i GRANT minimi e la sonda di lettura come `anon` (passi 1-2), **senza** attivare il flag.
