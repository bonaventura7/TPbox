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
import { AUTO_ISOS, CONSULT_PAGES, NO_FREE_SOURCE } from "@/lib/company-finder/coverage";
import type {
  CompanyProfile,
  Financials,
  OfficialPageRef,
  SourceStatus,
} from "@/lib/company-finder/types";

const TITLE = "Company Finder";
const DESCRIPTION =
  "Identifica una società a partire dalla ragione sociale o dal numero di partita IVA e ne mostra la scheda e i conti annuali. I registri ufficiali sono interrogati dal server: nessun reindirizzamento verso siti esterni.";

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

const ANY_COUNTRY = "ANY";

/**
 * Esempi verificati su fonti reali. Dove la ricerca per nome funziona il campo
 * IVA resta vuoto: è il modo in cui il tool va usato davvero.
 */
const EXAMPLES = [
  { label: "TOD'S Deutschland GmbH · DE", query: "TOD'S Deutschland GmbH", vat: "", country: "DE" },
  { label: "SIEMENS AG · DE", query: "Siemens AG", vat: "", country: "DE" },
  { label: "ROLLS-ROYCE plc · UK", query: "Rolls-Royce Holdings plc", vat: "", country: "UK" },
  { label: "TOD'S FRANCE · FR", query: "TOD'S France", vat: "", country: "FR" },
  { label: "KVK 59581883 · NL (XBRL)", query: "", vat: "59581883", country: "NL" },
  {
    label: "PETTINAROLI A/S · DK, CVR 58495913",
    query: "Pettinaroli A/S Northern Europe",
    vat: "58495913",
    country: "DK",
  },
  { label: "ORLEN · PL, KRS 0000028860", query: "ORLEN", vat: "0000028860", country: "PL" },
  { label: "PROXIMUS · BE0202239951", query: "Proximus", vat: "BE0202239951", country: "BE" },
] as const;

/** Paesi per cui il tool estrae il bilancio da una fonte ufficiale gratuita. */
const FINANCIALS_REGISTRY: Record<string, string> = {
  DE: "Jahresabschluss — documento ufficiale",
  NL: "jaarrekeningen XBRL — valori per esercizio",
  FR: "CA e risultato netto — fonte pubblica",
  DK: "årsrapport — documento ufficiale",
  BE: "conti annuali NBB — chiave gratuita",
  UK: "annual accounts — documento ufficiale",
};

const NUMBER_FORMAT = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });
const DATE_FORMAT = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "medium",
  timeStyle: "short",
});

function fmtNum(value: number | undefined, currency: string | undefined): string {
  if (value === undefined) return "—";
  const formatted = NUMBER_FORMAT.format(value);
  return currency ? `${formatted} ${currency}` : formatted;
}

function fmtDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : DATE_FORMAT.format(parsed);
}

