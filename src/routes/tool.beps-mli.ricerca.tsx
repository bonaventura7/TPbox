import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { loadJurisdictions } from '../lib/beps-mli/api'
import { useState } from 'react'
import { Search, ArrowRightLeft, CalendarDays } from 'lucide-react'

export const Route = createFileRoute('/tool/beps-mli/ricerca')({
  component: RouteComponent,
})

function RouteComponent() {
  const navigate = useNavigate()
  const jurisdictions = loadJurisdictions()

  const [paeseA, setPaeseA] = useState('ITA')
  const [paeseB, setPaeseB] = useState('FRA')
  const [statusAsOf, setStatusAsOf] = useState('2023-06-30')

  const handleSwap = () => {
    setPaeseA(paeseB)
    setPaeseB(paeseA)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Per ora usiamo uno schema semplice per l'id: j1-j2-status
    const id = `${[paeseA, paeseB].sort().join('-')}@${statusAsOf}`
    navigate({ to: '/tool/beps-mli/risultato/$id', params: { id } })
  }

  return (
    <>
      <Helmet>
        <title>Ricerca BEPS MLI - Osservatorio Transfer Pricing</title>
        <meta
          name="description"
          content="Analizza come il BEPS MLI modifica un trattato fiscale tra due paesi, con focus su Italia e controparti."
        />
      </Helmet>

      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Ricerca BEPS MLI</h1>
          <p className="mt-2 text-muted-foreground">
            Scegli due paesi e una data "Status as of" per analizzare l'impatto del BEPS Multilateral Instrument
            sul trattato fiscale bilaterale.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border bg-card p-6">
          {/* Paese A / Paese B */}
          <div className="grid gap-4 sm:grid-cols-[1fr,auto,1fr] items-end">
            <div>
              <label className="text-sm font-medium">Paese A</label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={paeseA}
                onChange={(e) => setPaeseA(e.target.value)}
              >
                {jurisdictions.map((j) => (
                  <option key={j.code} value={j.code}>
                    {j.nameIt} ({j.code})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Paese di riferimento (default: Italia).
              </p>
            </div>

            <button
              type="button"
              onClick={handleSwap}
              className="inline-flex items-center justify-center rounded-full border bg-background p-2 text-sm hover:bg-muted"
              aria-label="Inverti paesi"
            >
              <ArrowRightLeft className="h-4 w-4" />
            </button>

            <div>
              <label className="text-sm font-medium">Paese B</label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={paeseB}
                onChange={(e) => setPaeseB(e.target.value)}
              >
                {jurisdictions.map((j) => (
                  <option key={j.code} value={j.code}>
                    {j.nameIt} ({j.code})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Controparte del trattato.
              </p>
            </div>
          </div>

          {/* Status as of */}
          <div>
            <label className="text-sm font-medium flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Status as of
            </label>
            <input
              type="date"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={statusAsOf}
              onChange={(e) => setStatusAsOf(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Data alla quale si considera lo stato delle posizioni MLI dei due paesi (demo: 2023-06-30).
            </p>
          </div>

          {/* Submit */}
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Search className="h-4 w-4" />
              Avvia analisi
            </button>
          </div>
        </form>

        <div className="mt-6 rounded-lg border bg-muted p-4 text-xs text-muted-foreground">
          <p>
            <strong>Nota demo:</strong> al momento il dataset interno contiene solo la coppia Italia–Francia al
            2023-06-30. Altre coppie potranno essere aggiunte in fasi successive.
          </p>
        </div>
      </div>
    </>
  )
}
