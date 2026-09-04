/**
 * Sezione Tool – indice degli strumenti.
 */

import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeftRight,
  ArrowRight,
  Building,
  Calculator,
  Database,
  LineChart,
  Repeat,
  Scale,
  Search,
  type LucideIcon,
} from "lucide-react";

const TITLE = "Tool — Osservatorio Transfer Pricing";
const DESCRIPTION =
  "Strumenti operativi per il transfer pricing: Amount B del Pillar One, conversione di valuta dei benchmark, dati di mercato, database BEPS MLI, ravvedimento, ricerca società e brevetti.";

export const Route = createFileRoute("/tool/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ToolIndex,
});

type ToolStatus = "operativo" | "in sviluppo" | "dimostrativo";

interface Tool {
  readonly href: string;
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly status: ToolStatus;
  readonly detail: string;
}

const STATUS_CLASS: Record<ToolStatus, string> = {
  operativo: "border-petrol/40 text-petrol",
  "in sviluppo": "border-border text-muted-foreground",
  dimostrativo: "border-gold text-gold-foreground bg-gold/10",
};

const CALCULATORS: readonly Tool[] = [
  {
    href: "/tool/amount-b",
    title: "Amount B (Pillar One)",
    description:
      "Return on sales per le attività di distribuzione di routine secondo l'Approccio Semplificato e Razionalizzato.",
    icon: Calculator,
    status: "operativo",
    detail: "Workbook OCSE February 2026 · 214 giurisdizioni",
  },
  {
    href: "/tool/ravvedimento",
    title: "Ravvedimento spontaneo",
    description:
      "Interessi legali anno per anno e sanzione ridotta, con i regimi anteriori e posteriori al D.Lgs. 87/2024.",
    icon: Scale,
    status: "operativo",
    detail: "Tassi legali 1997-2025 · dataset versionato",
  },
  {
    href: "/tool/currency-benchmark",
    title: "Currency-Adjusted Benchmark",
    description:
      "Converte le osservazioni di un benchmark nella valuta della transazione e ricalcola il range interquartile.",
    icon: ArrowLeftRight,
    status: "operativo",
    detail: "Differenziale su curve governative · copertura EUR e USD",
  },
  {
    href: "/tool/swap",
    title: "Interest Rate Swap",
    description:
      "Scadenzario dei pagamenti e interessi di periodo di uno swap, dalle convenzioni di mercato: swap date, day count e pay frequency.",
    icon: Repeat,
    status: "operativo",
    detail: "ISDA 2006 §4.16 · nessuna curva di sconto",
  },
  {
    href: "/tool/valora",
    title: "Valora Suite",
    description:
      "Costo del capitale, premi per il rischio e valutazione d'impresa: WACC, beta, country risk premium, credit spread e DCF.",
    icon: LineChart,
    status: "in sviluppo",
    detail: "Catalogo documentale con fonti primarie e stato di verifica",
  },
] as const;

const DATABASES: readonly Tool[] = [
  {
    href: "/tool/beps-mli",
    title: "BEPS MLI Database",
    description:
      "Effetto della Convenzione multilaterale sui singoli trattati contro le doppie imposizioni.",
    icon: Database,
    status: "in sviluppo",
    detail: "Ricerca per coppia di giurisdizioni",
  },
  {
    href: "/tool/company-finder",
    title: "Company Finder",
    description:
      "Identificazione di una società per denominazione o partita IVA e accesso al bilancio.",
    icon: Building,
    status: "operativo",
    detail: "Registri ufficiali UE, lato server",
  },
  {
    href: "/tool/market-data",
    title: "Dati di mercato",
    description:
      "Cambi di riferimento BCE, curve dei rendimenti, tassi Euribor e Treasury, spread creditizi e country risk premium.",
    icon: Activity,
    status: "operativo",
    detail: "BCE, FRED e Damodaran · interrogate lato server",
  },
  {
    href: "/tool/patentscope",
    title: "Patent & IP Explorer",
    description:
      "Ricerca guidata su brevetti e intangibili tramite PATENTSCOPE, per analisi di transfer pricing sugli IP.",
    icon: Search,
    status: "dimostrativo",
    detail: "Fonte WIPO",
  },
] as const;

function ToolCard({ tool }: { readonly tool: Tool }) {
  const Icon = tool.icon;
  return (
    <li>
      <Link
        to={tool.href}
        className="group flex h-full flex-col rounded-lg border border-rule bg-card p-5 transition-colors hover:border-petrol focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="flex items-start justify-between gap-3">
          <Icon className="h-5 w-5 text-petrol" aria-hidden="true" />
          <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[tool.status]}`}>
            {tool.status}
          </span>
        </div>
        <h3 className="mt-4 font-serif text-xl">{tool.title}</h3>
        <p className="mt-2 flex-1 text-sm text-muted-foreground">{tool.description}</p>
        <p className="mt-4 text-xs text-muted-foreground">{tool.detail}</p>
        <span className="mt-3 inline-flex items-center gap-1 text-sm text-petrol">
          Apri
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </Link>
    </li>
  );
}

function ToolIndex() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sezione</p>
      <h1 className="mt-1 font-serif text-4xl tracking-tight">Tool</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        Strumenti di calcolo e di ricerca per il lavoro quotidiano sui prezzi di trasferimento, con
        le fonti e le versioni dei dati sempre in chiaro.
      </p>

      <section aria-labelledby="calcolatori" className="mt-12">
        <h2 id="calcolatori" className="font-serif text-2xl">
          Calcolo
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Motori di calcolo con dataset versionati e catena di derivazione visibile.
        </p>
        <ul className="mt-6 grid gap-5 sm:grid-cols-2">
          {CALCULATORS.map((t) => (
            <ToolCard key={t.href} tool={t} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="ricerca" className="mt-14">
        <h2 id="ricerca" className="font-serif text-2xl">
          Ricerca e banche dati
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Interrogazione di fonti esterne e di archivi documentali.
        </p>
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {DATABASES.map((t) => (
            <ToolCard key={t.href} tool={t} />
          ))}
        </ul>
      </section>

      <p className="mt-14 rounded-lg border border-rule bg-muted/40 p-4 text-xs text-muted-foreground">
        Gli strumenti hanno finalità tecnico-funzionali e di supporto all&apos;analisi. Regole
        normative, decorrenze e arrotondamenti vanno approvati da un professionista prima di
        utilizzare i risultati su posizioni reali. Gli strumenti marcati come dimostrativi
        restituiscono dati sintetici.
      </p>
    </div>
  );
}
