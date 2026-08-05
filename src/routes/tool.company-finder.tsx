import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { useState } from "react";

import { DemoBadge } from "@/components/site/DemoBadge";
import { PageHeader } from "@/components/site/SectionPage";
import { BilancioPanel } from "@/components/tools/BilancioPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { CompanyCandidate } from "@/lib/domain/types";
import { searchCompanies } from "@/lib/portal.functions";

const TITLE = "Company Finder";
const DESCRIPTION =
  "Identifica una società a partire dalla ragione sociale o dal numero di partita IVA e scarica il bilancio direttamente dalla scheda della società selezionata.";

export const Route = createFileRoute("/tool/company-finder")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Osservatorio Transfer Pricing` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: CompanyFinderPage,
});

const COUNTRIES = [
  { value: "ANY", label: "Qualsiasi paese" },
  { value: "IT", label: "Italia" },
  { value: "ES", label: "Spagna" },
  { value: "NL", label: "Paesi Bassi" },
] as const;

function CompanyFinderPage() {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState<string>("ANY");
  const [touched, setTouched] = useState(false);
  const [selected, setSelected] = useState<CompanyCandidate | null>(null);

  const run = useServerFn(searchCompanies);
  const mutation = useMutation({
    mutationFn: (input: { query: string; country: string }) => run({ data: input }),
  });

  const missingQuery = touched && query.trim().length === 0;
  const result = mutation.data;

  return (
    <>
      <PageHeader eyebrow="Tool" title={TITLE} intro={DESCRIPTION} />

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <form
          className="border border-border bg-card p-5 sm:p-6"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            setSelected(null);
            if (query.trim().length === 0) return;
            mutation.mutate({
              query,
              country: country === "ANY" ? "" : country,
            });
          }}
        >
          <h2 className="font-serif text-xl">Ricerca società</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <Label htmlFor="company-query">
                Ragione sociale o VAT number{" "}
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
                <span className="sr-only">(campo obbligatorio)</span>
              </Label>
              <Input
                id="company-query"
                required
                aria-required="true"
                aria-invalid={missingQuery}
                aria-describedby={missingQuery ? "company-query-error" : "company-query-hint"}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Es. Alfieri Componenti oppure IT01234567890"
                className="mt-2 min-h-11"
              />
              <p id="company-query-hint" className="mt-2 text-xs text-muted-foreground">
                Inserisci almeno tre caratteri per la ricerca per nome oppure un numero di
                partita IVA di 8-12 cifre.
              </p>
              {missingQuery ? (
                <p id="company-query-error" role="alert" className="mt-2 text-xs text-destructive">
                  Il campo è obbligatorio: indica una ragione sociale o un VAT number.
                </p>
              ) : null}
            </div>
            <div className="min-w-0">
              <Label htmlFor="company-country">Paese (facoltativo)</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger id="company-country" className="mt-2 min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" className="mt-5 min-h-11">
            <Search aria-hidden="true" />
            Cerca società
          </Button>
        </form>

        <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">
          {mutation.isPending
            ? "Ricerca in corso."
            : mutation.isError
              ? "Ricerca non completata a causa di un errore temporaneo."
              : result
                ? result.mode === "INVALID_INPUT"
                  ? "Dato inserito non valido."
                  : `${result.candidates.length} società candidate.`
                : ""}
        </p>

        {mutation.isPending ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : null}

        {mutation.isError ? (
          <div role="alert" className="mt-4 border-l-2 border-destructive bg-destructive/5 p-5">
            <h2 className="font-serif text-xl">Ricerca non disponibile</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Il servizio di ricerca non è momentaneamente disponibile. Puoi ripetere la
              richiesta tra qualche istante.
            </p>
          </div>
        ) : null}

        {result && result.mode === "INVALID_INPUT" ? (
          <div role="alert" className="mt-4 border-l-2 border-gold bg-gold/10 p-5 text-sm">
            {result.message}
          </div>
        ) : null}

        {result && result.mode !== "INVALID_INPUT" ? (
          <section aria-labelledby="candidati" className="mt-8">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="candidati" className="font-serif text-2xl">
                Società candidate
              </h2>
              <DemoBadge />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{result.message}</p>

            {result.candidates.length === 0 ? (
              <div className="mt-4 border border-dashed border-border bg-secondary/40 p-8 text-center">
                <h3 className="font-serif text-lg">Nessuna società trovata</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Prova a ridurre il testo cercato o a rimuovere il filtro sul paese.
                </p>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {result.candidates.map((candidate) => {
                  const isSelected = selected?.companyId === candidate.companyId;
                  return (
                    <li
                      key={candidate.companyId}
                      className={
                        isSelected
                          ? "border border-petrol bg-surface p-5"
                          : "border border-border bg-card p-5"
                      }
                    >
                      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div className="min-w-0">
                          <h3 className="font-serif text-lg leading-snug">
                            {candidate.legalName}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {candidate.legalForm} · {candidate.city} ({candidate.country})
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {candidate.activity} · ultimo esercizio disponibile{" "}
                            {candidate.lastFilingYear}
                          </p>
                        </div>
                        <Button
                          variant={isSelected ? "default" : "outline"}
                          className="min-h-11"
                          onClick={() => setSelected(candidate)}
                          aria-pressed={isSelected}
                        >
                          {isSelected ? "Società selezionata" : "Seleziona società"}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        {selected ? (
          <section
            aria-labelledby="selezione"
            aria-live="polite"
            className="mt-8 border-l-2 border-petrol bg-secondary/60 p-6"
          >
            <h2 id="selezione" className="font-serif text-xl">
              Società risolta
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex flex-wrap gap-2">
                <dt className="text-muted-foreground">Ragione sociale</dt>
                <dd className="font-medium">{selected.legalName}</dd>
              </div>
              <div className="flex flex-wrap gap-2">
                <dt className="text-muted-foreground">Identificativo interno</dt>
                <dd className="font-mono text-xs">{selected.companyId}</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-muted-foreground">
              Il bilancio è disponibile qui sotto: la richiesta usa esclusivamente
              l'identificativo interno della società selezionata.
            </p>
          </section>
        ) : null}

        {selected ? (
          <BilancioPanel companyId={selected.companyId} legalName={selected.legalName} />
        ) : null}
      </div>
    </>
  );
}