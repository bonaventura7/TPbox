import { createFileRoute } from '@tanstack/react-router'
import { LinkCard } from '../components/ui/link-card'
import { Database, Calculator, Building, Search } from 'lucide-react'

export const Route = createFileRoute('/tool/')({
  head: () => ({
    meta: [
      { title: 'Tool - Osservatorio Transfer Pricing' },
      {
        name: 'description',
        content:
          'Strumenti di analisi per il transfer pricing: Amount B (Pillar One), BEPS MLI Database, Company Finder, Patent & IP Explorer.',
      },
    ],
  }),
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Tool</h1>
        <p className="mt-2 text-muted-foreground">
          Strumenti di analisi e risorse operative per il transfer pricing.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* BEPS MLI Database */}
        <LinkCard
          href="/tool/beps-mli"
          title="BEPS MLI Database"
          description="Analisi impatto Multilateral Instrument sui trattati fiscali.">
          <Database className="h-4 w-4" />
        </LinkCard>

        {/* Amount B (Pillar One) */}
        <LinkCard
          href="/tool/amount-b"
          title="Amount B (Pillar One)"
          description="Calcolo Approccio Semplificato e Razionalizzato OECD.">
          <Calculator className="h-4 w-4" />
        </LinkCard>

        {/* Company Finder */}
        <LinkCard
          href="/tool/company-finder"
          title="Company Finder"
          description="Identifica una società e scarica il bilancio in forma dimostrativa.">
          <Building className="h-4 w-4" />
        </LinkCard>

        {/* Patent & IP Explorer */}
        <LinkCard
          href="/tool/patentscope"
          title="Patent & IP Explorer"
          description="Interfaccia guidata per cercare brevetti e intangibili con PATENTSCOPE (WIPO), utile per analisi TP e IP.">
          <Search className="h-4 w-4" />
        </LinkCard>
      </div>

      <div className="mt-12 rounded-lg border bg-muted p-4 text-xs text-muted-foreground">
        <p>
          <strong>Avvertenza:</strong> i tool presenti in questa sezione hanno finalità tecnico-funzionali e di supporto all'analisi.
          Le regole normative, le decorrenze e gli arrotondamenti devono essere sempre approvati da un professionista prima di
          utilizzare i risultati su posizioni reali.
        </p>
      </div>
    </div>
  )
}
