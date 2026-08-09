import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Lock } from "lucide-react";
import { useEffect, useState } from "react";

import { DemoBadge } from "@/components/site/DemoBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getBilancio } from "@/lib/portal.functions";

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

type Scenario = (typeof SCENARIOS)[number]["value"];

/** Pannello bilancio: accetta solo un companyId già risolto in Company Finder. */
export function BilancioPanel({
  companyId,
  legalName,
}: {
  companyId: string;
  legalName: string;
}) {
  const run = useServerFn(getBilancio);
  const [scenario, setScenario] = useState<Scenario>("OK");
  const [requested, setRequested] = useState(false);

  const mutation = useMutation({
    mutationFn: (input: { companyId: string; simulate: Scenario }) => run({ data: input }),
  });

  useEffect(() => {
    setRequested(false);
    mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const data = mutation.data;

  return (
    <section
      aria-labelledby="bilancio"
      className="mt-8 border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="bilancio" className="font-serif text-xl">
          Bilancio della società
        </h2>
        <span className="inline-flex items-center gap-1 border border-petrol px-2 py-0.5 text-[0.7rem] tracking-wide text-petrol uppercase">
          <Lock className="h-3 w-3" aria-hidden="true" />
          Area PRO
        </span>
        <DemoBadge />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {legalName} · identificativo interno{" "}
        <span className="font-mono text-xs text-foreground">{companyId}</span>. L'accesso all'area
        PRO è valutato lato server; in questa anteprima è simulato.
      </p>

      <fieldset className="mt-5">
        <legend className="text-xs tracking-wide text-muted-foreground uppercase">
          Scenario di servizio (solo anteprima)
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {SCENARIOS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={scenario === option.value ? "default" : "outline"}
              className="min-h-11"
              aria-pressed={scenario === option.value}
              onClick={() => setScenario(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </fieldset>

      <Button
        className="mt-5 min-h-11"
        onClick={() => {
          setRequested(true);
          mutation.mutate({ companyId, simulate: scenario });
        }}
      >
        <Download aria-hidden="true" />
        Scarica bilancio
      </Button>

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
          <h3 className="font-serif text-lg">Richiesta non completata</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Non è stato possibile completare la richiesta. Riprova tra qualche istante.
          </p>
        </div>
      ) : null}

      {data && data.status !== "OK" && data.status !== "DEGRADED" ? (
        <div role="status" className="mt-4 border-l-2 border-gold bg-gold/10 p-5">
          <h3 className="font-serif text-lg">
            {data.status === "NOT_AUTHORIZED"
              ? "Accesso non autorizzato"
              : data.status === "RATE_LIMITED"
                ? "Troppe richieste"
                : data.status === "NOT_FOUND"
                  ? "Società non risolta"
                  : "Servizio non disponibile"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">{data.message}</p>
        </div>
      ) : null}

      {data && (data.status === "OK" || data.status === "DEGRADED") ? (
        <div className="mt-6">
          <h3 className="font-serif text-2xl">{data.legalName ?? legalName}</h3>
          {data.status === "DEGRADED" ? (
            <p role="status" className="mt-2 text-sm text-muted-foreground">
              {data.message}
            </p>
          ) : null}

          <div className="mt-4 overflow-x-auto border border-border">
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
              <li key={ratio.label} className="border border-border bg-surface p-5">
                <p className="text-xs text-muted-foreground">{ratio.label}</p>
                <p className="mt-2 font-serif text-2xl">{ratio.value}</p>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-xs text-muted-foreground">
            Dati finanziari sintetici a scopo dimostrativo. Non utilizzabili per analisi di
            comparabilità né per finalità documentali.
          </p>
        </div>
      ) : null}
    </section>
  );
}
