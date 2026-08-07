# Valora Suite — Catalog MVP

Perimetro attuale: catalogo statico tipizzato, ricerca e filtri, registry di fonti
primarie con provenance, validator deterministico dei metadati e schede informative.
Nessun motore di calcolo, nessun fetch esterno (browser o server), nessun iframe,
nessuno scraping, nessun monitor, nessun salvataggio utente, nessuna migrazione DB.

| File                  | Contenuto                                                        |
| --------------------- | ---------------------------------------------------------------- |
| `types.ts`            | Tipi del catalogo, delle fonti primarie e dei finding            |
| `catalog.ts`          | Catalogo statico, allowlist host HTTPS, filtro puro              |
| `validator.ts`        | Controlli positivi su fonte primaria, URL, stato e verifica       |
| `repository.mock.ts`  | Vista di sola lettura sullo stato delle fonti                    |
| `valora.test.ts`      | Test su catalogo e validator                                     |

Rotte: `/tool/valora` (dashboard di catalogo) e `/tool/valora/wacc` (scheda
informativa, modulo non operativo, stato "in validazione").

L'integrità dei percorsi dichiarati dal catalogo deriva dal router generato: il
campo `route` è tipizzato su `FileRouteTypes["fullPaths"]`, quindi un percorso
inesistente è un errore di type-check. Le schede senza pagina usano `route: null`.
Nessuna lista manuale di rotte.

Le fonti sono esclusivamente enti esterni primari; il registry non contiene
fonti interne e nessun valore numerico è pubblicato.

`isValoraRoute` è unicamente un controllo di forma della stringa (`/tool/valora`
seguito da segmenti minuscoli): non verifica l'esistenza reale della pagina.
