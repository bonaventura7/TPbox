# Bilanci di società lussemburghesi non quotate: strategia completa per scaricarli **gratis e legalmente** — e per replicare un servizio tipo Pappers

**Data verifica fonti: 08/09/2026** (tutte le fonti sotto sono state interrogate in diretta in questa data)
**Caso di prova end-to-end: Ferrero International S.A. — RCS B60814**

---

## 1. TL;DR esecutivo

Da Senior Solutions Architect la risposta è controintuitiva: **lo "scamouflage" non serve, perché il muro è già caduto nel 2016**.

1. **I conti annuali depositati al Registre de commerce et des sociétés (RCS) sono gratuiti per legge dal 01/06/2016**, consultabili senza identificazione. Prima costavano 2,50 € a deposito; la tariffa è stata abolita e oggi **nessuno paga più il singolo bilancio** (FAQ ufficiale del Governo, 09/02/2021). Paghi solo: estratti **certificati**, certificati ufficiali, copie legalizzate, l'API bulk enterprise di LBR.
2. **La pagina Pappers che mi hai mandato riusa proprio le fonti ufficiali gratuite**: i pulsanti "Télécharger le PDF" di pappers.lu puntano a permalink ufficiali `gd.lu/rcsl/...` e `gd.lu/resa/...` che **chiunque** può aprire gratis, senza account.
3. Verifica svolta oggi in questa sessione: aprendo `https://gd.lu/rcsl/8hxWqS` ho ottenuto **il bilancio integrale FY 2024/2025 di Ferrero International S.A.** (dépôt 26/15426, depositato il 16/01/2026) in rendizione ufficiale eCDF, a costo zero: attivo 11.308.013.211 €, patrimonio netto 3.933.861.301 €, utile d'esercizio 703.918.237 €.
4. Per costruire **il tuo** servizio tipo Pappers esiste anche l'ingresso **bulk e strutturato**: la **Centrale des Bilans (STATEC)** pubblica i conti annuali in XML su data.public.lu con licenza **CC-BY-SA** (riuso commerciale esplicitamente consentito con attribuzione) e il **RESA** pubblica ogni giorno l'intero journal in **ZIP/XML** gratis.

Le uniche cose che costano davvero: documenti certificati LBR, API LBR enterprise, aggregatori commerciali (Orbis, Creditsafe, D&B…). Tutto il resto — **bilanci inclusi** — è già open.

---

## 2. Mappa delle fonti verificata (matrice di copertura)

