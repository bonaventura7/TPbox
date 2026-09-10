# Francia (FR) — Anagrafica INSEE via API Sirene (open data)

## Cosa fa il tool ora

Per la **Francia** il Company Finder consulta, tra le fonti, il **répertoire
Sirene** ufficiale dell'INSEE (SIREN/SIRET, dal 1973), gratuito in _Licence
Ouverte 2.0_ ma con autenticazione via chiave di integrazione:

- ricerca per **SIREN** (9 cifre, derivato anche dalla partita IVA francese) o
  **SIRET** (14 cifre), più ricerca per **denominazione** (best-effort);
- scheda anagrafica canonica: denominazione, forma giuridica, NAF (attività),
  stato amministrativo, data di costituzione, sede (indirizzo dall'établissement
  siège), identificativi SIREN/SIRET.

I **bilanci** non sono in Sirene: per la Francia restano attive le fonti
esistenti (Recherche d'entreprises — dati INPI/DGFiP senza chiave; Pappers con
chiave; INPI). Questa fonte è **aggiuntiva** e riguarda solo l'anagrafica.

## Autenticazione — ottenere la chiave (gratuita)

Il vecchio portale `api.insee.fr` (OAuth Consumer Key/Secret) è **chiuso dal
10/09/2025**. Sul nuovo portale la chiave è **statica**, senza scadenza, e va
passata nell'header HTTP `X-INSEE-Api-Key-Integration` (il client lo fa da sé).

Procedura (dal PDF ufficiale _Insee_API_publique_modalites_connexion.pdf_ su
sirene.fr):

1. Aprire <https://portail-api.insee.fr/> e cliccare **Se connecter** →
   **CONNEXION-POUR-LES-EXTERNES** → **Enregistrement**.
2. Compilare il modulo e confermare l'email (arriva un messaggio da
   `portail-api@insee.fr`).
3. Entrare in **Tableau de bord** → **Créer ma première application**
   (modalità **simple**: nome e descrizione obbligatori).
4. Andare su **Catalogue → API Sirene** → **Souscrire** → piano **Public**
   (l'unico disponibile) → selezionare l'applicazione creata.
5. In **Mes applications → <app> → Clefs et jetons d'accès**, generare la
   chiave e copiarla.
6. Valorizzare in `.env`: `INSEE_API_KEY=<chiave>`.

La registrazione richiede l'identità e l'email reali del richiedente (con
conferma via email), quindi **non è compilabile per conto dell'utente**.

## Riferimenti tecnici

- Catalogo / portale: <https://portail-api.insee.fr/catalog/all>
- Base URL: `https://api.insee.fr/api-sirene/3.11`
  - `GET /siren/{siren}` — unité légale completa
  - `GET /siret/{siret}` — établissement (indirizzo, stato, NAF)
  - `GET /siren?q=...` / `GET /siret?q=...` — ricerca multicriteri
- Autenticazione: header HTTP `X-INSEE-Api-Key-Integration`
- Limite: 30 richieste/minuto per gli usi open data
- Scheda su data.gouv.fr: <https://www.data.gouv.fr/dataservices/api-sirene-open-data>
- PDF ufficiale di connessione:
  <https://www.sirene.fr/static-resources/documentation/Insee_API_publique_modalites_connexion.pdf>

## File coinvolti

- `src/lib/company-finder/sources/insee-sirene.ts` — client, normalizzazione e
  mappatura della scheda.
- `src/lib/company-finder/orchestrator.ts` — route `insee-sirene` per FR
  (in parallelo a Recherche d'entreprises e INPI).
- `.env.example` — voce `INSEE_API_KEY`.
- `test/company-finder-fr-insee.test.ts` — test di normalizzazione, mappatura e
  integrazione.
