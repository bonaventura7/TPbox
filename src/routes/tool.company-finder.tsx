import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/site/SectionPage";
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
import { getCompanyRegistrySources } from "@/lib/portal.functions";
import type { CompanyRegistrySource } from "@/lib/company-registry/types";

const TITLE = "Company Finder UE";
const DESCRIPTION =
  "Trova il registro ufficiale competente per una società dell’Unione europea. Il tool non mostra risultati societari simulati e non interroga registri esterni dal browser.";

export const Route = createFileRoute("/tool/company-finder")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Osservatorio Transfer Pricing` },
      { name: "description", content: DESCRIPTION },
    ],
  }),
  component: CompanyFinderPage,
});

function CompanyFinderPage() {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const registryQuery = useQuery({
    queryKey: ["company-registry-sources"],
    queryFn: () => getCompanyRegistrySources(),
    staleTime: 5 * 60 * 1000,
  });

  const source = useMemo<CompanyRegistrySource | null>(
    () => registryQuery.data?.find((item) => item.country_code === country) ?? null,
    [country, registryQuery.data],
  );

  const queryError = submitted && query.trim().length < 3;
  const countryError = submitted && country.length !== 2;

  return (
    <>
      <PageHeader eyebrow="Tool" title={TITLE} intro={DESCRIPTION} />

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <form
          className="border border-border bg-card p-5 sm:p-6"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
          }}
        >
          <h2 className="font-serif text-xl">1. Seleziona Paese e identifica la società</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            La denominazione o l’identificativo servono per guidarti alla ricerca ufficiale. Non
            vengono inviati a registri esterni da questa pagina.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <Label htmlFor="company-country">
                Paese <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger
                  id="company-country"
                  className="mt-2 min-h-11 w-full"
                  aria-invalid={countryError}
                  aria-describedby={countryError ? "company-country-error" : undefined}
                >
                  <SelectValue placeholder="Seleziona uno Stato UE" />
                </SelectTrigger>
                <SelectContent>
                  {(registryQuery.data ?? []).map((item) => (
                    <SelectItem key={item.country_code} value={item.country_code}>
                      {item.country_name_it}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {countryError ? (
                <p id="company-country-error" role="alert" className="mt-2 text-xs text-destructive">
                  Seleziona uno Stato membro dell’Unione europea.
                </p>
              ) : null}
            </div>

            <div className="min-w-0">
              <Label htmlFor="company-query">
                Denominazione o identificativo <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <Input
                id="company-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Es. società oppure numero di registro"
                className="mt-2 min-h-11"
                aria-invalid={queryError}
                aria-describedby={queryError ? "company-query-error" : "company-query-hint"}
              />
              <p id="company-query-hint" className="mt-2 text-xs text-muted-foreground">
                La ricerca esterna viene effettuata esclusivamente sul registro ufficiale.
              </p>
              {queryError ? (
                <p id="company-query-error" role="alert" className="mt-2 text-xs text-destructive">
                  Inserisci almeno tre caratteri.
                </p>
              ) : null}
            </div>
          </div>

          <Button type="submit" className="mt-5 min-h-11" disabled={registryQuery.isLoading}>
            <Search aria-hidden="true" />
            Verifica canale
          </Button>
        </form>

        {registryQuery.isLoading ? (
          <div className="mt-6 space-y-3" aria-label="Caricamento registro">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}

        {registryQuery.isError ? (
          <div role="alert" className="mt-6 border-l-2 border-destructive bg-destructive/5 p-5">
            <h2 className="font-serif text-xl">Registro non disponibile</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Il registry interno non è momentaneamente disponibile. Nessun risultato societario
              viene mostrato in assenza di una fonte verificata.
            </p>
          </div>
        ) : null}

        {submitted && source ? (
          <section aria-labelledby="registry-status" className="mt-8 border border-border bg-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  3. Risultato canale
                </p>
                <h2 id="registry-status" className="mt-2 font-serif text-2xl">
                  {source.search_mode === "EXTERNAL_REGISTER"
                    ? "Registro ufficiale esterno"
                    : source.search_mode === "INTEGRATED_API"
                      ? "Ricerca integrata disponibile"
                      : source.status === "UNDER_REVIEW"
                        ? "Registro in verifica"
                        : "Accesso soggetto a condizioni"}
                </h2>
              </div>
              <span className="border border-border px-3 py-1 text-xs font-medium">
                {source.status === "VERIFIED" ? "FONTE VERIFICATA" : "IN VERIFICA"}
              </span>
            </div>

            <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Paese</dt>
                <dd className="font-medium">{source.country_name_it}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Registro</dt>
                <dd className="font-medium">{source.official_register_name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Accesso</dt>
                <dd>{accessLabel(source)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Documenti</dt>
                <dd>{documentLabel(source)}</dd>
              </div>
            </dl>

            <div className="mt-6 border-t border-border pt-5">
              <p className="text-sm text-muted-foreground">
                {source.search_mode === "EXTERNAL_REGISTER"
                  ? "Inserisci la denominazione o l’identificativo nel registro ufficiale aperto. Non viene costruito alcun deep link non documentato."
                  : "Il canale integrato sarà attivato solo quando endpoint, accesso e condizioni d’uso saranno verificati."}
              </p>
              {source.search_mode === "EXTERNAL_REGISTER" ? (
                <Button asChild className="mt-4 min-h-11">
                  <a
                    href={source.official_register_url}
                    target="_blank"
                    rel="noopener noreferrer external"
                  >
                    Apri il registro ufficiale
                    <ExternalLink aria-hidden="true" />
                  </a>
                </Button>
              ) : null}
            </div>
          </section>
        ) : null}

        {submitted && !source && !registryQuery.isLoading && !registryQuery.isError ? (
          <div role="status" className="mt-6 border border-dashed border-border bg-secondary/40 p-8 text-center">
            <h2 className="font-serif text-xl">Registro in verifica</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Il registro ufficiale per questo Paese è in fase di verifica. Non sono disponibili
              risultati integrati.
            </p>
          </div>
        ) : null}

        <p className="mt-8 border-l-2 border-border bg-secondary/40 p-4 text-xs text-muted-foreground">
          Fonte del registry: indice dei registri nazionali del Portale europeo della giustizia.
          Il tool non esegue scraping, non interroga registri esterni dal browser e non mostra
          dati societari sintetici.
        </p>
      </div>
    </>
  );
}

function accessLabel(source: CompanyRegistrySource) {
  switch (source.access_type) {
    case "FREE": return "Gratuito per le informazioni indicate";
    case "PARTLY_FREE": return "Parzialmente gratuito";
    case "PAID": return "A pagamento";
    case "CONDITIONS_APPLY": return "Soggetto a condizioni";
    default: return "Condizioni da verificare";
  }
}

function documentLabel(source: CompanyRegistrySource) {
  switch (source.document_access) {
    case "AVAILABLE": return "Disponibili";
    case "PARTLY_AVAILABLE": return "Parzialmente disponibili";
    case "PAID": return "Disponibili a pagamento";
    case "NOT_AVAILABLE": return "Non disponibili";
    default: return "Condizioni da verificare";
  }
}