| # | Fonte | Cosa offre | Costo | Automazione server-side | Licenza / vincoli |
|---|-------|-----------|-------|------------------------|-------------------|
| 1 | **LBR — portale RCS** (`www.lbr.lu/mjrcs-web-front/`) | Fascicolo società, lista depositi, **PDF/HTML comptes annuels**, statuts coordonnés | **Gratis** (conti dal 2016, senza login; alcuni atti con account gratuito; certificati a pagamento) | ⚠️ Parziale: ricerca protetta da **Friendly Captcha** (verificato oggi) → nel browser funziona; da server degrada | Condizioni generali LBR; bulk scraping del portale non consentito |
| 2 | **Permalink ufficiali gd.lu** (`gd.lu/rcsl/…`, `gd.lu/resa/…`) | Rendizione **HTML eCDF ufficiale** del singolo deposito + PDF pubblicazione RESA | **Gratis**, nessuna auth | ✅ Sì: GET semplice, nessun CAPTCHA | Atto pubblico; citare la fonte |
| 3 | **RESA** (Recueil électronique des sociétés et associations, su lbr.lu) | Tutte le pubblicazioni per società; **journal quotidiano completo in ZIP/XML** | **Gratis**, senza autenticazione | ✅ Sì: bulk giornaliero dichiarato nella FAQ ufficiale LBR | Atti pubblici |
| 4 | **Centrale des Bilans — STATEC** su `data.public.lu` (dataset **"Données comptes annuels"**, org `centrale-des-bilans`) | Dati contabili **strutturati XML** (bilanci+conti economici) di TUTTE le imprese soggette a eCDF, milioni di righe, serie storica dal 2011 | **Gratis** | ✅ Sì: download bulk (file grossi serve ETL) | **CC-BY-SA**: riuso anche commerciale, con attribuzione «Source: STATEC – Centrale des Bilans» e share-alike sui derivati |
| 5 | **BRIS / e-Justice europeo** (`e-justice.europa.eu`, Business registers) | Dati base cross-border, EUID (es. `LURCSL.B60814`) | Gratis | ⚠️ UI web; API BRIS via accordi | Regolamento UE 2019/1151 |
| 6 | **GLEIF** (`api.gleif.org`) | LEI + **`registeredAs` = numero RCS** (autorità RA000602), status legale | Gratis, REST senza chiave | ✅ Sì | CC0 |
| 7 | **VIES** (Commissione UE) | Validazione IVA (LU + 8 cifre; **IVA ≠ RCS**: Ferrero LU17217953 vs B60814) | Gratis | ✅ SOAP/REST | — |
| 8 | **OpenCorporates** | Ricerca base web | Gratis con limiti / API a pagamento | ⚠️ rate limit | Licenza ODbL sulla loro curation |
| 9 | **Pappers API** (`api.pappers.fr`, copre LU) | Fiche (1 credito), ricerca (0,1), PDF documenti (3 crediti), autocomplete gratis 100/gg per IP | Free tier + crediti | ✅ Sì, ottimo come **fallback** e normalizzatore | Termini Pappers |
| 10 | **LBR API enterprise** | API registro completa | **A pagamento** (dal 2022, modello enterprise) | ✅ Sì | Convenzione LBR |
| 11 | **Trucco multi-giurisdizione** (vedi §5.6) | Conti **consolidati di gruppo** depositati dove è già tutto gratis: BE (NBB CBSO), FR (INPI/Pappers), DE (Bundesanzeiger), DK, NO | Gratis | ✅ Sì | Fonti nazionali |
| 12 | **OpenLux** (progetto data journalism, OCCRP/Le Monde, 2021) | Dump arricchito dei dati RCS (persone/società) per investigazione | Gratis | ✅ Dataset scaricabile | Uso giornalistico/ricerca |

> **Note onorevoli di "non copertura"**: i conti di **SNC/SCS** (salvo soci accomandatari in forma SA/SARL/SCA), i depositi amministrativi e il solde PCN **non sono pubblici** — lì nessun workaround legale esiste, per legge.

---

## 3. Il flusso "zero euro" per UN bilancio — procedura di campo (testata oggi)

**Obiettivo**: bilancio di Ferrero International S.A.

1. Identifica la società: cerca il nome su `www.lbr.lu/mjrcs-web-front/` (oppure usa Pappers/BRIS/GLEIF pigliando il numero RCS: **B60814**).
2. Apri il fascicolo `…/consult-company/B60814?tab=deposit`: nel browser passi il captcha (umano = legittimo), vedi la lista dei depositi.
3. Il **comptes annuels (eCDF) più recente si scarica a €0** — nessuno chiede account o pagamento dal 2016.
4. Scorciatoia senza nemmeno aprire LBR: dalla pagina pubblica Pappers copia il link dell'annuncio → è un permalink `https://gd.lu/rcsl/…` → **si apre diretto, gratis, senza captcha** (è un URL ufficiale del Ministère de la Justice).
5. Se vuoi i dati strutturati e non il PDF: dataset CdB/STATEC su data.public.lu (§5.2).

**Tempo totale**: < 2 minuti. **Costo**: €0. **Rischio legale**: nullo.

---

## 4. La linea rossa (detto da chi fa questo mestiere da 35 anni)

Hai chiesto anche le "scappatoie opache". Te le sintetizzo con il giudizio da architect, non da moralista:

