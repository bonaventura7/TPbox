# TPBox

Crea un portale web italiano indipendente dedicato al Transfer Pricing, con approccio editoriale professionale, sobrio e autorevole. Usa React, TypeScript strict, Tailwind e shadcn/ui. Il progetto deve essere mobile-first, WCAG 2.2 AA, modulare, con dati demo chiaramente etichettati e senza copiare identità, marchi o layout di FiscoOggi.

MENU PUBBLICO
Home; Attualità; Normativa e prassi; Giurisprudenza; Tool.
Normativa e prassi contiene: OCSE, Country Profiles, Unione europea, Italia, Pillar Two.
Tool contiene soltanto Company Finder e Bilancio Finder.

ATTUALITÀ
Realizza una UI completa con notizia principale, ultime notizie, archivio cronologico, ricerca e filtri per area geografica, tema e solo fonti istituzionali. Mostra fonte, tipo fonte, data originale, lingua, tema, ultima verifica e link originale. Implementa stati loading, empty, error, stale e service degraded.

La pipeline prevista è esclusivamente server-side: RSS/Atom solo se verificati; altrimenti HTML_WATCH, MANUAL o DISABLED. Nessun fetch esterno dal browser, nessun proxy RSS pubblico, nessun URL feed inventato. Tutti gli elementi acquisiti devono entrare come DRAFT e non possono mai diventare PUBLISHED automaticamente. Workflow: RECEIVED, CLASSIFIED, RELEVANT, REJECTED, DRAFT, IN_REVIEW, APPROVED, PUBLISHED, CORRECTED, ARCHIVED.

CONFIGURAZIONE FONTI DEMO
OECD Transfer Pricing: HTML_WATCH, PRIMARY, feed_url null.
European Commission Taxation and Customs News: HTML_WATCH, PRIMARY, feed_url null.
MNE Tax Transfer Pricing: HTML_WATCH, SECONDARY, feed_url null.
Kluwer International Tax Blog: HTML_WATCH, SECONDARY, feed_url null.
WU LEARN general news: DISABLED.
Usa solo metadati sintetici e non scaricare contenuti reali.

COMPANY FINDER
Pagina /tool/company-finder con campo obbligatorio “Ragione sociale o VAT number”, Paese facoltativo e pulsante “Cerca società”. Gestisci NAME_SEARCH, VAT_SEARCH e INVALID_INPUT. Mostra risultati candidati sintetici, selezione esplicita della società, companyId interno e pulsante “Richiedi bilancio”. Non mostrare provider, registri, adapter, payload grezzi o identificativi esterni.

BILANCIO FINDER
Accetta soltanto companyId risolto. Presenta una schermata PRO con accesso simulato lato server. Per l’MVP usa dati finanziari sintetici chiaramente marcati come demo. Prevedi stati non autorizzato, provider non disponibile, rate limit e servizio degradato, senza dettagli tecnici esterni.

DESIGN
Imposta un’identità visiva editoriale e istituzionale originale: fondo avorio molto chiaro, testo blu notte, accenti azzurro petrolio e oro tenue; ampio uso di spazio bianco, griglia rigorosa, serif elegante per titoli e sans-serif leggibile per UI. Evita dashboard SaaS generiche, gradienti vistosi, glassmorphism e colori eccessivi.

HOME
Hero con titolo “Transfer Pricing, fonti e strumenti in un unico spazio”, breve sottotitolo, CTA verso Attualità e Company Finder. A seguire: notizia in evidenza, tre aggiornamenti recenti, accessi rapidi a Normativa, Giurisprudenza e Tool, blocco trasparenza sui dati demo.

ARCHITETTURA E SICUREZZA
Predisponi componenti e mock repository per futura integrazione Supabase. Nessun secret frontend. Struttura il codice per RLS, ruoli USER/EDITOR/ADMIN/PRO, audit trail, correlation ID, timeout, retry idempotente, circuit breaker, feature flag e graceful degradation. Non serve ancora collegare provider esterni o database reali.

QUALITY GATE
Verifica responsive desktop/tablet/mobile, tastiera, focus visibile, aria-live sui risultati, HTML semantico, nessun fetch esterno dal browser, nessuna bozza pubblicata automaticamente, nessun provider esposto. Crea un prototipo navigabile completo con dati demo coerenti e testi italiani professionali.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f7dc1dde-25ee-4227-8806-f31498244695).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
