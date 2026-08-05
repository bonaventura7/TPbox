import { createFileRoute } from '@tanstack/react-router'
import { LinkCard } from '../components/ui/link-card'
import { BookMarked, Scale, FileText } from 'lucide-react'

export const Route = createFileRoute('/normativa/')({
  head: () => ({
    meta: [
      { title: 'Normativa e prassi - Osservatorio Transfer Pricing' },
      {
        name: 'description',
        content:
          'Fonti normative, prassi e giurisprudenza per il transfer pricing e la fiscalità internazionale.',
      },
    ],
  }),
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Normativa e prassi</h1>
          <p className="mt-2 text-muted-foreground">
            Fonti ufficiali, prassi amministrativa e giurisprudenza tributaria, selezionate e contestualizzate per il transfer pricing.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Country Profiles */}
          <LinkCard
            href="/normativa/country-profiles"
            title="Country Profiles"
            description="Schede paese con sintesi delle norme TP, prassi e giurisprudenza rilevante."
          >
            <BookMarked className="h-4 w-4" />
          </LinkCard>

          {/* Portale interpelli */}
          <LinkCard
            href="/normativa/portale-interpelli"
            title="Portale interpelli"
            description="Ricerca tematica delle risposte pubblicate dall'Agenzia delle Entrate."
          >
            <FileText className="h-4 w-4" />
          </LinkCard>

          {/* Banca dati Giurisprudenza Tributaria */}
          <LinkCard
            href="https://bancadatigiurisprudenza.giustiziatributaria.gov.it/ricerca"
            title="Giurisprudenza Tributaria"
            description="Banca dati pubblica delle sentenze tributarie di merito (MEF - Giustizia Tributaria), con ricerca testuale e filtri avanzati."
            external
          >
            <Scale className="h-4 w-4" />
          </LinkCard>
        </div>

        <div className="mt-12 space-y-4">
          <h2 className="text-xl font-semibold">Filosofia</h2>
          <p className="text-sm text-muted-foreground">
            La sezione "Normativa e prassi" integra fonti ufficiali (leggi, decreti, provvedimenti, circolari) con strumenti di ricerca
            sugli interpelli e sulla giurisprudenza tributaria. L'obiettivo è fornire un quadro completo per analisi di transfer pricing,
            fiscalità internazionale e contenzioso.
          </p>
          <p className="text-sm text-muted-foreground">
            Per l'uso in casi reali, le interpretazioni qui proposte e le sentenze consultate devono essere sempre valutate alla luce della
            normativa vigente e delle Linee Guida OCSE, con il supporto di un professionista abilitato.
          </p>
        </div>
      </div>
  )
}
