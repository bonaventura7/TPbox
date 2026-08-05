import { createFileRoute } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { LinkCard } from '../components/ui/link-card'
import { ExternalLink, Search, BarChart3, Globe } from 'lucide-react'

export const Route = createFileRoute('/tool/beps-mli/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <>
      <Helmet>
        <title>BEPS MLI Database - Osservatorio Transfer Pricing</title>
        <meta
          name="description"
          content="Database interattivo per analizzare l'impatto del BEPS Multilateral Instrument sui trattati fiscali bilaterali."
        />
      </Helmet>

      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">BEPS MLI Database</h1>
          <p className="mt-2 text-muted-foreground">
            Strumento di analisi per il BEPS Multilateral Instrument (MLI)
          </p>
        </div>

        {/* Cos'è²° BEPS MLI */}
        <div className="mb-8 rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold">Cos'è²° il BEPS MLI?</h2>
          <p className="mt-2 text-muted-foreground">
            Il <strong>BEPS Multilateral Instrument (MLI)</strong> consente ai governi di modificare i trattati
            fiscali bilaterali esistenti in modo sincronizzato ed efficiente per implementare le misure
            sviluppate durante il BEPS Project, senza bisogno di rinegoziare ogni trattato bilateralmente.
          </p>
          <p className="mt-2 text-muted-foreground">
            Entrato in vigore il 1 luglio 2018, il MLI copre oltre 100 giurisdizioni e modifica più di 1.650
            trattati fiscali in tutto il mondo.
          </p>
        </div>

        {/* Funzionalità²° principali */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold">Funzionalità²° principali</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-card p-4">
              <Globe className="mb-2 h-8 w-8 text-primary" />
              <h3 className="font-medium">Matching tra paesi</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Analizza come il MLI modifica un trattato fiscale specifico tra due paesi
              </p>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <Search className="mb-2 h-8 w-8 text-primary" />
              <h3 className="font-medium">Ricerca avanzata</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Filtra per paese, articolo, tipo di provision e minimum standard
              </p>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <BarChart3 className="mb-2 h-8 w-8 text-primary" />
              <h3 className="font-medium">Statistiche</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Visualizza statistiche aggregate sull'impatto del MLI
              </p>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <ExternalLink className="mb-2 h-8 w-8 text-primary" />
              <h3 className="font-medium">Reservations e Choices</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Dettaglio completo delle reservations e choices per ogni paese
              </p>
            </div>
          </div>
        </div>

        {/* Azioni principali */}
        <div className="grid gap-6 sm:grid-cols-3">
          <LinkCard
            href="/tool/beps-mli/ricerca"
            title="Nuova ricerca"
            description="Analizza l'impatto del MLI su un trattato fiscale"
          >
            <Search className="h-4 w-4" />
          </LinkCard>

          <LinkCard
            href="/tool/beps-mli/statistiche"
            title="Statistiche"
            description="Dashboard con statistiche aggregate sull'impatto del MLI"
          >
            <BarChart3 className="h-4 w-4" />
          </LinkCard>

          <LinkCard
            href="/tool/beps-mli/paesi"
            title="Elenco paesi"
            description="Visualizza l'elenco completo dei paesi aderenti con reservations e choices"
          >
            <Globe className="h-4 w-4" />
          </LinkCard>
        </div>

        {/* Documentazione */}
        <div className="mt-12">
          <h2 className="text-xl font-semibold">Documentazione</h2>
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border bg-card p-4">
              <h3 className="font-medium">Architecture Overview</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Architettura completa di integrazione, componenti UI, API layer e roadmap.
              </p>
              <a
                href="https://github.com/bonaventura7/transfer-guide-italia/blob/main/docs/beps-mli-integration.md"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center text-sm text-primary hover:underline"
              >
                Leggi di più <ExternalLink className="ml-1 h-3 w-3" />
              </a>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <h3 className="font-medium">OECD BEPS MLI</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Panoramica ufficiale OECD sul BEPS Multilateral Instrument.
              </p>
              <a
                href="https://www.oecd.org/en/topics/beps-multilateral-instrument.html"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center text-sm text-primary hover:underline"
              >
                OECD BEPS MLI <ExternalLink className="ml-1 h-3 w-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Stato implementazione */}
        <div className="mt-12">
          <h2 className="text-xl font-semibold">Stato implementazione</h2>
          <div className="mt-4 rounded-lg border bg-card p-4">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-yellow-500"></span>
                <strong>Phase 1:</strong> Discovery e documentazione (in corso)
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-gray-300"></span>
                <strong>Phase 2:</strong> Backend e dati (da iniziare)
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-gray-300"></span>
                <strong>Phase 3:</strong> Frontend UI (da iniziare)
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-gray-300"></span>
                <strong>Phase 4:</strong> Rifiniture e ottimizzazione (da iniziare)
              </li>
            </ul>
          </div>
        </div>

        {/* Fonte dati */}
        <div className="mt-8 rounded-lg border bg-muted p-4">
          <p className="text-xs text-muted-foreground">
            <strong>Fonte dati:</strong> OECD BEPS MLI Matching Database. I dati ufficiali sono disponibili su{' '}
            <a
              href="https://www.oecd.org/en/data/tools/beps-mli-matching-database.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              oecd.org
            </a>
          </p>
        </div>
      </div>
    </>
  )
}