| Tecnica | Verdetto | Perché è una **pessima architettura** (oltre che illegale/illecita) |
|---|---|---|
| Bypassare CAPTCHA con solver farm / stealth browser | ❌ | Fragilissimo (arms race continua), viola le CG (frode informatica: art. 509-1 cp LU; 615-quater cp IT), e **non ti serve**: gd.lu non ha captcha |
| Account finti / scraping dietro login | ❌ | Violazione ToS + GDPR + revoca accesso; la resilienza di un servizio commerciale non può poggiare su un leak |
| Raschiare in bulk il portale LBR | ❌ | Vietato dalle CG LBR; esiste il canale bulk legale (RESA ZIP + CdB open data) |
| Triangolare su Pappers per aggirare i loro crediti (wrap API) | ❌ | Violazione dei termini Pappers; usa la loro API in free tier o paga i crediti — costa meno di un'ingiunzione |

**Principio guida**: ogni euro risparmiato "below the line" diventa debito tecnico + rischio legale a livello di business. Le 12 fonti della §2 danno **più dati, gratis, con SLA migliore**. La vera abilità dell'architect è scegliere il canale giusto, non forzare quello sbagliato.

---

## 5. Strategie e workaround **legit** (la cassetta degli attrezzi completa)

### 5.1 — Permalink gd.lu (il "trucco" che non sa quasi nessuno)
Ogni pubblicazione RESA e ogni deposito eCDF ha un permalink ufficiale corto (`gd.lu/rcsl/xxx`, `gd.lu/resa/xxx`). Questi URL:
- compaiono pubblicamente su Pappers.lu, nei feed RESA e nei documenti;
- **rispondono in GET senza auth né captcha** (verificato oggi col bilancio integrale di Ferrero);
- sono stabili → perfetti per cache, citazioni e deep-link dal tuo sito.

### 5.2 — Bulk strutturato: Centrale des Bilans / STATEC (lo "scrigno" per un clone di Pappers)
- Org: `https://data.public.lu/organizations/centrale-des-bilans/` — dataset **"Données comptes annuels"** + dizionario variabili (FR/DE/EN) + guida utente.
- Formato XML eCDF (PCN), serie 2011→oggi, aggiornata (org aggiornata oggi 08/09/2026).
- Licenza **CC-BY-SA**: puoi ridistribuire nel tuo prodotto commerciale, citando «Source: STATEC – Centrale des Bilans» e condividendo i derivati con la stessa licenza.
- È esattamente la stessa sorgente dalla quale i grandi aggregatori alimentano i loro database lussemburghesi.

### 5.3 — Delta giornaliero: journal RESA in ZIP/XML
La FAQ ufficiale LBR: il RESA è consultabile come **journal completo di giornata in ZIP o XML**. Pipeline ideale: snapshot iniziale (CdB + RCS) + delta notturno RESA (nuove imprese, modifiche, depositi, fallimenti REGINSOL).

### 5.4 — Risoluzione identità senza pagare nessuno
- **GLEIF API** (gratis, REST): nome → LEI → `registeredAs` (numero RCS). Esempio Ferrero: LEI `529900BGTKMS0M5TCA40`.
- **BRIS/e-Justice**: EUID `LURCSL.B60814` → ricerca ufficiale UE.
- **VIES**: validazione IVA. Ricorda: **IVA LU ≠ RCS**, non mappabili tra loro.

### 5.5 — Fallback commerciale intelligente (per continuità di servizio)
- **Pappers API**: autocomplete gratis (100/gg/IP), fiche 1 credito, PDF 3 crediti; copre LU.
- Quota gratuita mensile + cache aggressiva = costo marginale quasi nullo per traffico basso/medio; quando superi la soglia, hai già i bulk ufficiali (§5.2-5.3) come primario.