function Chip({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "ok" | "bad";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "ok"
      ? "border-petrol/40 bg-petrol/10 text-petrol"
      : tone === "bad"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 text-[0.7rem] font-medium tracking-wide ${toneClass}`}
    >
      {children}
    </span>
  );
}

function Field({ label, value }: { label: string; value?: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-sm font-medium break-words">{value}</dd>
    </div>
  );
}

function SourceRow({ source }: { source: SourceStatus }) {
  const icon = source.state === "ok" ? "✓" : source.state === "failed" ? "✕" : "–";
  const color =
    source.state === "ok"
      ? "text-petrol"
      : source.state === "failed"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <li className="flex items-start justify-between gap-4 py-2">
      <span className="flex items-start gap-2 text-sm">
        <span
          aria-hidden="true"
          className={`mt-0.5 inline-block w-4 text-center font-semibold ${color}`}
        >
          {icon}
        </span>
        <span>
          {source.label}
          {source.detail ? (
            <span className="block text-xs text-muted-foreground">{source.detail}</span>
          ) : null}
        </span>
      </span>
      {typeof source.ms === "number" ? (
        <span className="text-xs tabular-nums text-muted-foreground">
          {(source.ms / 1000).toFixed(2)}s
        </span>
      ) : null}
    </li>
  );
}

const COVERED_COUNTRIES = ALL_COUNTRIES.filter(
  (country) =>
    (AUTO_ISOS as readonly string[]).includes(country.iso) || country.iso in CONSULT_PAGES,
);

function CoverageRow({
  flag,
  name,
  chip,
  tone,
}: {
  flag: string;
  name: string;
  chip: string;
  tone: "ok" | "neutral";
}) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5">
      <span>
        {flag} {name}
      </span>
      <Chip tone={tone}>{chip}</Chip>
    </li>
  );
}

function RegistryCoverage() {
  const automatici = ALL_COUNTRIES.filter((c) => (AUTO_ISOS as readonly string[]).includes(c.iso));
  const consultabili = ALL_COUNTRIES.filter((c) => c.iso in CONSULT_PAGES);
  const esclusi = ALL_COUNTRIES.filter((c) => c.iso in NO_FREE_SOURCE);

  return (
    <section className="border border-border bg-card p-5 sm:p-6">
      <p className="text-xs tracking-[0.18em] text-petrol uppercase">Copertura</p>
      <h3 className="mt-1 font-serif text-xl">Dove il bilancio arriva, e come</h3>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Il tool copre i paesi in cui il bilancio depositato è gratuito. Dove il registro accetta
        chiamate da server il documento compare da solo; dove le rifiuta, la sua pagina ufficiale
        viene caricata qui dal tuo browser. I paesi in cui il documento si paga non sono coperti, e
        sono elencati per non lasciarti cercare a vuoto.
      </p>

      <h4 className="mt-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Bilancio recuperato dal server, mostrato in pagina
      </h4>
      <ul className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {automatici.map((country) => (
          <CoverageRow
            key={country.iso}
            flag={country.flag}
            name={country.nameIt}
            tone="ok"
            chip={FINANCIALS_REGISTRY[country.iso] ?? "documento ufficiale"}
          />
        ))}
      </ul>

      <h4 className="mt-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Bilancio gratuito, registro ufficiale caricato in pagina
      </h4>
      <ul className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {consultabili.map((country) => (
          <CoverageRow
            key={country.iso}
            flag={country.flag}
            name={country.nameIt}
            tone="neutral"
            chip={CONSULT_PAGES[country.iso]?.label ?? "registro nazionale"}
          />
        ))}
      </ul>

      <h4 className="mt-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Non coperti: il bilancio non è gratuito
      </h4>
      <ul className="mt-2 space-y-1.5 text-sm">
        {esclusi.map((country) => (
          <li key={country.iso} className="border-b border-border/60 py-1.5">
            <span className="font-medium">
              {country.flag} {country.nameIt}
            </span>
            <span className="ml-2 text-xs text-muted-foreground">
              {NO_FREE_SOURCE[country.iso]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CompanyCard({ company }: { company: CompanyProfile }) {
  return (
    <section className="border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs tracking-[0.18em] text-petrol uppercase">Scheda società</p>
          <h3 className="mt-2 font-serif text-2xl leading-tight break-words">
            {company.country.flag} {company.name ?? "Denominazione non disponibile"}
          </h3>
          {company.nameSource ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Denominazione registrata: {company.nameSource}
            </p>
          ) : null}
        </div>
        {company.vat ? (
          <Chip tone={company.vat.valid ? "ok" : company.vat.valid === false ? "bad" : "neutral"}>
            {company.vat.valid
              ? "IVA valida (VIES)"
              : company.vat.valid === false
                ? "IVA non valida (VIES)"
                : "IVA non verificata"}
          </Chip>
        ) : null}
      </div>

      <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Paese" value={`${company.country.nameIt} (${company.country.iso})`} />
        <Field label="Numero IVA" value={company.vat?.number} />
        <Field
          label="Registro"
          value={
            company.registry?.id
              ? `${company.registry.name} · ${company.registry.id}`
              : company.registry?.name
          }
        />
        <Field label="Forma giuridica" value={company.legalForm} />
        <Field label="Stato" value={company.status} />
        <Field label="Iscritta dal" value={fmtDate(company.registeredSince)} />
        <Field label="Ultimo aggiornamento registro" value={fmtDate(company.lastRegistryUpdate)} />
        <Field label="Sede" value={company.address} />
        <Field label="Sito web" value={company.website} />
        <Field label="E-mail" value={company.email} />
        <Field label="Capitale" value={company.capital} />
        <Field
          label="Dipendenti"
          value={
            company.employees !== undefined ? NUMBER_FORMAT.format(company.employees) : undefined
          }
        />
        {company.identifiers && company.identifiers.length > 0 ? (
          <div>
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">
              Identificativi
            </dt>
            <dd className="mt-1 flex flex-wrap gap-2">
              {company.identifiers.map((identifier) => (
                <Chip key={identifier.key}>
                  {identifier.key}: {identifier.value}
                </Chip>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>

      {company.officers && company.officers.length > 0 ? (
        <div className="mt-6 border-t border-border pt-4">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Organo rappresentativo
          </h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {company.officers.map((officer, index) => (
              <Chip key={`${officer.role}-${index}`}>
                {officer.name ? `${officer.name} — ` : ""}
                {officer.role}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Nelle API aperte i nomi delle persone fisiche sono oscurati ai sensi del GDPR: vengono
            mostrati i soli ruoli.
          </p>
        </div>
      ) : null}

      {company.activityCodes && company.activityCodes.length > 0 ? (
        <div className="mt-6 border-t border-border pt-4">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Codici attività
          </h4>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {company.activityCodes.map((activity, index) => (
              <li key={`${activity.code}-${index}`} className="flex gap-2">
                <span className="shrink-0 font-medium text-petrol tabular-nums">
                  {activity.code}
                </span>
                {activity.label ? (
                  <span className="text-muted-foreground">{activity.label}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function FinancialsCard({ financials }: { financials: Financials | undefined }) {
  const hasValues = Boolean(financials?.available && financials.years.length > 0);
  const showLiabilities = Boolean(
    financials?.years.some((year) => year.liabilitiesAndEquity !== undefined),
  );

  return (
    <section className="border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs tracking-[0.18em] text-petrol uppercase">Dati di bilancio</p>
          <h3 className="mt-1 font-serif text-xl">
            {hasValues ? "Conti annuali depositati" : "Bilancio — disponibilità della fonte"}
          </h3>
        </div>
        {financials?.source ? <Chip>{financials.source}</Chip> : null}
      </div>

      {hasValues && financials ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="py-2 pr-4">
                  Periodo
                </th>
                <th scope="col" className="py-2 pr-4 text-right">
                  Ricavi
                </th>
                <th scope="col" className="py-2 pr-4 text-right">
                  Utile operativo
                </th>
                <th scope="col" className="py-2 pr-4 text-right">
                  Utile netto
                </th>
                <th scope="col" className="py-2 pr-4 text-right">
                  Attivo totale
                </th>
                <th scope="col" className="py-2 pr-4 text-right">
                  Patrimonio
                </th>
                {showLiabilities ? (
                  <th scope="col" className="py-2 text-right">
                    Totale passiva
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {financials.years.map((year, index) => (
                <tr key={`${year.periodLabel}-${index}`} className="border-b border-border/60">
                  <td className="py-3 pr-4 font-medium">{year.periodLabel}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {fmtNum(year.revenue, year.currency)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {fmtNum(year.operatingProfit, year.currency)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {fmtNum(year.netIncome, year.currency)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {fmtNum(year.totalAssets, year.currency)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {fmtNum(year.equity, year.currency)}
                  </td>
                  {showLiabilities ? (
                    <td className="py-3 text-right tabular-nums">
                      {fmtNum(year.liabilitiesAndEquity, year.currency)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {financials.note ? (
            <p className="mt-3 text-xs text-muted-foreground">{financials.note}</p>
          ) : null}
        </div>
      ) : !financials?.documentUrl ? (
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {financials?.note ??
            "Per questo paese i conti annuali non sono esposti da una fonte gratuita: restano consultabili presso il registro nazionale, in alcuni casi a pagamento."}
        </p>
      ) : null}

      {financials?.documentUrl ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Documento ufficiale del bilancio
            </h4>
            {financials.documentTitle ? <Chip>{financials.documentTitle}</Chip> : null}
          </div>
          <iframe
            title={financials.documentTitle ?? "Documento di bilancio"}
            src={financials.documentUrl}
            className="mt-2 h-[680px] w-full border border-border bg-white"
          />
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Documento gratuito del registro ufficiale, scaricato dal server dell&apos;Osservatorio e
            mostrato in questa pagina: nessun reindirizzamento verso siti esterni.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function OfficialPageCard({ page }: { page: OfficialPageRef }) {
  return (
    <section className="border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs tracking-[0.18em] text-petrol uppercase">Consultazione ufficiale</p>
          <h3 className="mt-1 font-serif text-xl">{page.label}</h3>
        </div>
        <a
          href={page.url}
          target="_blank"
          rel="noreferrer noopener"
          className="border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Apri in una nuova scheda
        </a>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{page.note}</p>
      <iframe
        title={`Registro ufficiale — ${page.label}`}
        src={page.url}
        className="mt-4 h-[680px] w-full border border-border bg-white"
        referrerPolicy="no-referrer"
      />
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Pagina del registro ufficiale, caricata dal tuo browser e mostrata senza modifiche. A
        differenza del resto della scheda, questo riquadro è l&apos;unico punto in cui il browser
        contatta direttamente il sito del registro.
      </p>
    </section>
  );
}

function CompanyFinderPage() {
  const [query, setQuery] = useState("");
  const [vat, setVat] = useState("");
  const [country, setCountry] = useState<string>(ANY_COUNTRY);
  const [touched, setTouched] = useState(false);

  const run = useServerFn(findCompany);
  const mutation = useMutation({
    mutationFn: (input: { query: string; vat: string; country: string }) => run({ data: input }),
  });

  const missingInput = touched && query.trim().length === 0 && vat.trim().length === 0;
  const result = mutation.data;

  function search(nextQuery: string, nextVat: string, nextCountry: string) {
    setTouched(true);
    if (nextQuery.trim().length === 0 && nextVat.trim().length === 0) return;
    mutation.mutate({
      query: nextQuery,
      vat: nextVat,
      country: nextCountry === ANY_COUNTRY ? "" : nextCountry,
    });
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
            <div className="min-w-0 sm:col-span-2">
              <Label htmlFor="company-query">
                Ragione sociale <span className="text-muted-foreground">(facoltativa)</span>
              </Label>
              <Input
                id="company-query"
                value={query}
                autoComplete="off"
                aria-invalid={missingInput}
                aria-describedby={missingInput ? "company-input-error" : undefined}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Es. Siemens AG oppure ORLEN SPÓŁKA AKCYJNA"
                className="mt-2 min-h-11"
              />
            </div>
            <div className="min-w-0">
              <Label htmlFor="company-vat">
                Partita IVA o numero di registro{" "}
                <span className="text-muted-foreground">(facoltativa)</span>
              </Label>
              <Input
                id="company-vat"
                value={vat}
                autoComplete="off"
                aria-invalid={missingInput}
                aria-describedby="company-vat-hint"
                onChange={(event) => setVat(event.target.value)}
                placeholder="Es. PL7740001454, DK61056416, KVK 59581883"
                className="mt-2 min-h-11"
              />
              <p id="company-vat-hint" className="mt-2 text-xs text-muted-foreground">
                8–12 cifre, con o senza prefisso del paese. Il prefisso individua da solo la
                giurisdizione.
              </p>
            </div>
            <div className="min-w-0">
              <Label htmlFor="company-country">
                Paese <span className="text-muted-foreground">(facoltativo)</span>
              </Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger id="company-country" className="mt-2 min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_COUNTRY}>Qualsiasi paese</SelectItem>
                  {COVERED_COUNTRIES.map((option) => (
                    <SelectItem key={option.iso} value={option.iso}>
                      {option.flag} {option.nameIt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-muted-foreground">
                Serve solo quando la partita IVA è indicata senza prefisso.
              </p>
            </div>
          </div>

          {missingInput ? (
            <p id="company-input-error" role="alert" className="mt-4 text-xs text-destructive">
              Indica almeno la ragione sociale oppure il numero di partita IVA.
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
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
                  className="cursor-pointer border border-border bg-muted px-2 py-1 text-[0.7rem] font-medium tracking-wide text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
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
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>· Verifica del numero IVA presso il VIES della Commissione Europea</li>
                <li>· Consultazione del registro nazionale del paese</li>
                <li>· Raccolta della scheda societaria e dei conti annuali</li>
              </ul>
              <div className="mt-4 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ) : null}

          {mutation.isError ? (
            <div className="border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              Impossibile completare la ricerca. Riprova tra qualche istante.
            </div>
          ) : null}

          {result ? (
            <>
              {result.warnings.length > 0 ? (
                <div className="space-y-2">
                  {result.warnings.map((warning, index) => (
                    <div
                      key={index}
                      className="border border-gold/50 bg-gold/10 px-4 py-3 text-sm text-foreground"
                    >
                      <span className="font-semibold">Attenzione: </span>
                      {warning}
                    </div>
                  ))}
                </div>
              ) : null}

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
