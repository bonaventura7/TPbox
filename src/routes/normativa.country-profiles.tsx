import { createFileRoute } from "@tanstack/react-router";

import { DemoBadge } from "@/components/site/DemoBadge";
import { PageHeader, Prose } from "@/components/site/SectionPage";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TITLE = "Country Profiles";
const DESCRIPTION =
  "Schede nazionali di sintesi su metodi ammessi, obblighi documentali e strumenti di prevenzione delle controversie.";

export const Route = createFileRoute("/normativa/country-profiles")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Osservatorio Transfer Pricing` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: CountryProfilesPage,
});

const ROWS = [
  { country: "Italia", methods: "Tutti i metodi previsti", doc: "Documentazione idonea con regime premiale", apa: "Accordi preventivi disponibili" },
  { country: "Germania", methods: "Tutti i metodi previsti", doc: "Master file e local file", apa: "Accordi preventivi disponibili" },
  { country: "Francia", methods: "Tutti i metodi previsti", doc: "Documentazione annuale", apa: "Accordi preventivi disponibili" },
  { country: "Spagna", methods: "Tutti i metodi previsti", doc: "Documentazione per soglie dimensionali", apa: "Accordi preventivi disponibili" },
  { country: "Paesi Bassi", methods: "Tutti i metodi previsti", doc: "Documentazione contestuale", apa: "Accordi preventivi disponibili" },
];

function CountryProfilesPage() {
  return (
    <>
      <PageHeader eyebrow="Normativa e prassi · Country Profiles" title={TITLE} intro={DESCRIPTION} />
      <Prose>
        <div className="mb-6 flex items-center gap-3">
          <DemoBadge />
          <p className="text-sm text-muted-foreground">
            Tabella dimostrativa con valori sintetici a scopo di prototipo.
          </p>
        </div>
        <div className="border border-border bg-card">
          <Table>
            <TableCaption className="px-4 pb-4 text-left">
              Sintesi demo per paese: metodi, obblighi documentali e strumenti deflattivi.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Paese</TableHead>
                <TableHead scope="col">Metodi</TableHead>
                <TableHead scope="col">Documentazione</TableHead>
                <TableHead scope="col">Accordi preventivi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.map((row) => (
                <TableRow key={row.country}>
                  <TableCell className="font-medium">{row.country}</TableCell>
                  <TableCell>{row.methods}</TableCell>
                  <TableCell>{row.doc}</TableCell>
                  <TableCell>{row.apa}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Prose>
    </>
  );
}