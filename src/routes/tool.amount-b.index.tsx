import { createFileRoute } from '@tanstack/react-router'
import { LinkCard } from '../components/ui/link-card'
import { ExternalLink, PlusCircle, History } from 'lucide-react'

export const Route = createFileRoute('/tool/amount-b/')({
  head: () => ({
    meta: [
      { title: 'Amount B (Pillar One): calcolo guidato — Osservatorio Transfer Pricing' },
      { name: 'description', content: "Strumento di calcolo per l'Approccio Semplificato e Razionalizzato (Amount B) del Pillar One OCSE, con dati dimostrativi." },
      { property: 'og:title', content: 'Amount B (Pillar One): calcolo guidato — Osservatorio Transfer Pricing' },
      { property: 'og:description', content: "Strumento di calcolo per l'Approccio Semplificato e Razionalizzato (Amount B) del Pillar One OCSE, con dati dimostrativi." },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://transfer-guide-italia.lovable.app/tool/amount-b' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [{ rel: 'canonical', href: 'https://transfer-guide-italia.lovable.app/tool/amount-b' }],
  }),
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <>

      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Amount B (Pillar One)</h1>
          <p className="mt-2 text-muted-foreground">
            Strumento di calcolo per l'Approccio Semplificato e Razionalizzato dell'OECD
          </p>
        </div>

        {/* Cos'è Amount B */}
        <div className="mb-8 rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold">Cos'è Amount B?</h2>
          <p className="mt-2 text-muted-foreground">
            Amount B è un approccio semplificato per la determinazione del prezzo di trasferimento
            per le attività di distribuzione di routine. Lo strumento automatizza i calcoli del
            rendimento sulle vendite secondo le linee guida OECD (Annex III of Chapter IV).
          </p>
          <p className="mt-2 text-muted-foreground">
            <strong>Nota:</strong> questo strumento automatizza i criteri quantitativi. La valutazione
            qualitativa (paragrafi 13.a e 14 delle linee guida OECD) deve essere effettuata separatamente.
          </p>
        </div>

        {/* Azioni principali */}
        <div className="grid gap-6 sm:grid-cols-2">
          <LinkCard
            href="/tool/amount-b/nuovo"
            title="Nuovo calcolo"
            description="Avvia una nuova procedura guidata di calcolo Amount B"
          >
            <PlusCircle className="h-4 w-4" />
          </LinkCard>

          <LinkCard
            href="/tool/amount-b/storico"
            title="Storico calcoli"
            description="Visualizza e riprendi i calcoli salvati"
          >
            <History className="h-4 w-4" />
          </LinkCard>
        </div>

        {/* Documentazione */}
        <div className="mt-12">
          <h2 className="text-xl font-semibold">Documentazione</h2>
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border bg-card p-4">
              <h3 className="font-medium">Architecture Overview</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Architettura UX completa, wizard 7 passi, cruscotto esito, motore di calcolo separato.
              </p>
              <a
                href="https://github.com/bonaventura7/transfer-guide-italia/blob/main/docs/amount-b-ux-architecture.md"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center text-sm text-primary hover:underline"
              >
                Leggi di più <ExternalLink className="ml-1 h-3 w-3" />
              </a>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <h3 className="font-medium">OECD Pricing Automation Tool</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Workbook ufficiale OECD "Pricing Automation Tool for the Simplified and Streamlined Approach" (February 2026 version).
              </p>
              <a
                href="https://www.oecd.org/en/topics/sub-issues/transfer-pricing/pillar-one-amount-b.html"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center text-sm text-primary hover:underline"
              >
                OECD Pillar One Amount B <ExternalLink className="ml-1 h-3 w-3" />
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
                <strong>Phase 2:</strong> Contratto TypeScript e dominio (da iniziare)
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-gray-300"></span>
                <strong>Phase 3:</strong> Engine, test e UI (da iniziare)
              </li>
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}
