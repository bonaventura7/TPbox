import { createFileRoute } from '@tanstack/react-router'
import { getMatchingOutcome, loadJurisdictions } from '../lib/beps-mli/api'
import type { JurisdictionCode } from '../lib/beps-mli/types'

export const Route = createFileRoute('/tool/beps-mli/risultato/$id')({
  head: () => ({
    meta: [
      { title: 'Risultato analisi BEPS MLI — Osservatorio Transfer Pricing' },
      { name: 'description', content: 'Matching outcome BEPS MLI per un trattato bilaterale a una data di riferimento, con dati dimostrativi.' },
      { property: 'og:title', content: 'Risultato analisi BEPS MLI — Osservatorio Transfer Pricing' },
      { property: 'og:description', content: 'Matching outcome BEPS MLI per un trattato bilaterale a una data di riferimento, con dati dimostrativi.' },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://transfer-guide-italia.lovable.app/tool/beps-mli/risultato' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [{ rel: 'canonical', href: 'https://transfer-guide-italia.lovable.app/tool/beps-mli/risultato' }],
  }),
  component: RouteComponent,
})

function parseId(id: string): { j1: JurisdictionCode; j2: JurisdictionCode; statusAsOf: string } {
  const [pair, statusAsOf] = id.split('@')
  const [c1, c2] = pair.split('-') as [JurisdictionCode, JurisdictionCode]
  return { j1: c1, j2: c2, statusAsOf }
}

function RouteComponent() {
  const { id } = Route.useParams()
  const { j1, j2, statusAsOf } = parseId(id)

  const jurisdictions = loadJurisdictions()
  const outcome = getMatchingOutcome(j1, j2)

  const j1Data = jurisdictions.find((j) => j.code === j1)
  const j2Data = jurisdictions.find((j) => j.code === j2)

  return (
    <>

      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">
            Risultato BEPS MLI — {j1Data?.nameIt ?? j1} / {j2Data?.nameIt ?? j2}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Stato al <strong>{statusAsOf}</strong> ("Status as of"). Dati demo basati su posizioni MLI interne.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 mb-6">
          <div className="rounded-lg border bg-card p-4 text-sm">
            <h2 className="font-semibold mb-2">{j1Data?.nameIt ?? j1}</h2>
            <p className="text-muted-foreground">
              Signatario: {j1Data?.isSignatory ? 'sì' : 'no'} — Parte: {j1Data?.isParty ? 'sì' : 'no'}
            </p>
            <p className="mt-1 text-muted-foreground">
              Firma MLI: {j1Data?.signatureDate ?? 'n.d.'}
            </p>
            <p className="mt-1 text-muted-foreground">
              Entrata in vigore: {j1Data?.entryIntoForceDate ?? 'n.d.'}
            </p>
          </div>

          <div className="rounded-lg border bg-card p-4 text-sm">
            <h2 className="font-semibold mb-2">{j2Data?.nameIt ?? j2}</h2>
            <p className="text-muted-foreground">
              Signatario: {j2Data?.isSignatory ? 'sì' : 'no'} — Parte: {j2Data?.isParty ? 'sì' : 'no'}
            </p>
            <p className="mt-1 text-muted-foreground">
              Firma MLI: {j2Data?.signatureDate ?? 'n.d.'}
            </p>
            <p className="mt-1 text-muted-foreground">
              Entrata in vigore: {j2Data?.entryIntoForceDate ?? 'n.d.'}
            </p>
          </div>
        </div>

        {outcome ? (
          <div className="mb-8 rounded-lg border bg-card p-4">
            <h2 className="text-xl font-semibold mb-2">Panoramica provisions MLI (demo)</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Per la coppia demo Italia–Francia, sono inclusi alcuni articoli MLI chiave. In una
              implementazione estesa, qui verrebbero mostrati tutti gli articoli rilevanti (6, 7, 9, 13, ecc.).
            </p>

            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-4">Articolo</th>
                  <th className="py-1 pr-4">Tipo</th>
                  <th className="py-1 pr-4">Minimum standard</th>
                  <th className="py-1 pr-4">Esito</th>
                  <th className="py-1">Spiegazione</th>
                </tr>
              </thead>
              <tbody>
                {outcome.provisions.map((p) => (
                  <tr key={p.article} className="border-t">
                    <td className="py-1 pr-4 font-medium">{p.article}</td>
                    <td className="py-1 pr-4 text-muted-foreground">{p.provisionType}</td>
                    <td className="py-1 pr-4 text-muted-foreground">{p.minimumStandard ? 'Sì' : 'No'}</td>
                    <td className="py-1 pr-4 text-muted-foreground">{p.outcome}</td>
                    <td className="py-1 text-muted-foreground">{p.explanationIt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mb-8 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            <p>
              Nessun matching outcome demo disponibile per la coppia selezionata. Al momento il dataset interno
              contiene solo Italia–Francia.
            </p>
          </div>
        )}

        <div className="rounded-lg border bg-muted p-4 text-xs text-muted-foreground">
          <p>
            <strong>Nota demo:</strong> questa pagina usa dati interni semplificati per illustrare il matching
            MLI tra due paesi. Per l'analisi completa, in fasi successive verrà esteso il dataset e l'interfaccia
            di ricerca avanzata.
          </p>
        </div>
      </div>
    </>
  )
}
