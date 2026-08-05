import { createFileRoute } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { LinkCard } from '../components/ui/link-card'
import { Search, Globe, Lightbulb } from 'lucide-react'

export const Route = createFileRoute('/tool/patentscope')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <>
      <Helmet>
        <title>Patent & IP Explorer - Osservatorio Transfer Pricing</title>
        <meta
          name="description"
          content="Interfaccia guidata per cercare brevetti e asset intangibili con PATENTSCOPE (WIPO), pensata per il transfer pricing e la fiscalità internazionale."
        />
      </Helmet>

      <div className="container mx-auto max-w-5xl px-4 py-8">
        {/* Intro semplice e chiara */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Patent & IP Explorer</h1>
          <p className="mt-2 text-muted-foreground">
            Uno sportello semplice per usare PATENTSCOPE (WIPO) in modo utile per il transfer pricing: pochi campi, linguaggio chiaro,
            e un percorso guidato anche per chi non è esperto di proprietà intellettuale.
          </p>
        </div>

        {/* Che cos'è PATENTSCOPE, spiegato "per tutti" */}
        <div className="mb-8 rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold">Che cos'è PATENTSCOPE?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            PATENTSCOPE è il motore di ricerca gratuito dell'Organizzazione Mondiale della Proprietà Intellettuale (WIPO) per le domande
            di brevetto internazionali (PCT) e molte banche dati nazionali. Permette di cercare per parole chiave, codici di classificazione,
            nomi di società e altri criteri.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Qui lo usiamo come strumento per capire meglio dove sono registrati brevetti, know-how e altri intangibili rilevanti per il
            transfer pricing e la fiscalità internazionale.
          </p>
        </div>

        {/* Passi guidati, semplici */}
        <div className="mb-8 rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold">Come usarlo (in 3 passi)</h2>

          <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li>
              <strong>1. Scegli cosa ti interessa.</strong> Ad esempio:
              <br />
              - un gruppo multinazionale (nome società)
              <br />
              - una tecnologia (parole chiave)
              <br />
              - una classe di brevetti (codice IPC)
            </li>
            <li>
              <strong>2. Decidi il tipo di ricerca.</strong> PATENTSCOPE permette ricerche semplici e avanzate:
              <br />
              - "Simple search": campo unico con parole chiave
              <br />
              - "Advanced search": campi separati (titolo, riassunto, numero, IPC, nomi, ecc.)
            </li>
            <li>
              <strong>3. Apri PATENTSCOPE dal tuo portale.</strong> Usa il pulsante qui sotto: si aprirà PATENTSCOPE, ma con in mente già
              l'obiettivo e le parole giuste.
            </li>
          </ol>

          <div className="mt-6 flex flex-wrap gap-4">
            <LinkCard
              href="https://patentscope.wipo.int/search/en/search.jsf"
              title="Ricerca semplice PATENTSCOPE"
              description="Per chi vuole iniziare con una ricerca per parole o per nome."
              external
            >
              <Search className="h-4 w-4" />
            </LinkCard>

            <LinkCard
              href="https://patentscope.wipo.int/search/en/advancedSearch.jsf"
              title="Ricerca avanzata PATENTSCOPE"
              description="Per ricerche più precise (codici IPC, numeri di brevetto, nomi di titolari)."
              external
            >
              <Globe className="h-4 w-4" />
            </LinkCard>
          </div>
        </div>

        {/* Suggerimenti TP/IP in linguaggio semplice */}
        <div className="mb-8 rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold">Suggerimenti per il transfer pricing</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Quando usi PATENTSCOPE, prova a guardare:
          </p>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            <li>
              <strong>Chi è titolare del brevetto.</strong> È la stessa società che appare nella tua documentazione TP, oppure una holding
              in un'altra giurisdizione?
            </li>
            <li>
              <strong>Dove è registrato il brevetto.</strong> La giurisdizione del deposito può dare indicazioni su dove sono concentrate
              le funzioni DEMPE (Development, Enhancement, Maintenance, Protection, Exploitation).
            </li>
            <li>
              <strong>Data di deposito e famiglia di brevetti.</strong> Ti aiuta a capire se l'intangibile è maturo, se è stato sfruttato
              in più paesi e se le royalty o i margini che vedi sono coerenti.
            </li>
          </ul>
        </div>

        {/* Filosofia e avvertenza, molto chiare */}
        <div className="rounded-lg border bg-muted p-4 text-xs text-muted-foreground">
          <p>
            <Lightbulb className="mr-2 inline-block h-4 w-4" />
            <strong>Filosofia:</strong> questo tool non fa la ricerca al posto tuo, ma ti aiuta a sapere cosa cercare e perché. È pensato
            per essere usato anche da chi non ha dimestichezza con i motori brevettuali: linguaggio semplice, pochi passaggi, nessun
            tecnicismo inutile.
          </p>
          <p className="mt-2">
            <strong>Avvertenza:</strong> PATENTSCOPE è un servizio esterno gestito da WIPO. I risultati delle ricerche devono essere sempre
            interpretati alla luce della normativa applicabile e delle Linee Guida OCSE, con il supporto di professionisti abilitati,
            prima di essere utilizzati in analisi o posizioni reali.
          </p>
        </div>
      </div>
    </>
  )
}
