import { useMutation } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";

import { DemoBadge } from "@/components/site/DemoBadge";
import { PageHeader } from "@/components/site/SectionPage";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { getBilancio } from "@/lib/portal.functions";

const TITLE = "Bilancio Finder";
const DESCRIPTION =
  "Consultazione dei dati economico-finanziari di una società già risolta tramite Company Finder, con accesso riservato al profilo PRO.";

const searchSchema = z.object({
  companyId: z.string().max(64).optional(),
  simulate: z
    .enum(["OK", "NOT_AUTHORIZED", "PROVIDER_UNAVAILABLE", "RATE_LIMITED", "DEGRADED"])
    .optional(),
});

export const Route = createFileRoute("/tool/bilancio-finder")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: `${TITLE} — Osservatorio Transfer Pricing` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: BilancioFinderPage,
});

const EUR = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const SCENARIOS = [
  { value: "OK", label: "Servizio disponibile" },
  { value: "NOT_AUTHORIZED", label: "Profilo non abilitato" },
  { value: "PROVIDER_UNAVAILABLE", label: "Servizio non disponibile" },
  { value: "RATE_LIMITED", label: "Limite di richieste raggiunto" },
  { value: "DEGRADED", label: "Servizio in modalità ridotta" },
] as const;

function BilancioFinderPage() {
  const { companyId, simulate } = Route.useSearch();
  const navigate = Route.useNavigate();
  const run = useServerFn(getBilancio);
  const [requested, setRequested] = useState(false);

  const mutation = useMutation({
    mutationFn: (input: { companyId: string; simulate: (typeof SCENARIOS)[number]["value"] }) =>
      run({ data: input }),
  });

  useEffect(() => {
    setRequested(false);
  }, [companyId]);

  const data = mutation.data;

  if (!companyId) {
    return (
      <>
        <PageHeader eyebrow="Tool" title={TITLE} intro={DESCRIPTION} />
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="border border-dashed border-border bg-secondary/40 p-8">
            <h2 className="font-serif text-2xl">Serve prima una società risolta</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Bilancio Finder accetta esclusivamente un identificativo di società già
              risolto. Avvia la ricerca in Company Finder, seleziona la società corretta e
              utilizza il pulsante “Richiedi bilancio”.
            </p>
            <Button asChild className="mt-5 min-h-11">
              <Link to="/tool/company-finder">Vai a Company Finder</Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Tool" title={TITLE} intro={DESCRIPTION} />

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <section aria-labelledby="richiesta" className="border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="richiesta" className="font-serif text-xl">
              Richiesta bilancio
            </h2>
            <span className="inline-flex items-center gap-1 border border-petrol px-2 py-0.5 text-[0.7rem] tracking-wide text-petrol uppercase">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Area PRO
            </span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Società risolta:{" "}
            <span className="font-mono text-xs text-foreground">{companyId}</span>. L'accesso
            all'area PRO è valutato lato server; in questa anteprima è simulato.
          </p>

          <fieldset className="mt-5">
            <legend className="text-xs tracking-wide text-muted-foreground uppercase">
              Scenario di servizio (solo anteprima)
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {SCENARIOS.map((scenario) => (
                <Button
                  key={scenario.value}
                  type="button"
                  variant={(simulate ?? "OK") === scenario.value ? "default" : "outline"}
                  className="min-h-11"
                  aria-pressed={(simulate ?? "OK") === scenario.value}
                  onClick={() =>
                    void navigate({
                      to: ".",
                      search: { companyId, simulate: scenario.value },
                    })
                  }
                >
                  {scenario.label}
                </Button>
              ))}
            </div>
          </fieldset>

          <Button
            className="mt-5 min-h-11"
            onClick={() => {
              setRequested(true);
              mutation.mutate({ companyId, simulate: simulate ?? "OK" });
            }}
          >
            Richiedi bilancio
          </Button>
        </section>

        <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">
          {mutation.isPending
            ? "Richiesta in corso."
            : mutation.isError
              ? "Richiesta non completata."
              : data
                ? data.message
                : requested
                  ? ""
                  : "Nessuna richiesta effettuata."}
        </p>

        {mutation.isPending ? <Skeleton className="mt-4 h-56 w-full" /> : null}

        {mutation.isError ? (
          <div role="alert" className="mt-4 border-l-2 border-destructive bg-destructive/5 p-5">
            <h2 className="font-serif text-xl">Richiesta non completata</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Non è stato possibile completare la richiesta. Riprova tra qualche istante.
            </p>
          </div>
        ) : null}

        {data && data.status !== "OK" && data.status !== "DEGRADED" ? (
          <div
            role="status"
            className="mt-4 border-l-2 border-gold bg-gold/10 p-5"
          >
            <h2 className="font-serif text-xl">
              {data.status === "NOT_AUTHORIZED"
                ? "Accesso non autorizzato"
                : data.status === "RATE_LIMITED"
                  ? "Troppe richieste"
                  : data.status === "NOT_FOUND"
                    ? "Società non risolta"
                    : "Servizio non disponibile"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{data.message}</p>
          </div>
        ) : null}

        {data && (data.status === "OK" || data.status === "DEGRADED") ? (
          <section aria-labelledby="dati" className="mt-8">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="dati" className="font-serif text-2xl">
                {data.legalName ?? "Società"}
              </h2>
              <DemoBadge />
            </div>
            {data.status === "DEGRADED" ? (
              <p role="status" className="mt-2 text-sm text-muted-foreground">
                {data.message}
              </p>
            ) : null}

            <div className="mt-4 border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Esercizio</TableHead>
                    <TableHead scope="col">Ricavi</TableHead>
                    <TableHead scope="col">EBIT</TableHead>
                    <TableHead scope="col">Risultato netto</TableHead>
                    <TableHead scope="col">Attivo</TableHead>
                    <TableHead scope="col">Addetti</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.years.map((year) => (
                    <TableRow key={year.year}>
                      <TableCell className="font-medium">{year.year}</TableCell>
                      <TableCell>{EUR.format(year.revenue)}</TableCell>
                      <TableCell>{EUR.format(year.ebit)}</TableCell>
                      <TableCell>{EUR.format(year.netResult)}</TableCell>
                      <TableCell>{EUR.format(year.totalAssets)}</TableCell>
                      <TableCell>{year.employees}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="mt-4 grid gap-4 sm:grid-cols-3">
              {data.ratios.map((ratio) => (
                <li key={ratio.label} className="border border-border bg-card p-5">
                  <p className="text-xs text-muted-foreground">{ratio.label}</p>
                  <p className="mt-2 font-serif text-2xl">{ratio.value}</p>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-xs text-muted-foreground">
              Dati finanziari sintetici a scopo dimostrativo. Non utilizzabili per analisi
              di comparabilità né per finalità documentali.
            </p>
          </section>
        ) : null}
      </div>
    </>
  );
}