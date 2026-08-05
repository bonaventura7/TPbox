import { createFileRoute } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { LinkCard } from '../components/ui/link-card'
import { ExternalLink, Database, Calculator, Building } from 'lucide-react'

export const Route = createFileRoute('/tool/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <>
      <Helmet>
        <title>Tool - Osservatorio Transfer Pricing</title>
        <meta
          name="description"
          content="Strumenti di analisi per il transfer pricing: Amount B (Pillar One), BEPS MLI Database, Company Finder, Portale interpelli."
        />
      </Helmet>

      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Tool</h1>
          <p className="mt-2 text-muted-foreground">
            Strumenti di analisi e risorse per il transfer pricing
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* BEPS MLI Database */}
          <LinkCard
            href="/tool/beps-mli"
            title="BEPS MLI Database"
            description="Analisi impatto Multilateral Instrument sui trattati fiscali"
          >
            <Database className="h-4 w-4" />
          </LinkCard>

          {/* Amount B (Pillar One) */}
          <LinkCard
            href="/tool/amount-b"
            title="Amount B (Pillar One)"
            description="Calcolo Approccio Semplificato e Razionalizzato OECD"
          >
            <Calculator className="h-4 w-4" />
          </LinkCard>

          {/* Company Finder */}
          <LinkCard
            href="/tool/company-finder"
            title="Company Finder"
            description="Identifica una società e scarica il bilancio in forma dimostrativa"
          >
            <Building className="h-4 w-4" />
          </LinkCard>

          {/* Portale interpelli */}
          <LinkCard
            href="/normativa/portale-interpelli"
            title="Portale interpelli"
            description="Ricerca tematica delle risposte pubblicate dall'Agenzia delle Entrate"
          >
            <ExternalLink className="h-4 w-4" />
          </LinkCard>
        </div>

        {/* Sezione strumenti di analisi */}
        <div className="mt-12">
          <h2 className="text-xl font-semibold">Strumenti di analisi</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <LinkCard
              href="/tool/beps-mli"
              title="BEPS MLI Database"
              description="Database interattivo per analizzare l'impatto del BEPS MLI sui trattati fiscali bilaterali"
            >
              <Database className="h-4 w-4" />
            </LinkCard>

            <LinkCard
              href="/tool/amount-b"
              title="Amount B (Pillar One)"
              description="Procedura guidata 7 passi per il calcolo del rendimento sulle vendite secondo Amount B OECD"
            >
              <Calculator className="h-4 w-4" />
            </LinkCard>

            <LinkCard
              href="/tool/company-finder"
              title="Company Finder"
              description="Ricerca per ragione sociale o numero di partita IVA, selezione esplicita della società e download del bilancio dalla stessa scheda"
            >
              <Building className="h-4 w-4" />
            </LinkCard>

            <LinkCard
              href="/normativa/portale-interpelli"
              title="Portale interpelli"
              description="Ricerca tematica delle risposte pubblicate dall'Agenzia delle Entrate, ora nella sezione Normativa e prassi"
            >
              <ExternalLink className="h-4 w-4" />
            </LinkCard>
          </div>
        </div>
      </div>
    </>
  )
}
