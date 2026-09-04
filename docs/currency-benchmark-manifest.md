# Currency-Adjusted Benchmark e dati di mercato — manifest

Versione motore: `currency-benchmark-engine.v1`
Versione dataset: `tp-market-data-2026-09-03.v1`
Rotte: `/tool/currency-benchmark`, `/tool/market-data`, `GET /api/market-data`

## Origine

Il lavoro trasferisce nel portale due componenti sviluppate fuori: uno strumento
HTML per la conversione di valuta di un benchmark e un backend Python che
interrogava BCE SDMX, FRED e Damodaran senza chiavi API, con snapshot
riproducibili e risoluzione a livelli.

Differenze deliberate rispetto all'originale:

- il registry dei modelli calibrati dell'originale conteneva nove coppie con
  coefficienti `a`/`b` marcati `DEMO_ONLY`. Non e' stato trasferito: al suo posto
  c'e' un metodo verificabile, il differenziale dei tassi di riferimento;
- il backend Python richiedeva un processo locale sulla macchina dell'utente. La
  stessa logica e' ora una rotta del server del portale;
- il file Damodaran (xlsx, aggiornato una volta l'anno) non viene letto a
  runtime: leggerlo richiederebbe una dipendenza nuova per un dato che cambia a
  gennaio. I valori dell'aggiornamento 2026-01-01 sono nel dataset versionato.

## Contratto dei dati

Ogni valore restituito da `/api/market-data` porta: `value`, `asOf`,
`requestedDate`, `unit`, `source`, `series`, `sourceUrl`, `cacheStatus`,
`retrievedAt`, `snapshotDate`. Un valore non risolto non viene sostituito da una
stima: diventa `status: "UNAVAILABLE"` con il campo `reason`.

Stati della cache:

| Stato | Significato |
|---|---|
| `LIVE` | scaricato dalla fonte alla data richiesta |
| `CACHED` | dal dataset congelato, con `asOf` non successivo alla data richiesta e entro 60 giorni da essa |
| `CACHED_STALE` | dal dataset congelato, oltre 60 giorni dalla data richiesta (400 per il country risk, che e' annuale) |
| `UNAVAILABLE` | non risolto, con motivo |

## Risoluzione a livelli

1. richiesta alle fonti per la data indicata (finestra di 420 giorni, budget
   complessivo 20 s, fino a 20 richieste contemporanee, un tentativo di
   ripetizione solo se resta tempo per completarlo). L'attesa dipende dalla
   fonte: 5 s per la BCE, 8 s per FRED, che passa da una CDN piu' lenta. I
   parametri stanno dentro il tetto di 30 s della funzione: con 41 serie, sei
   richieste in parallelo e nove secondi a testa la produzione rispondeva 504
   FUNCTION_INVOCATION_TIMEOUT, e con quattro secondi uguali per tutti nessuna
   serie FRED arrivava in tempo;
2. dataset congelato nel repository, dichiarato come tale;
3. voce `UNAVAILABLE` con il motivo.

Il livello 2 non si applica quando la data richiesta e' anteriore
all'osservazione congelata: un valore del 2026-09-03 non descrive il mercato di
gennaio. In quel caso il risultato e' `UNAVAILABLE` e serve la fonte.

L'interfaccia carica prima il dataset congelato (`live=0`, risposta immediata e
deterministica) e poi la versione con le fonti attive: gli stati passano da
«dataset» a «dal vivo» quando i dati arrivano.

## Semantica as-of

Le serie hanno frequenze diverse. Un'osservazione di periodo e' disponibile solo
a periodo chiuso: la media di agosto non esiste il 15 agosto. Il confronto
avviene sull'ultimo giorno del periodo, non sulla stringa — `2026-Q2` e'
lessicograficamente maggiore di `2026-09-03` ma temporalmente anteriore. Sono
riconosciuti i formati `YYYY-MM-DD`, `YYYY-MM`, `YYYY-Qn`, `YYYY-Sn`, `YYYY`.

## Fonti e stato di verifica

Verificate il 2026-09-03 dal backend di origine (risposta HTTP 200 con dati, e
valori presenti nello snapshot congelato):

| Serie | Fonte | Chiave |
|---|---|---|
| 12 cambi di riferimento EUR/x | BCE SDMX `EXR` | `D.{CCY}.EUR.SP00.A` |
| Euribor 3M/6M/12M mensili, 12M trimestrale | BCE SDMX `FM` | `M.U2.EUR.RT.MM.EURIBOR{3M,6M,1Y}D_.HSTA` |
| Tassi bancari IT e area euro, imprese oltre 1 mln, fixing fino a 3M | BCE SDMX `MIR` | `M.{IT,U2}.B.A2A.D.R.1.2240.EUR.N` |
| SOFR, SONIA | FRED | `SOFR`, `IUDSOIA` |
| Treasury 2Y/5Y/10Y | FRED | `DGS2`, `DGS5`, `DGS10` |
| Rendimenti corporate Aaa/Baa, OAS high yield e investment grade | FRED | `AAA`, `DBAA`, `BAMLHE00EHYIOAS`, `BAMLH0A0HYM2`, `BAMLC0A0CM` |
| Country risk Italia | Damodaran, NYU Stern | `ctryprem.xlsx`, aggiornamento 2026-01-01 |

**Non verificate in questa sessione** (rete non raggiungibile verso le fonti dal
contenitore di sviluppo): le chiavi aggiunte per estendere la copertura dei
tenor. Appartengono a famiglie note e sono marcate `verified: false` nel
registry, con l'etichetta «serie non verificata» in pagina:

| Serie | Fonte | Chiave | Nota |
|---|---|---|---|
| Curva dei rendimenti area euro, titoli AAA, spot 3M–10Y | BCE SDMX `YC` | `B.U2.EUR.4F.G_N_A.SV_C_YM.SR_{3M,6M,1Y,2Y,3Y,5Y,7Y,10Y}` | [DA VERIFICARE] chiave del dataflow YC |
| Treasury 3M, 6M, 1Y, 3Y, 7Y | FRED | `DGS3MO`, `DGS6MO`, `DGS1`, `DGS3`, `DGS7` | [DA VERIFICARE] famiglia DGS constant maturity |

Se una di queste chiavi fosse errata la metrica risulta `UNAVAILABLE` con il
motivo restituito dalla fonte, e il differenziale che la usa si blocca. Nessun
percorso produce un valore stimato. La verifica va fatta aprendo la rotta
`/api/market-data` in produzione e controllando lo stato di quelle serie.

## Metodo di conversione

Metodi disponibili:

- **Nessuna conversione** (`IDENTITY`), automatico quando le valute coincidono.
- **Differenziale dei tassi di riferimento** (`RATE_DIFFERENTIAL`):

  ```
  metrica_target = metrica_origine + (tasso_riferimento_target − tasso_riferimento_origine)
  ```

  Le due gambe devono essere omogenee, altrimenti il differenziale incorpora
  anche la differenza fra strumenti: si usano rendimenti di titoli di stato alla
  stessa scadenza su entrambi i lati (curva area euro AAA per l'euro, Treasury
  constant maturity per il dollaro), non un tasso interbancario contro un titolo
  di stato. Le due gambe possono avere date `asOf` diverse: quando succede la
  riga riporta l'avviso e la tabella mostra entrambe le date.

- **Aggiustamento manuale** (`MANUAL_ADJUSTMENT`): scostamento in basis point
  inserito dall'analista, sempre disponibile e sempre riportato nell'export.

Controlli sul tipo di metrica: il differenziale si applica a rendimento, coupon
e tasso di finanziamento. E' bloccato su spread creditizio e cross-currency
basis, dove il differenziale e' gia' incorporato nel tasso base della valuta e
sommarlo lo conterebbe due volte, e sulla metrica generica «Altro». In quei casi
resta l'aggiustamento manuale, da documentare separatamente.

Limiti dichiarati: il metodo cattura la differenza fra i livelli dei tassi, non
le differenze di rischio di credito, di liquidita', di regime fiscale, ne' il
cross-currency basis.

### Copertura del differenziale

| Valuta | Scadenze con tasso di riferimento |
|---|---|
| EUR | 3M, 6M, 1Y, 2Y, 3Y, 5Y, 7Y, 10Y |
| USD | 3M, 6M, 1Y, 2Y, 3Y, 5Y, 7Y, 10Y |
| altre | nessuna: nel registry non c'e' una curva governativa gratuita per tenor |

Le scadenze 9M, 4Y, 6Y, 8Y, 9Y non hanno serie su nessuna delle due valute. Una
combinazione non coperta blocca la riga dichiarando quale gamba manca; non c'e'
ripiego su una scadenza diversa. Ampliare la copertura significa aggiungere una
riga a `REFERENCE_RATES` e la metrica corrispondente nel registry.

## Cambi e cross rate

Le serie BCE sono tutte contro euro. `EUR/x` viene dalla serie diretta, `x/EUR`
dal reciproco, `A/B` fra due valute terze dal rapporto `EUR/B ÷ EUR/A`. Il
metodo usato e le gambe sono dichiarati nel risultato, e uno scarto di data fra
le due gambe viene segnalato.

Il cambio non entra nella conversione della metrica: serve a riesprimere il
notional, ed e' mostrato come informazione di contesto.

## Statistica

Percentili con interpolazione lineare (minimo, Q1, mediana, Q3, massimo), la
convenzione usata nei benchmark di transfer pricing. Il range della valuta di
destinazione e' calcolato solo sulle righe convertite: le righe bloccate o in
errore non entrano, e il loro numero e' sempre visibile.

## Fuori perimetro

La sezione «Cross-Currency Swap Pricer» dello strumento di origine resta non
implementata: cash flow, fair fixed rate, NPV e DV01 richiedono curve di sconto e
di proiezione, non solo tassi spot. Il contratto degli snapshot (hash, `asOf`,
provenienza) e' la base per quel lavoro, se verra' fatto.

## Cache

`/api/market-data` risponde con `public, max-age=60, s-maxage=900,
stale-while-revalidate=86400`. I cambi di riferimento BCE cambiano una volta al
giorno: ricalcolare a ogni visita costerebbe tempo senza dare un dato piu'
recente.

## Test

- `test/market-data-as-of.test.ts` — chiusura dei periodi, confronto trimestre
  contro data, disponibilita' delle medie mensili, lettura dei CSV BCE e FRED,
  errore su struttura inattesa.
- `test/market-data-registry.test.ts` — unicita' degli identificativi, url delle
  fonti, coerenza fra registry e dataset congelato, simmetria della copertura
  EUR/USD, impronta del dataset (blocca modifiche non versionate ai valori),
  cambi diretti, reciproci e cross.
- `test/market-data-resolve.test.ts` — risoluzione dal dataset, rifiuto di
  un'osservazione successiva alla data richiesta, `CACHED_STALE`, serie assenti,
  country risk, finestra richiesta alle fonti, validazione dell'endpoint.
- `test/currency-benchmark-engine.test.ts` — lettura dei numeri incollati,
  conversioni, blocchi sui tipi di metrica, percentili, export CSV, costruzione
  del differenziale.

Tutti girano senza rete: il dataset congelato rende i test deterministici.

## Avvertenza

Lo strumento ha finalita' tecnico-funzionali e di supporto all'analisi: non
costituisce consulenza legale o fiscale e non garantisce l'esito di una verifica.
La scelta del metodo di conversione, la sua documentazione e la verifica dei dati
alla fonte restano in capo al professionista.
