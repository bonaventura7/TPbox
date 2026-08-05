# Ravvedimento — Rounding and Day Count

## Scopo

Definire le convenzioni di arrotondamento e conteggio dei giorni per il calcolo degli interessi.

## Convenzione giornaliera

### Problema attuale

Il design dichiara contemporaneamente:
- "Esclusione primo giorno"
- 582 giorni inclusivi

Questa è una **contraddizione**.

### Analisi

Per il periodo 01/01/2025 – 05/08/2026:
- **582 giorni** includendo entrambe le date (inclusive).
- **581 giorni** escludendo il giorno iniziale (exclusive start).

### Decisione

**Da documentare:**
- Quale convenzione è corretta per il ravvedimento?
- La convenzione deve essere coerente con la prassi fiscale italiana.

### Anni bisestili

- 2024 è un anno bisestile (366 giorni).
- Il divisore deve essere 365 o 366 a seconda dell'anno.

### Esempio

Per il periodo 01/07/2020 – 31/12/2020:
- Giorni: 184 (inclusivi)
- Divisore: 365
- Tasso: 0,05%
- Interesse: €94,92

## Arrotondamento

### Per segmento

- Arrotondare ogni segmento di interesse a 2 decimali?
- Oppure mantenere precisione interna e arrotondare solo il totale?

### Per totale

- Arrotondare il totale a 2 decimali (centesimi di euro).

### Decisione

**Da documentare:**
- Politica di arrotondamento per segmento.
- Politica di arrotondamento per totale.
- Uso di decimal-safe arithmetic (no `number` per importi decisionali).

## TODO

- [ ] Verificare convenzione giornaliera con professionista fiscale.
- [ ] Documentare convenzione anni bisestili.
- [ ] Definire politica di arrotondamento.
- [ ] Implementare decimal-safe arithmetic (libreria o centesimi/basis points).
