# Valora Suite — Catalog MVP

Perimetro attuale: catalogo statico tipizzato, ricerca e filtri, registry di fonti
primarie con provenance, validator deterministico dei metadati e schede informative.
Nessun motore di calcolo, nessun fetch esterno (browser o server), nessun iframe,
nessuno scraping, nessun monitor, nessun salvataggio utente, nessuna migrazione DB.

| File                  | Contenuto                                                        |
| --------------------- | ---------------------------------------------------------------- |
| `types.ts`            | Tipi del catalogo, delle fonti primarie e dei finding            |
| `catalog.ts`          | Catalogo statico, allowlist host HTTPS, filtro puro              |
| `validator.ts`        | Controlli positivi su fonte primaria, URL, stato, verifica, rotte |
| `repository.mock.ts`  | Vista di sola lettura sullo stato delle fonti                    |
| `valora.test.ts`      | Test su catalogo e validator                                     |

Rotte: `/tool/valora` (dashboard di catalogo) e `/tool/valora/wacc` (scheda
informativa, modulo non operativo, stato "in validazione").

L'integrità dei percorsi dichiarati dal catalogo è verificata con un controllo di
forma positivo (`isValoraRoute`) e, in via definitiva, dal router generato tramite
build e type-check: nessuna lista manuale di rotte.
