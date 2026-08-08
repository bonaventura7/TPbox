# FASE 0 — Riallineamento controllato TPBox / Lovable (solo piano)

## Stato verificato ora (sole letture)

- Questo progetto Lovable è **Lovable Cloud–managed**: il backend collegato è il progetto
  Supabase gestito dalla piattaforma con ref `ajrcfcxwslbbrallgnsy`.
- `.env` (auto-generato, non editabile) contiene `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, tutti puntati a
  `ajrcfcxwslbbrallgnsy`. Nessuna occorrenza di `igtthymjeujkgfpmgoqj` nel repository.
- `supabase/config.toml` (auto-generato) riporta `project_id = "ajrcfcxwslbbrallgnsy"`.
- Lo schema `public` del database attuale è vuoto: zero tabelle, zero viste.
- Il codice non hardcoda mai un ref: legge solo variabili d'ambiente.
  - Client: `src/integrations/supabase/client.ts` → `import.meta.env.VITE_SUPABASE_URL`
    + `VITE_SUPABASE_PUBLISHABLE_KEY` (fallback SSR su `SUPABASE_URL` /
    `SUPABASE_PUBLISHABLE_KEY`).
  - Server: `src/integrations/supabase/client.server.ts` → `SUPABASE_URL` +
    `SUPABASE_SERVICE_ROLE_KEY`; `auth-middleware.ts` → `SUPABASE_URL` +
    `SUPABASE_PUBLISHABLE_KEY`.
  - Unico altro consumatore: `src/lib/mcp/index.ts` costruisce l'issuer OAuth da
    `VITE_SUPABASE_PROJECT_ID` — segue automaticamente il ref configurato.

## Il vincolo che decide tutto

Il prefisso `SUPABASE_*` è **riservato alla piattaforma**. Non posso scriverlo né
sovrascriverlo dagli strumenti di progetto: non è possibile "reindirizzare" questo progetto
verso `igtthymjeujkgfpmgoqj` scrivendo secret o modificando `.env` / `supabase/config.toml`
(entrambi auto-generati e rigenerati). Inoltre, su un progetto già Cloud–managed il backend
gestito non è rimovibile lato agente.

Quindi il riallineamento al progetto canonico **è un'azione di configurazione che deve
partire da te**, non un cambio di codice. Il lato positivo: il codice non richiede alcuna
modifica, perché è già interamente env-driven.

## Piano operativo

### Passo 1 — Collegamento del progetto Supabase canonico (azione tua, in interfaccia)
Nelle impostazioni del progetto Lovable, collega il progetto Supabase esistente
`igtthymjeujkgfpmgoqj` tramite l'integrazione Supabase (autorizzazione dell'account che
possiede quel progetto). Nessun nuovo progetto, nessun nuovo database.

Se l'interfaccia non consente il collegamento perché il progetto è già Cloud–managed, la
scelta è tra due sole strade, entrambe tue:
- **A** — aprire una richiesta al supporto Lovable per rebindare questo progetto al ref
  `igtthymjeujkgfpmgoqj` (percorso preferito: preserva repo, cronologia e URL pubblici);
- **B** — creare un nuovo progetto Lovable collegato da subito a `igtthymjeujkgfpmgoqj` e
  importarvi questo repository (nessun tocco al database canonico).

Non procedo su nessuna delle due senza tua indicazione esplicita.

### Passo 2 — Verifica del binding (io, solo letture)
Appena il collegamento è attivo eseguo, senza modificare nulla:
1. lettura di `.env` e `supabase/config.toml` per confermare che `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PROJECT_ID` e `project_id` riportino `igtthymjeujkgfpmgoqj`;
2. controllo che il bundle client servito inlini l'URL `igtthymjeujkgfpmgoqj.supabase.co`
   e nessun altro ref (grep sugli asset del build);
3. query di sola lettura sul database collegato per confermare che vede lo schema reale
   TP Box (elenco tabelle/viste non vuoto), quindi che non è più il database vuoto;
4. verifica lato server che `SUPABASE_URL` risolva allo stesso ref, tramite una server
   function di diagnostica temporanea **solo se la autorizzi**; altrimenti mi fermo alle
   verifiche 1–3, che sono già sufficienti a dimostrare il puntamento del client;
5. controllo che l'issuer OAuth MCP (`https://igtthymjeujkgfpmgoqj.supabase.co/auth/v1`)
   sia coerente e che l'accesso da `/auth` funzioni contro il progetto canonico.

Criterio di accettazione: nessuna occorrenza residua di `ajrcfcxwslbbrallgnsy` in `.env`,
`supabase/config.toml` e negli asset del build; schema non vuoto letto dal database
collegato.

### Passo 3 — Nessun cambio di codice necessario
Confermato dalla lettura: nessun ref hardcodato, nessun secret nel frontend. Dopo il
rebinding il codice funziona invariato. Se dopo il collegamento emergessero disallineamenti
di schema rispetto a ciò che il frontend si aspetta (per esempio `v_attualita`), li riporto
come diagnosi, senza scrivere migrazioni.

## Perimetro rispettato

- Nessun nuovo progetto o database.
- Nessuna migrazione, nessun cambio di schema, nessun GRANT, nessuna RLS.
- Nessun deploy di Edge Function, nessuna pubblicazione, nessun autopublish.
- Nessun secret hardcodato, nessuna lettura o esposizione di service-role.
- Nessuna modifica a codice, branch o configurazioni in questa fase.

## Cosa mi serve da te

1. Conferma quale strada segui al Passo 1: collegamento diretto, **A** (supporto) o **B**
   (nuovo progetto Lovable collegato al ref canonico).
2. Autorizzi il Passo 2 come sola verifica in lettura appena il binding è attivo?
