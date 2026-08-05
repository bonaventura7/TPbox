import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Clock, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { NewsCard } from "@/components/news/NewsCard";
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
import { Switch } from "@/components/ui/switch";
import type { NewsFilters, NewsItem } from "@/lib/domain/types";
import { getNewsFeed } from "@/lib/portal.functions";

const GEO_OPTIONS = ["TUTTE", "OCSE", "UE", "ITALIA", "GLOBALE"] as const;
const TOPIC_OPTIONS = [
  "TUTTI",
  "Metodi e comparabili",
  "Intangibili",
  "Servizi infragruppo",
  "Pillar Two",
  "APA e MAP",
  "Documentazione",
  "Contenzioso",
] as const;

function groupByMonth(items: NewsItem[]): { label: string; items: NewsItem[] }[] {
  const groups = new Map<string, NewsItem[]>();
  for (const item of items) {
    const label = new Date(item.originalDate).toLocaleDateString("it-IT", {
      month: "long",
      year: "numeric",
    });
    const bucket = groups.get(label);
    if (bucket) bucket.push(item);
    else groups.set(label, [item]);
  }
  return [...groups.entries()].map(([label, group]) => ({ label, items: group }));
}

function ServiceNotice({
  health,
  lastRunAt,
}: {
  health: "OK" | "STALE" | "DEGRADED";
  lastRunAt: string;
}) {
  if (health === "OK") return null;
  const degraded = health === "DEGRADED";
  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 border-l-2 border-gold bg-gold/10 p-4 text-sm"
    >
      {degraded ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold-foreground" aria-hidden="true" />
      ) : (
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold-foreground" aria-hidden="true" />
      )}
      <p>
        {degraded
          ? "Servizio in modalità ridotta: alcune fonti non sono attualmente monitorate. I contenuti mostrati restano consultabili ma potrebbero non essere completi."
          : "Contenuti non recenti: l'ultimo aggiornamento della pipeline redazionale risale a un intervallo superiore alle 36 ore."}{" "}
        Ultimo aggiornamento riuscito:{" "}
        {new Date(lastRunAt).toLocaleString("it-IT", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
        .
      </p>
    </div>
  );
}

