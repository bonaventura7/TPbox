# Amount B – Regole risolte e questioni ancora aperte

Registro delle ambiguità rilevate in fase di discovery, con l'esito della verifica
condotta sul workbook OCSE (February 2026) durante l'implementazione del motore.

Stato al 6 agosto 2026.

## Risolte sul workbook

### 1. Media dei saldi patrimoniali

La discovery non aveva rilevato che le voci patrimoniali non entrano nel calcolo come
saldo puntuale. Le righe 21, 30, 31 e 39 del foglio "3 Automated Calculations" usano
la media tra saldo di apertura e saldo di chiusura, con una condizione di ripiego: il
saldo puntuale sostituisce la media solo quando tutti gli esercizi precedenti sono a
zero, per le società con storico patrimoniale più breve di quattro esercizi. Da qui la
richiesta di quattro esercizi di stato patrimoniale a fronte di tre di conto
economico. Implementato in `averageBalances`.

### 2. Guardrail sui debiti commerciali, comportamento a 90 giorni esatti

La cella D25 usa `IFS(giorni > 90, "NO", giorni <= 90, "YES")`. Novanta giorni esatti
rispettano quindi la soglia e non producono rettifica. I giorni si calcolano sui
debiti medi, non sul saldo puntuale, e i debiti rettificati valgono `COGS / 365 * 90`.

### 3. Scala rating sovrano e net risk adjustment

Estratta dall'intervallo S8:T22 delle data table. Fino a BBB incluso la rettifica è
nulla; da BBB- si sale progressivamente fino all'8,6% per CCC- o inferiore; le
giurisdizioni senza rating prendono il 4,1%, valore intermedio tra B e B-. La scala è
identica nelle data table di marzo 2024, dicembre 2024 e gennaio 2026.

### 4. Cap della Section 5.2

La discovery indicava un cap unico dello 0,6 con un'alternativa per alcune
giurisdizioni. È inesatto: il cap dipende dalla fascia di factor intensity e dal
regime applicabile alla giurisdizione. Alta OAS (A) 70% o 80%; media OAS (B e C) 60% o
70%; bassa OES (D ed E) 40% o 45%. Il regime deriva dalla categoria: Category 1 usa i
cap standard, Category 2 quelli alternativi. Il collar è unico al 10%.

### 5. De minimis multi-industry

La soglia del 20% si valuta sulla somma delle quote della seconda e della terza
categoria, non su ciascuna separatamente (cella D63). Se non è superata, il return è
quello della prima categoria; se è superata, si calcola la media ponderata delle celle
della matrice per le quote di ricavi.

Il workbook non verifica che la prima categoria sia effettivamente quella con la quota
maggiore, pur descrivendola così nelle note. L'implementazione emette un avvertimento
quando l'ordine non è coerente.

### 6. Cap dell'OAS all'85% nella Section 5.3

Il cap si applica all'OAS prima della moltiplicazione per il net risk adjustment
(cella E107). La rettifica risultante si somma al return della Section 5.1 o 5.2, non
lo sostituisce.

### 7. Base della Section 5.3

La cella E111 mostra che la base della rettifica è il return della Section 5.2 se
questa ha prodotto un aggiustamento, altrimenti quello della Section 5.1.

### 8. Riferimento fisso alla data table di dicembre 2024

Le celle E85 ed E109 cercano la classificazione OAS e la scala rating-NRA nel foglio
"Data Table as of December 2024" anche nella versione February 2026 del workbook,
mentre i dati di giurisdizione vengono letti dalla data table di gennaio 2026.
Verificato che i due intervalli coincidono nelle tre data table, quindi oggi non ci
sono differenze di calcolo. L'implementazione non replica il riferimento fisso: lega
entrambe le tabelle alla versione selezionata.

## Scelte di implementazione

### 9. Elementi qualitativi dello scoping

Il workbook dichiara di non automatizzare i paragrafi 13.a e 14. L'esito esposto
distingue "criterio quantitativo soddisfatto" da una conclusione sull'applicabilità
dell'approccio, che resta una valutazione professionale. Nessuna etichetta di sintesi
del tipo "ammissibile".

### 10. Valori assenti e divisioni per zero

Il workbook propaga un trattino. L'implementazione usa `null` e lo propaga fino alla
presentazione, dove diventa un trattino. La coppia debiti e costo del venduto entrambi
a zero è trattata come dato assente, non come zero.

### 11. Precisione e arrotondamento

Calcolo interamente in virgola mobile a doppia precisione, senza arrotondamenti
intermedi; l'arrotondamento a due decimali avviene solo alla presentazione. I golden
test confrontano con tolleranza a dieci cifre sui valori derivati da frazioni esatte.

### 12. Scoping non soddisfatto

Il calcolo prosegue e i valori intermedi restano visibili, con un avviso in evidenza
che l'approccio semplificato non è utilizzabile. Nascondere i numeri impedirebbe di
capire da quale voce dipende l'esito.

## Ancora aperte

### 13. Limite superiore dell'OES per giurisdizione

La guidance fissa un intervallo tra il 20% e il 30% ma il valore concreto lo stabilisce
ciascuna giurisdizione, e il workbook lo lascia come input libero. Non esiste nel
workbook una tabella giurisdizione-limite. Al momento è un campo compilato
dall'utente, con avvertimento se esce dall'intervallo. Servirebbe una rilevazione
autonoma dei limiti adottati, da mantenere aggiornata.

### 14. Persistenza e riesecuzione delle run

Non ancora implementata. Ogni run produce già i metadati necessari a essere
ricostruita, versioni e checksum dei dataset, ma non c'è salvataggio né esportazione.

### 15. Esportazione

Da valutare un'esportazione della catena di calcolo in formato allegabile a un Local
File.
