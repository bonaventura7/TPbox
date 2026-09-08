# Belgio — chiave NBB-CBSO: guida operativa

Stato della catena Belgio dopo la fix del settembre 2026: il codice è pronto
end-to-end, manca solo la chiave. La chiave la crea una persona in pochi
minuti: il portale NBB richiede una casella email (link di attivazione) e
l'approvazione della sottoscrizione, due passaggi non delegabili a un agente.

## 1. Cosa è già pronto nel codice

Due strati, in degradazione elegante:

- **Senza chiave** — `fetchBePappers`
  (`sources/bilanci/pappers-public-be.server.ts`, stessa strategia
  dell'adapter FR): un solo fetch della scheda pubblica gratuita Pappers.be
  (fonti dichiarate: BCE/KBO, conti BNB, Moniteur belge) per anagrafica,
  valori per esercizio (ricavi esatti, utile netto, patrimonio…) ed elenco
  dei conti depositati. Se il markup espone ancore PDF dirette, sono servite
  in pagina via proxy interno; altrimenti i depositi risultano
  `DOCUMENT_FOUND` (riferimento noto, nessun link inventato). Fallback via
  reader pubblico in caso di 403, come per la FR.
- **Con chiave** — `fetchCbsoAccounts` (`sources/bilanci/cbso-be.ts`):
  risolve i riferimenti di deposito dal CBE e costruisce l'URL del PDF
  ufficiale già proxato, con `accept=application/pdf` (il gateway CBSO
  sceglie la rappresentazione solo dall'header `Accept`). L'orchestratore
  (`attachOfficialDocument`) allega il PDF NBB ai valori Pappers.be, così
  con la chiave si vedono entrambi.
- `handleDocumentRequest` (`document-proxy.server.ts`): inietta
  `NBB-CBSO-Subscription-Key` + `X-Request-Id` su ogni chiamata agli host
  `ws.cbso.nbb.be` / `ws.uat2.cbso.nbb.be`. La chiave non transita mai
  nell'URL né nella risposta al browser. Senza chiave risponde 503 con
  messaggio azionabile invece di un 401 criptico.
- Route `/api/company-finder/document`: il branch `?url=` serve di nuovo i
  documenti ufficiali avvolti da `prioritizeBalanceDocument()` (ripara in un
  colpo solo BE, UK, DK e GR, che condividevano lo stesso bug).
- Test: `test/company-finder-be-cbso.test.ts` (10 casi, nessun accesso rete).

Senza chiave il Belgio resta in degrado elegante: nota esplicita + scheda
ufficiale NBB incorporata (`consult-enterprise/<CBE>`). Mai dati inventati.

## 2. Opzione A — produzione, dati reali (consigliata)

1. Compila l'order form NBB (il prodotto "Authentic Data Query" è gratuito):
   <https://www.nbb.be/en/central-balance-sheet-office/consultation/web-services/order-form-cbso-webservices>
   Riceverai un `CLIENT_ID`.
2. Registrati su <https://developer.cbso.nbb.be> ("Sign up") e attiva
   l'account dal link ricevuto via email.
3. Nel portal: "Products" → **Authentic Data Query** → "Subscribe".
4. Ad approvazione avvenuta (email di conferma): "User profile" → "Show" →
   copia la **chiave primaria**.
5. Su Vercel (progetto TPBox → Settings → Environment Variables):
   `NBB_CBSO_API_KEY=<chiave primaria>` su Production (e Preview, se vuoi
   provarla prima). `NBB_CBSO_BASE` resta vuota (= produzione).
6. Redeploy.

## 3. Opzione B — ambiente di test UAT2 (zero burocrazia)

1. Registrati su <https://developer.uat2.cbso.nbb.be> (nessun order form).
2. Sottoscrivi **Authentic Data Query**, attendi l'approvazione, copia la
   chiave primaria.
3. Su Vercel: `NBB_CBSO_API_KEY=<chiave>` e
   `NBB_CBSO_BASE=https://ws.uat2.cbso.nbb.be`.
4. Limite noto: dati di test, non l'archivio reale. CBE di esempio dalla
   documentazione NBB: `0403101811`.

## 4. Verifica end-to-end (produzione)

Caso di riferimento: **BEAULIEU International Group**, Waregem.

- Campo partita IVA: `BE0442824497` (oppure seleziona Belgio e scrivi il
  CBE `0442824497`).
- Atteso **senza chiave**: scheda società + valori per esercizio (CA 2025
  ~34,37 M€, utile netto, fondi propri) + elenco dei conti depositati.
- Atteso **con chiave**: tutto quanto sopra + "Conti annuali pubblicati
  (CBE 0442824497) — riferimento 20XX-XXXXXXXX", PDF ufficiale NBB in
  anteprima e scaricabile.

## 5. Diagnostica rapida

| Sintomo | Causa | Azione |
|---|---|---|
| `serve la chiave gratuita NBB-CBSO…` (skipped) | `NBB_CBSO_API_KEY` vuota | Opzione A/B, poi redeploy |
| `chiave non valida o non abilitata…` | chiave errata o prodotto non sottoscritto | verifica "Show" e la sottoscrizione ad Authentic Data Query |
| `nessun conto annuale pubblicato per questo CBE` | CBE senza depositi (o test-env con CBE reale) | prova un CBE con depositi; su UAT2 usa `0403101811` |
| 503 `…non configurati…` sul documento | chiave presente in ricerca ma assente nel runtime del proxy | stessa variabile su tutti gli ambienti + redeploy |
| `Pappers.be: nessuna scheda trovata per questo CBE` | CBE inesistente o pagina irraggiungibile (dopo i tentativi + reader) | verifica il CBE; riprova più tardi |
| Valori presenti ma `DOCUMENT_FOUND` senza anteprima | i pulsanti PDF di Pappers.be sono guidati da JS e il markup non espone ancore dirette | comportamento atteso: anteprima via chiave NBB, oppure download dalla pagina ufficiale |
| Timeout CBSO | gateway lento | riprova; il proxy ha timeout 45 s e retry |

## 6. Nota di deployment (facoltativa)

Le chiamate NBB partono dal server. Se la function gira in una regione USA e
riscontri blocchi o latenze anomale verso i registri UE, fissa la regione
Vercel su Bruxelles (`"regions": ["bru1"]` in `vercel.json`): il portale ha
utenza UE e tutte le fonti sono europee.