export function AttualitaFeed({
  fixedGeo,
}: {
  fixedGeo?: Exclude<NewsFilters["geo"], "TUTTE">;
}) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [geo, setGeo] = useState<NewsFilters["geo"]>(fixedGeo ?? "TUTTE");
  const [topic, setTopic] = useState<NewsFilters["topic"]>("TUTTI");
  const [institutionalOnly, setInstitutionalOnly] = useState(false);

  const fetchFeed = useServerFn(getNewsFeed);
  const effectiveGeo = fixedGeo ?? geo;
  const filters = useMemo(
    () => ({ query: submittedQuery, geo: effectiveGeo, topic, institutionalOnly }),
    [submittedQuery, effectiveGeo, topic, institutionalOnly],
  );

  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ["news-feed", filters],
    queryFn: () => fetchFeed({ data: filters }),
  });

  const archiveGroups = data ? groupByMonth(data.archive) : [];

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        {data ? <ServiceNotice health={data.health} lastRunAt={data.lastPipelineRunAt} /> : null}

        <section aria-labelledby="ricerca" className="border border-border bg-card p-5 sm:p-6">
          <h2 id="ricerca" className="font-serif text-xl">
            Ricerca e filtri
          </h2>
          <form
            className={
              fixedGeo
                ? "mt-4 grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
                : "mt-4 grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
            }
            onSubmit={(event) => {
              event.preventDefault();
              setSubmittedQuery(query);
            }}
          >
            <div className="min-w-0">
              <Label htmlFor="news-query">Cerca nel titolo, nella sintesi o nella fonte</Label>
              <Input
                id="news-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Es. comparabili, Pillar Two, documentazione"
                className="mt-2 min-h-11"
              />
            </div>
            {fixedGeo ? null : (
              <div className="min-w-0">
                <Label htmlFor="news-geo">Area geografica</Label>
                <Select value={geo} onValueChange={(value) => setGeo(value as NewsFilters["geo"])}>
                  <SelectTrigger id="news-geo" className="mt-2 min-h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GEO_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option === "TUTTE" ? "Tutte le aree" : option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="min-w-0">
              <Label htmlFor="news-topic">Tema</Label>
              <Select
                value={topic}
                onValueChange={(value) => setTopic(value as NewsFilters["topic"])}
              >
                <SelectTrigger id="news-topic" className="mt-2 min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOPIC_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "TUTTI" ? "Tutti i temi" : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" className="min-h-11 w-full md:w-auto">
                <Search aria-hidden="true" />
                Cerca
              </Button>
            </div>
          </form>
          <div className="mt-4 flex items-center gap-3">
            <Switch
              id="only-institutional"
              checked={institutionalOnly}
              onCheckedChange={setInstitutionalOnly}
            />
            <Label htmlFor="only-institutional" className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-petrol" aria-hidden="true" />
              Solo fonti istituzionali
            </Label>
          </div>
        </section>

        <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">
          {isPending
            ? "Caricamento dei contenuti in corso."
            : isError
              ? "Impossibile caricare i contenuti."
              : `${data?.archive.length ?? 0} elementi trovati${isFetching ? " · aggiornamento in corso" : ""}.`}
        </p>

        {isPending ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : null}

        {isError ? (
          <div role="alert" className="mt-6 border-l-2 border-destructive bg-destructive/5 p-5">
            <h2 className="font-serif text-xl">Contenuti non disponibili</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Si è verificato un errore durante il recupero dei contenuti. Puoi ripetere
              la richiesta; se il problema persiste, riprova più tardi.
            </p>
            <Button variant="outline" className="mt-4 min-h-11" onClick={() => void refetch()}>
              Riprova
            </Button>
          </div>
        ) : null}

        {data && data.featured ? (
          <section aria-labelledby="principale" className="mt-12">
            <h2 id="principale" className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
              Notizia principale
            </h2>
            <div className="mt-4">
              <NewsCard item={data.featured} variant="featured" />
            </div>
          </section>
        ) : null}

        {data && data.latest.length > 0 ? (
          <section aria-labelledby="ultime" className="mt-12">
            <h2 id="ultime" className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
              Ultime notizie
            </h2>
            <ul className="mt-4 grid gap-4 md:grid-cols-3">
              {data.latest.map((item) => (
                <li key={item.id}>
                  <NewsCard item={item} variant="compact" />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {data ? (
          <section aria-labelledby="archivio" className="mt-12">
            <h2 id="archivio" className="font-serif text-2xl">
              Archivio cronologico
            </h2>
            {data.archive.length === 0 ? (
              <div className="mt-4 border border-dashed border-border bg-secondary/40 p-8 text-center">
                <h3 className="font-serif text-xl">Nessun risultato</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Nessun elemento corrisponde ai criteri impostati. Prova a modificare il
                  testo cercato oppure ad ampliare area geografica e tema.
                </p>
                <Button
                  variant="outline"
                  className="mt-4 min-h-11"
                  onClick={() => {
                    setQuery("");
                    setSubmittedQuery("");
                    setGeo(fixedGeo ?? "TUTTE");
                    setTopic("TUTTI");
                    setInstitutionalOnly(false);
                  }}
                >
                  Azzera i filtri
                </Button>
              </div>
            ) : (
              <div className="mt-6 space-y-10">
                {archiveGroups.map((group) => (
                  <div key={group.label}>
                    <h3 className="border-b border-border pb-2 text-xs tracking-[0.18em] text-muted-foreground uppercase">
                      {group.label}
                    </h3>
                    <ul className="mt-4 space-y-4">
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <NewsCard item={item} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        <section
          aria-labelledby="pipeline"
          className="mt-16 border-l-2 border-petrol bg-secondary/60 p-6"
        >
          <h2 id="pipeline" className="font-serif text-xl">
            Come vengono acquisiti i contenuti
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            L'acquisizione è esclusivamente lato server. I feed RSS/Atom sono utilizzati
            solo quando verificati; in assenza di feed verificato si adotta il
            monitoraggio della pagina, l'inserimento manuale oppure la disattivazione
            della fonte. Ogni elemento acquisito entra come bozza e non può diventare
            pubblico in modo automatico: il passaggio richiede revisione e approvazione
            redazionale.
          </p>
          <p className="mt-3 text-xs tracking-wide text-muted-foreground uppercase">
            Flusso: ricevuto · classificato · rilevante o scartato · bozza · in revisione ·
            approvato · pubblicato · corretto · archiviato
          </p>
        </section>
      </div>
    </>
  );
}