# Grecia (EL) — Anagrafica Γ.Ε.ΜΗ. via OpenData API

## Cosa fa il tool ora

Per la **Grecia** il Company Finder usa la fonte ufficiale gratuita
`opendata.businessportal.gr` per l'**anagrafica** delle imprese (la "μερίδα"
ΓΕΜΗ, l'equivalente del Registro Imprese):

- ricerca per **denominazione** (minimo 3 caratteri), **ΑΦΜ** (9 cifre) o
  **Αρ. Γ.Ε.ΜΗ.** (10 cifre);
- scheda completa: denominazione (EL/EN), ΑΦΜ, forma giuridica, stato, sede,
  capitale, attività (ΚΑΔ) e persone (rappresentanti/amministratori).

I **bilanci** (Οικονομικές Καταστάσεις) **non** passano da questo API: restano
sul portale `publicity.businessportal.gr`, protetto da reCAPTCHA, e la
consultazione/documento continua ad avvenire nel browser dell'utente tramite la
pagina ufficiale (livello "consultazione", nessun aggiramento del controllo).

## Autenticazione — il modulo di registrazione

L'API richiede un `api_key` **gratuito**, rilasciato dalla Κ.Υ. ΓΕΜΗ (KEEE)
dopo la compilazione del modulo online su <https://opendata.businessportal.gr/register/>.

Il modulo chiede essenzialmente **Nome**, **Email** e **Scopo d'uso**. Non è
possibile compilarlo per conto dell'utente (richiede l'identità e l'email reali
del richiedente e l'accesso Google al form); di seguito il testo pronto da
incollare nel campo **Scopo d'uso**, nelle tre lingue.

### Scopo d'uso — testo pronto

**Italiano**

> Consultazione e visualizzazione dei dati anagrafici pubblici del registro
> Γ.Ε.ΜΗ. (denominazione, ΑΦΜ, forma giuridica, stato, sede, capitale,
> attività) all'interno di un portale editoriale professionale di analisi
> fiscale sui prezzi di trasferimento, per la due diligence e il benchmarking
> di società greche. I dati sono mostrati all'utente finale così come
> pubblicati dal Γ.Ε.ΜΗ.; nessuna ridistribuzione massiva, nessuna rivendita.

**English**

> Display of public GEMI registry company data (company name, VAT/AFM, legal
> form, status, address, share capital, activities) inside a professional
> tax-analysis web portal focused on transfer pricing, for due diligence and
> benchmarking of Greek companies. Data is shown to end users as published by
> GEMI; no bulk redistribution and no resale.

**Ελληνικά**

> Προβολή δημόσιων στοιχείων επιχειρήσεων του Γ.Ε.ΜΗ. (επωνυμία, ΑΦΜ, νομική
> μορφή, κατάσταση, διεύθυνση, κεφάλαιο, δραστηριότητες) σε επαγγελματική
> διαδικτυακή πύλη φορολογικής ανάλυσης για τις ενδοομιλικές συναλλαγές, για
> σκοπούς εταιρικού ελέγχου και συγκριτικής αξιολόγησης ελληνικών
> επιχειρήσεων. Τα δεδομένα προβάλλονται όπως δημοσιεύονται από το Γ.Ε.ΜΗ.·
> καμία μαζική αναδιανομή και καμία μεταπώληση.

### Dopo l'approvazione

1. L'approvazione arriva in **1–3 giorni lavorativi**; la chiave viene inviata
   via email.
2. Valorizzare in `.env`: `GEMI_API_KEY=<chiave>`.
3. Senza chiave il tool **non inventa dati**: la fonte GEMI viene dichiarata
   "saltata" con una nota esplicita, e per il numero ΓΕΜΗ resta il fallback
   alla pagina ufficiale nel browser.

## Riferimenti tecnici

- Registrazione: <https://opendata.businessportal.gr/register/>
- Documentazione tecnica: <https://opendata.businessportal.gr/techdocs/>
- Swagger UI: <https://opendata-api.businessportal.gr/opendata/docs/>
- Chiave di prova (solo ambiente di documentazione, limitata per IP):
  `api-docs-key`
- Base URL: `https://opendata-api.businessportal.gr/api/opendata/v1`
  - `GET /companies` — ricerca per `name`, `afm` (9 cifre), `arGemi`
  - `GET /companies/{arGemi}` — scheda completa
  - Autenticazione: header HTTP `api_key`

## File coinvolti

- `src/lib/company-finder/sources/gemi-opendata.ts` — client, normalizzazione e
  mappatura della scheda.
- `src/lib/company-finder/orchestrator.ts` — route `gemi-opendata` per GR e
  esclusione del numero ΓΕΜΗ (10 cifre) dal VIES.
- `src/lib/company-finder.functions.ts` — fallback al browser solo quando la
  chiave non è configurata.
- `src/lib/company-finder/countries.ts` — nota paese aggiornata.
- `.env.example` — voce `GEMI_API_KEY`.
- `test/company-finder-gr-gemi.test.ts` — test di normalizzazione, mappatura e
  integrazione.
