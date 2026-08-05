# Riorganizzazione sezioni: Normativa, Attualità, Tool

## Cosa cambia per chi naviga

**Menu pubblico**
- Home · Attualità · Normativa e prassi · Giurisprudenza · Tool
- Normativa e prassi: Country Profiles, Portale interpelli
- Tool: Company Finder (unico strumento)

**Attualità**
- Nuove viste per area: OCSE, Unione europea, Italia, in aggiunta al feed completo.
- Le tre aree diventano elenchi di notizie in stile feed (fonte, tipo fonte, data originale, lingua, tema, ultima verifica, link ufficiale), non più schede statiche.
- Restano ricerca, filtri per tema, "solo fonti istituzionali", ordinamento e stati loading / empty / error / stale / degraded.

**Normativa e prassi**
- Portale interpelli si sposta qui: `/normativa/portale-interpelli` e dettaglio `/normativa/portale-interpelli/:id`. Funzionalità identiche (filtri materia, anno, numero, solo TP, ricerca, chip, paginazione, link alla sola fonte Agenzia delle Entrate).
- Country Profiles resta in questa sezione.
- Pagine rimosse: OCSE, Unione europea, Italia (contenuto ora in Attualità) e Pillar Two (eliminata).

**Tool**
- Bilancio Finder eliminato come strumento a sé.
- Il bilancio si ottiene da Company Finder: dopo la selezione esplicita della società compare il pulsante "Scarica bilancio" che apre i dati economici demo nella stessa scheda, con gli stati già previsti (non autorizzato / PRO, provider non disponibile, rate limit, servizio degradato) e senza dettagli tecnici esterni.

**Home**
- Accessi rapidi aggiornati: Attualità per area, Normativa e prassi (Country Profiles, Portale interpelli), Giurisprudenza, Company Finder.

**Compatibilità URL**
- I vecchi indirizzi `/tool/portale-interpelli`, `/tool/bilancio-finder`, `/normativa/ocse`, `/normativa/unione-europea`, `/normativa/italia`, `/normativa/pillar-two` reindirizzano alla nuova destinazione corrispondente, così nessun link condiviso si rompe.

## Note tecniche

- Nuove route: `attualita.index.tsx` + `attualita.$area.tsx` (aree `ocse`, `unione-europea`, `italia`) con `head()` proprio per ciascuna; l'area preimposta il filtro geografico del feed lato server esistente (`getNewsFeed`).
- Spostamento file: `tool.portale-interpelli.*` → `normativa.portale-interpelli.index.tsx` e `normativa.portale-interpelli.$id.tsx`, invariati nella logica; `createFileRoute` allineato ai nuovi percorsi.
- Eliminazione: `normativa.ocse.tsx`, `normativa.unione-europea.tsx`, `normativa.italia.tsx`, `normativa.pillar-two.tsx`, `tool.bilancio-finder.tsx`; redirect tramite piccole route `beforeLoad: () => redirect({ to: ... })`.
- Company Finder: il pannello bilancio (già implementato nel vecchio tool) diventa un componente riusabile montato sotto la scheda società selezionata; continua a chiamare `getBilancio` con il solo `companyId` risolto.
- `SiteHeader`, `tool.index.tsx`, `normativa.index.tsx` e `index.tsx` aggiornati a menu e card nuovi; `feature-flags.ts` ripulito dalla voce `bilancioFinder` non più usata.
- Correzione collaterale: le date nelle schede notizia sono formattate in fuso locale e causano un mismatch di idratazione; passeranno a formattazione deterministica (timezone `Europe/Rome`).
- Nessun fetch esterno dal browser, nessuna bozza pubblicata automaticamente, dati demo sempre etichettati; typecheck e verifica di navigazione a fine lavoro.
