# Stato binding Supabase e percorso UI corretto (solo verifica, nessuna modifica)

## Stato attuale accertato

- Progetto backend collegato: **`ajrcfcxwslbbrallgnsy`** (`https://ajrcfcxwslbbrallgnsy.supabase.co`), **Managed by Lovable: true** → è un backend **Lovable Cloud gestito**, non un progetto Supabase esterno collegato tramite integrazione.
- Variabili attualmente generate in `.env` (file auto-generato dalla piattaforma, sei variabili, tutte riferite ad `ajrcfcxwslbbrallgnsy`):
  `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
- `VITE_USE_REAL_REPO`: **assente** → Attualità resta in modalità demo/mock. Non toccato.
- Nessuna modifica eseguita: nessun disconnect, nessun deploy, nessun cambio env, nessun cambio DB.

## Cosa è gestibile da UI e cosa no

| Elemento | Gestibile dall'utente | Dove |
|---|---|---|
| Secret runtime applicativi (chiavi API proprie) | Sì | Project Settings → Secrets, oppure vista Cloud → Secrets |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PROJECT_ID` e le tre `VITE_*` | **No** | Sono a prefisso riservato: derivate dal binding, rigenerate dalla piattaforma. Non editabili né da UI né da codice |
| Progetto backend collegato (il binding stesso) | Solo tramite il flusso connettori | Sidebar → **Connectors** → Lovable Cloud / Supabase |
| Riparazione del binding esistente (senza cambiarlo) | Sì, lato agente | operazione di rebind dei secret gestiti (non cambia progetto) |

## Flussi disponibili nel progetto oggi

1. **Rebind non distruttivo dei secret** del binding attuale: rigenera/riallinea `SUPABASE_*` per lo stesso progetto `ajrcfcxwslbbrallgnsy`. Utile solo se le env risultano mancanti o non valide. **Non** permette di puntare a un altro project ref.
2. **Cambio di backend verso un progetto Supabase esterno** (`igtthymjeujkgfpmgoqj`): richiede che il progetto **non** sia su backend Lovable Cloud gestito. Qui lo è. Il passaggio da Cloud gestito a Supabase esterno passa necessariamente dal flusso Connectors e comporta la disconnessione di Cloud, che è **irreversibile e distruttiva** (elimina database, storage e functions del backend gestito). Nessun percorso non distruttivo per riassegnare il binding esiste in questa configurazione.
3. **Alternativa non distruttiva** se serve leggere il DB canonico senza toccare il binding: consumare `igtthymjeujkgfpmgoqj` come **origine dati esterna** attraverso variabili applicative dedicate (nomi non riservati, es. `VITE_TPBOX_SUPABASE_URL` + publishable key, e lato server la sua service key nei Secrets), lasciando intatto il client generato e il backend gestito. Questa è una modifica di codice, quindi fuori dal perimetro "solo verifica" e da approvare separatamente.

## Percorso UI corretto da seguire (lato utente)

- Ispezione backend attuale: **Cloud** (nav progetto → Cloud) → Overview / Database / Users / Secrets.
- Secret applicativi: **Project Settings → Secrets**.
- Gestione binding/connettori: **sidebar root → Connectors → Lovable Cloud**.
- Attenzione: in Connectors, "Disable Cloud" agisce sui progetti futuri; la rimozione di Cloud da **questo** progetto (Cloud → Advanced → Disconnect) è irreversibile e cancella i dati del backend gestito.

## Conclusione operativa

Non esiste oggi un modo non distruttivo, dentro questo progetto, per spostare il binding gestito su `igtthymjeujkgfpmgoqj`. Le due strade reali sono: (a) accettare la disconnessione irreversibile di Lovable Cloud e collegare il progetto esterno via Connectors; (b) tenere il binding gestito e accedere al progetto canonico come origine dati esterna con variabili non riservate. Nessuna delle due è stata avviata.

## Decisione richiesta

Confermare se procedere con (a), con (b), o restare fermi allo stato attuale.
