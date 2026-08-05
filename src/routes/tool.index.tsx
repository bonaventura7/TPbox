import { createFileRoute } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { LinkCard } from '../components/ui/link-card'
import { ExternalLink } from 'lucide-react'

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
          content="Strumenti di analisi per il transfer pricing: Osservatorio Transfer Pricing, Amount B (Pillar One), Company Finder, Portale interpelli."
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
          {/* Amount B (Pillar One) - NUOVO */}
          <LinkCard
            href="/tool/amount-b"
            title="Amount B (Pillar One)"
            description="Calcolo Approccio Semplificato e Razionalizzato OECD"
          >
            <ExternalLink className="h-4 w-4" />
          </LinkCard>

          {/* Osservatorio Transfer Pricing */}
          <LinkCard
            href="https://f7dc1dde-25ee-4227-8806-f31498244695.lovableproject.com/"
            title="Osservatorio Transfer Pricing"
            description="Portale indipendente · fonti e strumenti per il transfer pricing"
            external
          >
            <ExternalLink className="h-4 w-4" />
          </LinkCard>

          {/* Company Finder */}
          <LinkCard
            href="/tool/company-finder"
            title="Company Finder"
            description="Identifica una società e scarica il bilancio in forma dimostrativa"
          >
            <ExternalLink className="h-4 w-4" />
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
              href="/tool/amount-b"
              title="Amount B (Pillar One)"
              description="Procedura guidata 7 passi per il calcolo del rendimento sulle vendite secondo Amount B OECD"
            >
              <ExternalLink className="h-4 w-4" />
            </LinkCard>

            <LinkCard
              href="/tool/company-finder"
              title="Company Finder"
              description="Ricerca per ragione sociale o numero di partita IVA, selezione esplicita della società e download del bilancio dalla stessa scheda"
            >
              <ExternalLink className="h-4 w-4" />
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