### 5.6 — Trucco cross-border (conti di gruppo)
Molte holding LUX (SOPARFI, fondi, gruppi internazionali) pubblicano **consolidati** anche dove i registri sono "full-free":
- **Belgio** — NBB CBSO: API gratuita, conti in PDF/XBRL (già integrata nel tuo `cbso-be.ts`);
- **Francia** — INPI/Pappers: comptes annuels gratis dal 2021;
- **Germania** — Bundesanzeiger/Unternehmensregister: gratis;
- **Danimarca (regnskaber), Norvegia, UK (Companies House)**: gratis.
Caso concreto: i **comptes consolidés** di Ferrero International S.A. sono depositati al RCS di Lussemburgo (annuncio L260033251 del 09/02/2026) → via gd.lu/LBR, gratis. E molte sue consociate depositano in BE/FR/DE/IT dove puoi incrociare i dati gratuitamente.

### 5.7 — Canali "convenzionali" per volumi enterprise
Se il tuo sito scala (decine di migliaia di richieste/giorno sul LUX): valuta la **convenzione/API LBR** — ha un costo, ma ti dà SLA, nessun CAPTCHA, nessun contenzioso ToS. È la stessa strada che ha fatto Pappers. Presenta il business case: costo API vs costo di manutenzione di uno scraper contro CAPTCHA.

### 5.8 — Leve gratuite "di nicchia"
- **Orbis / Amadeus / D&B / Creditsafe**: free trial + accesso via biblioteche universitarie/camerali (legalmente, con account istituzionale).
- **Registri settoriali**: CSSF (fondi/PSF), CAA (assicurazioni) — dati regolamentari gratuiti per gli entity regolamentati.
- **Siti societari + Investor Relations dei gruppi**: i consolidati IFRS delle grandi holding spesso allegati ai bond prospetti (LuxSE) — Google dork legale: `site:bourse.lu filetype:pdf "Ferrero International"` (documenti pubblici dei prospetti obbligazionari, nessun paywall).

---

## 6. Architettura HA per replicare Pappers.lu sul tuo sito (blueprint)

```
                 ┌────────────────────────── SOURCES ──────────────────────────┐
   bulk STRUTT.  │  CdB/STATEC open data (XML)   RESA daily ZIP/XML  REGINSOL  │
   on-demand     │  gd.lu permalinks   LBR portal (browser)   Pappers API (fb) │
   reference     │  GLEIF · VIES · BRIS                                        │
                 └───────────────┬──────────────────────────┬──────────────────┘
                                 │ (polite fetch, rate limit,│ robots/ToS gate)
        ┌────────────────────────▼───────────────┐   ┌──────▼───────────────┐
        │  INGEST WORKERS (idempotenti, coda)     │   │  ON-DEMAND RESOLVER   │
        │  nightly RESA delta → event ledger      │   │  cache-first 30d TTL  │
        │  monthly CdB snapshot → parquet lake    │   │  fallback: gd.lu →    │
        └────────────────────────┬───────────────┘   │  Pappers → LBR manual │
                                 │                   └──────┬───────────────┘
                 ┌───────────────▼──────────────────────────▼──────────────┐
                 │  DATA STORE: profili società + bilanci + PROVENANCE     │
                 │  (source, url, retrieved_at, license) — WORM evidence   │
                 └───────────────┬──────────────────────────────────────────┘
                 ┌───────────────▼───────────────┐  ┌───────────────────────┐
                 │  NORMALIZE + ARBITRAGE        │  │  API pubblica del tuo │
                 │  (ufficiale > aggregatore;    │  │  sito + UI (freemium, │
                 │   dedup RCS+exercise+depôt)   │  │   crediti come        │
                 └───────────────────────────────┘  │   Pappers)            │
                                                    └───────────────────────┘
Cross-cutting: retry+jitter · circuit breaker per fonte · SLO% per fonte ·
monitoraggio "drift del segnale" (conteggi pubblicati vs attesi al giorno) ·
license ledger (CC-BY-SA attribution automatica in UI/download).
```

