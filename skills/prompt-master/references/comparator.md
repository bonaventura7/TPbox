# Comparator — protocollo A/B

## Criteri e pesi di default
| Criterio | Peso |
|---|---|
| Chiarezza del task | 0.25 |
| Completezza del contesto | 0.20 |
| Specificità del formato output | 0.20 |
| Robustezza (anti-ambiguità, anti-allucinazione) | 0.20 |
| Efficienza (token / rumore) | 0.15 |

## Procedura
1. Normalizza i due prompt (stessa lingua, stessa attività).
2. Assegna 0-10 a ciascun criterio per A e per B, con una frase di motivazione.
3. Calcola il punteggio pesato: `score = Σ(voto_i × peso_i)`.
4. Dichiara il vincitore e il delta.
5. Proponi una variante C che unisca i punti di forza di A e B.

## Regole
- Nessun pareggio senza motivazione esplicita.
- Se i pesi sono forniti dall'utente, sostituiscono quelli di default (devono sommare a 1.0).
