import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { useState } from "react";

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
import { findCompany } from "@/lib/company-finder.functions";
import { ALL_COUNTRIES } from "@/lib/company-finder/countries";
import { isCovered } from "@/lib/company-finder/coverage";
import type { CompanyProfile, Financials, OfficialPageRef } from "@/lib/company-finder/types";

const TITLE = "Company Finder";
const DESCRIPTION =
  "Identifica una società a partire dalla ragione sociale o dal numero di partita IVA e ne mostra la scheda e i conti annuali.";
const ANY_COUNTRY = "ANY";
const EXAMPLES = [
  { label: "SIEMENS AG · DE", query: "Siemens AG", vat: "", country: "DE" },
  { label: "TOD'S FRANCE · FR", query: "TOD'S France", vat: "", country: "FR" },
  { label: "ORLEN · PL, KRS 0000028860", query: "ORLEN", vat: "0000028860", country: "PL" },
  { label: "AVIO POLSKA · PL", query: "AVIO POLSKA", vat: "", country: "PL" },
  { label: "PROXIMUS · BE0202239951", query: "Proximus", vat: "BE0202239951", country: "BE" },
] as const;

const COVERED_COUNTRIES = ALL_COUNTRIES.filter((country) => isCovered(country.iso));
const NUMBER_FORMAT = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });
const DATE_FORMAT = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export const Route = createFileRoute("/tool/company-finder")({
  head: () => ({
    meta: [{ title: `${TITLE} — Osservatorio Transfer Pricing` }, { name: "description", content: DESCRIPTION }],
  }),
  component: CompanyFinderPage,
});

function fmtNum(value: number | undefined, currency?: string): string {
  if (value === undefined) return "—";
  const formatted = NUMBER_FORMAT.format(value);
  return currency ? `${formatted} ${currency}` : formatted;
}

function fmtDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : DATE_FORMAT.format(parsed);
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center border border-border bg-muted px-2 py-0.5 text-[0.7rem] font-medium tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-sm font-medium break-words">{value}</dd>
    </div>
  );
}