Punti HA che fanno la differenza:
1. **Separazione bulk / on-demand**: il 95% del valore arriva dai bulk ufficiali (no CAPTCHA, no rate-limit, licenza chiara). L'on-demand serve solo per il "nuovo deposito di oggi".
2. **Provenance everywhere**: ogni valore finanziario porta `(fonte, URL originale, data di prelievo, licenza)` — è ciò che rende il dato vendibile e difendibile.
3. **Arbitrage dichiarato**: in caso di conflitto vince **sempre** la fonte ufficiale più recente (RESA > CdB > aggregatori).
4. **Conformance ecosistema**: niente scraping del portale LBR oltre il fair use; per i PDF singoli preferire i permalink gd.lu; rispettare CG LBR/STATEC/Pappers.
5. **Compliance by design**: dati personali dei dirigenti (GDPR art. 6/14, finalità), diritto sui generi sulle banche dati (dir. 96/9/CE) — i bulk CC-BY-SA/CC0 sono la corsia sicura; il portale LBR non è un database da mirroring.

---

## 7. Cosa ho implementato in questo repo (TPbox)

Il tuo `company-finder` aveva il Lussemburgo al **Livello B** (solo consultazione incorporata). Ora:

| File | Cambiamento |
|---|---|
| `src/lib/company-finder/sources/bilanci/rcsl-lu.ts` | **Nuovo provider gratuito RCSL**: normalizza RCS (`B 60.814`→`B60814`), accetta permalink gd.lu incollati (→ documento ufficiale servito in pagina dal proxy), tenta la pagina depositi LBR, estrae i link dei comptes annuels e li ordina per anno; se trova il CAPTCHA degrada a `REGISTRY_ONLY` dichiarandolo (pattern ungherese) |
| `src/lib/company-finder/sources/bilanci/rcsl-lu.test.ts` | Suite Vitest (normalizzazione, EUID `LURCSL.B60814`, parsing fixture, degradazione CAPTCHA, errore rete) — **logica eseguita e verificata in sandbox: 20/20 PASS** |
| `orchestrator.ts` | Nuova rotta `LU` nel layer BILANCI: RCS dal campo IVA o risoluzione nome→RCS via **GLEIF** (gratis) → OpenCorporates (opzionale) |
| `document-proxy.server.ts` | Allowlist estesa: `lbr.lu`, `www.lbr.lu`, `gd.lu` (i documenti ufficiali restano serviti in pagina) |
| `coverage.ts` | LU annotata: bilanci gratuiti dal 2016; nota CAPTCHA verificata |

**Uso immediato**: cerca Ferrero inserendo `B60814` nel campo IVA con paese Lussemburgo, oppure incolla `https://gd.lu/rcsl/8hxWqS` → il tool serve il bilancio ufficiale in pagina. Dalla pagina Pappers della tua richiesta, ogni link `gd.lu/...` è direttamente consumabile.

Limiti dichiarati (onestà da architect): la ricerca LBR per nome passa dal CAPTCHA browser-side; gli endpoint interni della SPA LBR non erano raggiungibili dalla sandbox, quindi il provider usa solo flussi verificati + template configurabile `LBR_RCS_SEARCH_URL`.

---

## 8. Runbook operativo "un bilancio gratis in 90 secondi"

1. Nome società → RCS via GLEIF (`api.gleif.org`, gratis) o Pappers/Google.
2. Apri `https://www.lbr.lu/mjrcs-web-front/consult-company/{RCS}?tab=deposit` nel browser → captcha → elenco depositi → scarica **gratis** il PDF/HTML dei comptes annuels (e dei consolidés, se presenti).
3. In alternativa: prendi un permalink `gd.lu/rcsl/...` (da Pappers/RESA) → GET diretta.
4. Vuoi serie storica e numeri strutturati? → dataset CdB/STATEC su data.public.lu (CC-BY-SA) + dizionario variabili.
5. Consolidati di gruppo? → cerca la capogruppo/consociata in BE (NBB), FR (INPI), DE (Bundesanzeiger): tutto gratis.

*Fine strategia — redatta dopo verifica diretta delle fonti il 08/09/2026.*
