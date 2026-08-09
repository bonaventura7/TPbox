# Blank screen preview: client Supabase senza env — diagnosi e correzione minima

## Causa precisa

1. **Dove nasce il client**: `src/integrations/supabase/client.ts` (auto-generato) esporta `supabase` come `Proxy` lazy. Alla **prima property access** chiama `createSupabaseClient()`, che **lancia** `Error: Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY` se le env mancano.
2. **Come legge le env**: `import.meta.env['VITE_SUPABASE_URL'] || process.env['SUPABASE_URL']` (idem per la publishable key). In browser i valori `VITE_*` devono essere inlined a build time; se il build non li riceve, il fallback `process.env` non esiste lato client e la funzione lancia.
3. **Configurazione esistente**: `.env` in repo contiene già `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID` e le tre varianti `VITE_*` (auto-gestite da Lovable Cloud, non modificabili a mano). Non esiste `.env.example`. `supabase/config.toml` è auto-generato.
4. **Import che innesca l'errore a runtime**: `src/components/site/AuthMenu.tsx` importa `supabase` e nel primo `useEffect` chiama `supabase.auth.getSession()`. `AuthMenu` è dentro `SiteHeader`, montato in `__root.tsx` → **ogni pagina**. Il throw avviene durante l'effetto di hydration, senza error boundary utile → schermata bianca. Altri consumer (`routes/auth.tsx`, `routes/.lovable.oauth.consent.tsx`) sono pagine isolate, non globali.

Quindi il blank screen globale è causato **solo** dal punto d'ingresso globale (`AuthMenu`), non dal resto dell'app: tutte le route sono altrimenti autonome dal client Supabase.

## Obiettivo della correzione

- URL + publishable key restano config frontend legittima (nessun secret).
- Nessun hardcode di URL/chiave, nessun uso di service-role nel bundle.
- Nessun fallback silenzioso: se la config manca, l'app resta usabile ma segnala esplicitamente lo stato di configurazione mancante.

## Correzione minima proposta (additiva, reversibile)

1. **Nuovo `src/integrations/supabase/config.ts`** (client-safe, non auto-generato):
   - `supabaseClientConfigured(): boolean` → true solo se `import.meta.env.VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` sono stringhe non vuote.
   - Nessun accesso a `process.env` lato client, nessun valore letterale di fallback.
2. **`src/components/site/AuthMenu.tsx`**: prima di toccare `supabase`, verifica `supabaseClientConfigured()`.
   - Se non configurato: nessuna chiamata al client (quindi nessun throw), rendering di un affordance inerte — link "Accedi" verso `/auth` più `title`/`aria-label` che indicano "accesso non disponibile: configurazione backend mancante". Log `console.error` una sola volta con messaggio diagnostico chiaro.
   - Se configurato: comportamento attuale, invariato.
   - In più: `getSession()` e `signOut()` avvolti in try/catch che imposta uno stato d'errore visibile nell'header invece di propagare.
3. **`src/routes/auth.tsx`**: se non configurato, mostra un messaggio esplicito ("Accesso temporaneamente non disponibile: configurazione backend assente") al posto del form, invece di lanciare. Nessun cambio di design oltre al blocco di stato.

Non si tocca `client.ts` (auto-generato), non si tocca `.env`, `supabase/config.toml`, il database, né il deployment.

## File coinvolti

| File | Azione |
|---|---|
| `src/integrations/supabase/config.ts` | nuovo, guard di configurazione |
| `src/components/site/AuthMenu.tsx` | guard + try/catch, nessun throw globale |
| `src/routes/auth.tsx` | stato "configurazione assente" al posto del form |
| `src/integrations/supabase/config.test.ts` | nuovo, test unitari sul guard |

## Test di verifica

1. `npm run typecheck` pulito.
2. `npm run test`: suite esistente verde + nuovi test sul guard (env presenti → true; assenti/stringa vuota → false).
3. `npm run build` completato; verifica che negli asset generati l'URL e la publishable key risultino inlined (e che **nessuna** service-role key compaia nel bundle: grep su `SERVICE_ROLE` e `sb_secret_` → zero risultati).
4. Smoke HTTP: `GET /`, `/attualita`, `/tool`, `/auth` → 200.
5. Verifica in browser di `/`: header renderizzato, zero errori in console.
6. Prova negativa: build con `VITE_SUPABASE_*` assenti → `/` renderizza comunque (nessuna schermata bianca) e mostra lo stato "accesso non disponibile" con errore diagnostico in console.

## Nota sul binding

Se in preview le `VITE_*` risultano assenti a runtime nonostante il `.env`, la causa a monte è il binding Supabase di Lovable Cloud: si risolve con un rebind dei secret gestiti + rebuild (operazione separata, senza modifiche al codice). Il guard qui proposto evita che quel caso produca uno schermo bianco.