function CompanyCard({ company }: { company: CompanyProfile }) {
  return (
    <section className="border border-border bg-card p-5 sm:p-6">
      <p className="text-xs tracking-[0.18em] text-petrol uppercase">Scheda società</p>
      <h3 className="mt-2 font-serif text-2xl leading-tight break-words">
        {company.country.flag} {company.name ?? "Denominazione non disponibile"}
      </h3>
      {company.nameSource ? (
        <p className="mt-1 text-xs text-muted-foreground">Fonte denominazione: {company.nameSource}</p>
      ) : null}
      <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Paese" value={`${company.country.nameIt} (${company.country.iso})`} />
        <Field label="Numero IVA" value={company.vat?.number} />
        <Field
          label="Registro"
          value={company.registry?.id ? `${company.registry.name} · ${company.registry.id}` : company.registry?.name}
        />
        <Field label="Forma giuridica" value={company.legalForm} />
        <Field label="Stato" value={company.status} />
        <Field label="Iscritta dal" value={fmtDate(company.registeredSince)} />
        <Field label="Ultimo aggiornamento" value={fmtDate(company.lastRegistryUpdate)} />
        <Field label="Sede" value={company.address} />
        <Field label="Sito web" value={company.website} />
        <Field label="E-mail" value={company.email} />
        <Field label="Capitale" value={company.capital} />
        {company.identifiers?.length ? (
          <div>
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">Identificativi</dt>
            <dd className="mt-1 flex flex-wrap gap-2">
              {company.identifiers.map((identifier) => (
                <Chip key={`${identifier.key}-${identifier.value}`}>{identifier.key}: {identifier.value}</Chip>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>
      {company.activityCodes?.length ? (
        <div className="mt-6 border-t border-border pt-4">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Codici attività</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {company.activityCodes.map((activity) => (
              <Chip key={activity.code}>
                {activity.code}{activity.label ? ` · ${activity.label}` : ""}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

const DOC_KIND_LABEL: Record<string, string> = {
  ANNUAL_REPORT: "Bilancio d'esercizio",
  BALANCE_SHEET: "Stato patrimoniale",
  AUDIT_REPORT: "Relazione di revisione",
  OTHER: "Altro documento",
};

const RESTRICTION_LABEL: Record<string, string> = {
  CAPTCHA_REQUIRED: "Verifica anti-bot richiesta",
  AUTH_REQUIRED: "Autenticazione richiesta",
  SESSION_BOUND: "Sessione del registro richiesta",
  SOURCE_RESTRICTION: "Recupero automatico non consentito",
  RATE_LIMITED: "Fonte temporaneamente limitata",
  SOURCE_UNAVAILABLE: "Fonte non disponibile",
  INVALID_DOCUMENT: "Documento non valido",
};

function FinancialsCard({ financials }: { financials?: Financials }) {
  const hasValues = Boolean(financials?.available && financials.years.length);
  return (
    <section className="border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs tracking-[0.18em] text-petrol uppercase">Bilanci</p>
          <h3 className="mt-1 font-serif text-xl">
            {hasValues ? "Conti annuali depositati" : "Disponibilità documentale"}
          </h3>
        </div>
        {financials?.source ? <Chip>{financials.source}</Chip> : null}
      </div>

      {hasValues && financials ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="py-2 pr-4">Periodo</th>
                <th className="py-2 pr-4 text-right">Ricavi</th>
                <th className="py-2 pr-4 text-right">Utile netto</th>
                <th className="py-2 pr-4 text-right">Attivo totale</th>
                <th className="py-2 text-right">Patrimonio</th>
              </tr>
            </thead>
            <tbody>
              {financials.years.map((year, index) => (
                <tr key={`${year.periodLabel}-${index}`} className="border-b border-border/60">
                  <td className="py-3 pr-4 font-medium">{year.periodLabel}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">{fmtNum(year.revenue, year.currency)}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">{fmtNum(year.netIncome, year.currency)}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">{fmtNum(year.totalAssets, year.currency)}</td>
                  <td className="py-3 text-right tabular-nums">{fmtNum(year.equity, year.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {financials?.note ? <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{financials.note}</p> : null}

      {financials?.documents?.length ? (
        <div className="mt-5">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Documenti finanziari</h4>
          <ul className="mt-2 divide-y divide-border border border-border">
            {financials.documents.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm">
                <span>
                  <span className="font-medium">{doc.year ?? "Esercizio"}</span>
                  <span className="text-muted-foreground"> · {DOC_KIND_LABEL[doc.kind] ?? doc.kind} · {doc.format.toUpperCase()}</span>
                </span>
                {doc.availability === "DOCUMENT_DOWNLOADABLE" && doc.downloadUrl ? (
                  <a
                    href={doc.downloadUrl}
                    download
                    className="border border-border bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                  >
                    Scarica bilancio
                  </a>
                ) : (
                  <Chip>{doc.restriction ? RESTRICTION_LABEL[doc.restriction] : "Solo consultazione"}</Chip>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {financials?.documentUrl ? (
        <div className="mt-5 border-t border-border pt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Documento principale</h4>
            <p className="mt-1 text-sm font-medium">{financials.documentTitle ?? "Bilancio"}</p>
          </div>
          <a
            href={financials.documentUrl}
            download
            className="border border-border bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Scarica documento
          </a>
        </div>
      ) : null}
    </section>
  );
}

function OfficialPageCard({ page }: { page: OfficialPageRef }) {
  return (
    <section className="border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-petrol uppercase">Destinazione documentale</p>
          <h3 className="mt-1 font-serif text-xl">{page.label}</h3>
        </div>
        <a
          href={page.url}
          target="_blank"
          rel="noopener noreferrer"
          className="border border-border bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          {page.actionLabel ?? "Apri i documenti"}
        </a>
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{page.note}</p>
      {page.instructions?.length ? (
        <ol className="mt-4 ml-5 list-decimal space-y-1 text-sm text-muted-foreground">
          {page.instructions.map((step) => <li key={step}>{step}</li>)}
        </ol>
      ) : null}
    </section>
  );
}

function CompanyFinderPage() {
  const [query, setQuery] = useState("");
  const [vat, setVat] = useState("");
  const [country, setCountry] = useState(ANY_COUNTRY);
  const [touched, setTouched] = useState(false);
  const run = useServerFn(findCompany);
  const mutation = useMutation({
    mutationFn: (input: { query: string; vat: string; country: string }) => run({ data: input }),
  });
  const result = mutation.data;
  const missingInput = touched && !query.trim() && !vat.trim();

  function search(nextQuery: string, nextVat: string, nextCountry: string) {
    setTouched(true);
    if (!nextQuery.trim() && !nextVat.trim()) return;
    mutation.mutate({ query: nextQuery, vat: nextVat, country: nextCountry === ANY_COUNTRY ? "" : nextCountry });
  }

  return (
    <>
      <PageHeader eyebrow="Tool" title={TITLE} intro={DESCRIPTION} />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <form
          className="border border-border bg-card p-5 sm:p-6"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            search(query, vat, country);
          }}
        >
          <h2 className="font-serif text-xl">Ricerca società</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="company-query">Ragione sociale <span className="text-muted-foreground">(facoltativa)</span></Label>
              <Input id="company-query" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" className="mt-2 min-h-11" placeholder="Es. AVIO POLSKA, Siemens AG, TOD'S France" />
            </div>
            <div>
              <Label htmlFor="company-vat">Partita IVA o numero di registro <span className="text-muted-foreground">(facoltativa)</span></Label>
              <Input id="company-vat" value={vat} onChange={(event) => setVat(event.target.value)} autoComplete="off" className="mt-2 min-h-11" placeholder="Es. PL7740001454 o KRS 0000002594" />
            </div>
            <div>
              <Label htmlFor="company-country">Paese <span className="text-muted-foreground">(facoltativo)</span></Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger id="company-country" className="mt-2 min-h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_COUNTRY}>Qualsiasi paese</SelectItem>
                  {COVERED_COUNTRIES.map((option) => <SelectItem key={option.iso} value={option.iso}>{option.flag} {option.nameIt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {missingInput ? <p role="alert" className="mt-3 text-xs text-destructive">Indica almeno la ragione sociale oppure il numero di registro/IVA.</p> : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="submit" className="min-h-11" disabled={mutation.isPending}>
              <Search className="size-4" aria-hidden="true" />
              {mutation.isPending ? "Ricerca in corso…" : "Cerca società"}
            </Button>
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">Esempi pronti</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  className="cursor-pointer border border-border bg-muted px-2 py-1 text-[0.7rem] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    setQuery(example.query);
                    setVat(example.vat);
                    setCountry(example.country);
                    search(example.query, example.vat, example.country);
                  }}
                >
                  {example.label}
                </button>
              ))}
            </div>
          </div>
        </form>

        <div aria-live="polite" className="mt-6 space-y-6">
          {mutation.isPending ? (
            <div className="border border-border bg-card p-5 sm:p-6">
              <p className="font-serif text-lg">Consultazione dei registri in corso…</p>
              <div className="mt-4 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-2/3" /></div>
            </div>
          ) : null}
          {mutation.isError ? <div className="border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Impossibile completare la ricerca. Riprova.</div> : null}
          {result ? (
            <>
              {result.warnings.map((warning, index) => <div key={index} className="border border-gold/50 bg-gold/10 px-4 py-3 text-sm"><span className="font-semibold">Attenzione: </span>{warning}</div>)}
              {result.company ? <CompanyCard company={result.company} /> : null}
              {result.found ? <FinancialsCard financials={result.financials} /> : null}
              {result.officialPage ? <OfficialPageCard page={result.officialPage} /> : null}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
