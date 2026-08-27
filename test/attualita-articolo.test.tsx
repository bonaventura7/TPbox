/**
 * Struttura a tre livelli della sezione Attualità:
 *   1. pagina indice con le card
 *   2. articolo redazionale nostro, raggiunto dalla card
 *   3. fonte ufficiale, citata dentro l'articolo (di norma un PDF)
 *
 * La card non porta fuori dal sito: il collegamento esterno vive solo al terzo
 * livello. Le asserzioni sono state verificate rosse su 08fcda5 prima del codice.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArticleBody } from "../src/components/news/ArticleBody";
import { NewsCard } from "../src/components/news/NewsCard";
import { SourceBlock } from "../src/components/news/SourceBlock";
import { articlePath, articleSlug } from "../src/lib/domain/article";
import { DEMO_NEWS_ITEMS } from "../src/lib/domain/demo-data";
import { mockNewsRepo } from "../src/lib/repositories/news.mock.repo.server";
import { buildSourceLinks, isPdfUrl } from "../src/lib/domain/source-link";
import type { NewsItem } from "../src/lib/domain/types";
import { mapRow, newsRowSchema } from "../src/lib/repositories/news.repo.mapping";

const PDF_INDIA = "https://www.incometaxindia.gov.in/documents/d/guest/apa-report2025-26-2-pdf";

const baseItem = {
  id: "news-india-apa-2025-26",
  title: "India pubblica il Rapporto APA 2025-26: record di accordi preventivi",
  summary: "Sommario di prova.",
  sourceId: "src-cbdt-india",
  sourceName: "Central Board of Direct Taxes (CBDT) – India",
  sourceKind: "ISTITUZIONALE",
  sourceTier: "PRIMARY",
  originalDate: "2026-08-04",
  lastVerifiedAt: "2026-08-06T09:00:00Z",
  language: "en",
  geo: "GLOBALE",
  topic: "APA e MAP",
  originalUrl: PDF_INDIA,
  workflowState: "PUBLISHED",
  isDemo: true,
} satisfies NewsItem;

function makeItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return { ...baseItem, ...overrides };
}

describe("slug e percorso dell'articolo", () => {
  it("usa lo slug della riga quando c'è", () => {
    expect(articleSlug(makeItem({ slug: "india-rapporto-apa-2025-26" }))).toBe(
      "india-rapporto-apa-2025-26",
    );
  });

  it("deriva uno slug stabile da titolo e id quando la riga non ne ha", () => {
    const derived = articleSlug(makeItem());

    expect(derived).toMatch(/^[a-z0-9-]+$/);
    expect(derived).toContain("india-pubblica-il-rapporto-apa");
    expect(derived).toBe(articleSlug(makeItem()));
  });

  it("non lascia accenti, doppi trattini o trattini ai bordi", () => {
    const derived = articleSlug(
      makeItem({ id: "x", title: "  Attività   d'impresa — è già così!  ", slug: undefined }),
    );

    expect(derived).not.toMatch(/--|^-|-$/);
    expect(derived).not.toMatch(/[àèéìòùÀÈÉ']/);
  });

  it("compone il percorso interno dell'articolo", () => {
    expect(articlePath(makeItem({ slug: "india-apa" }))).toBe("/attualita/articolo/india-apa");
  });
});

describe("riconoscimento del documento e catena della fonte", () => {
  it("riconosce il PDF anche quando l'URL non ha estensione", () => {
    expect(isPdfUrl(PDF_INDIA)).toBe(true);
    expect(isPdfUrl("https://esempio.gov/atti/documento.pdf")).toBe(true);
    expect(isPdfUrl("https://esempio.gov/atti/doc.PDF?download=1")).toBe(true);
    expect(isPdfUrl("https://www.oecd.org")).toBe(false);
    expect(isPdfUrl("https://esempio.gov/pdf-viewer/istruzioni")).toBe(false);
  });

  it("non duplica il collegamento quando fonte e PDF sono la stessa URL", () => {
    const links = buildSourceLinks(makeItem({ pdfUrl: PDF_INDIA }));

    expect(links).toHaveLength(1);
    expect(links[0].kind).toBe("PDF");
    expect(links[0].label).toBe("Scarica il PDF ufficiale");
  });

  it("tratta come identiche due URL che differiscono solo per la barra finale", () => {
    const links = buildSourceLinks(
      makeItem({ originalUrl: "https://esempio.gov/atto/", pdfUrl: "https://esempio.gov/atto" }),
    );

    expect(links).toHaveLength(1);
  });

  it("mostra prima il PDF e poi la pagina, quando sono documenti distinti", () => {
    const links = buildSourceLinks(
      makeItem({ originalUrl: "https://esempio.gov/comunicato", pdfUrl: PDF_INDIA }),
    );

    expect(links.map((link) => link.kind)).toEqual(["PDF", "PAGINA"]);
    expect(links[1].label).toBe("Apri la pagina ufficiale");
  });

  it("chiama documento ufficiale la pagina su cui l'articolo è basato quando non c'è PDF", () => {
    const links = buildSourceLinks(makeItem({ originalUrl: "https://esempio.gov/comunicato" }));

    expect(links).toHaveLength(1);
    expect(links[0].label).toBe("Apri la pagina ufficiale");
  });

  it("non produce collegamenti da una URL non http", () => {
    expect(buildSourceLinks(makeItem({ originalUrl: "javascript:alert(1)" }))).toHaveLength(0);
  });
});

describe("card: rinvio all'articolo, non alla fonte", () => {
  const item = makeItem({ slug: "india-rapporto-apa-2025-26", pdfUrl: PDF_INDIA });

  it("collega la card all'articolo interno", () => {
    const markup = renderToStaticMarkup(<NewsCard item={item} />);

    expect(markup).toContain('href="/attualita/articolo/india-rapporto-apa-2025-26"');
    expect(markup).toContain("Leggi l&#x27;articolo");
  });

  it("non porta fuori dal sito e non usa più l'etichetta generica", () => {
    const markup = renderToStaticMarkup(<NewsCard item={item} />);

    expect(markup).not.toContain("incometaxindia.gov.in");
    expect(markup).not.toContain("Apri la fonte originale");
  });

  it("vale anche per la variante in evidenza e per quella compatta", () => {
    for (const variant of ["featured", "compact"] as const) {
      const markup = renderToStaticMarkup(<NewsCard item={item} variant={variant} />);
      expect(markup).toContain('href="/attualita/articolo/india-rapporto-apa-2025-26"');
      expect(markup).not.toContain("incometaxindia.gov.in");
    }
  });
});

describe("blocco fonte nella pagina articolo", () => {
  it("porta un solo collegamento al PDF ufficiale, con l'etichetta giusta", () => {
    const markup = renderToStaticMarkup(<SourceBlock item={makeItem({ pdfUrl: PDF_INDIA })} />);

    expect(markup).toContain("Scarica il PDF ufficiale");
    expect(markup).toContain(PDF_INDIA);
    expect(markup).not.toContain("Apri la pagina ufficiale");
    expect(markup.split(PDF_INDIA).length - 1).toBe(1);
  });

  it("dichiara l'assenza invece di lasciare il lettore senza fonte", () => {
    const markup = renderToStaticMarkup(
      <SourceBlock item={makeItem({ originalUrl: "javascript:alert(1)" })} />,
    );

    expect(markup).toContain("Documento ufficiale non disponibile");
  });
});

describe("corpo dell'articolo", () => {
  it("rende titoli, paragrafi, elenchi e grassetto", () => {
    const markup = renderToStaticMarkup(
      <ArticleBody
        markdown={
          "## Quadro\n\nPrimo capoverso.\n\n- prima voce\n- seconda voce\n\nTesto **rilevante** finale."
        }
      />,
    );

    expect(markup).toContain("<h2");
    expect(markup).toContain("Quadro");
    expect(markup).toContain("<li");
    expect(markup).toContain("seconda voce");
    expect(markup).toContain("<strong>rilevante</strong>");
  });

  it("non inietta HTML presente nel testo", () => {
    const markup = renderToStaticMarkup(
      <ArticleBody markdown={"<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>"} />,
    );

    expect(markup).not.toContain("<script>");
    expect(markup).not.toContain("<img");
  });
});

describe("mappatura delle righe reali", () => {
  const row = {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Titolo reale",
    summary: "Sommario",
    geo: "GLOBALE",
    topic: "APA e MAP",
    source_url: PDF_INDIA,
    pdf_url: PDF_INDIA,
    published_at: "2026-08-04",
    slug: "titolo-reale-1a2b3c4d",
    content_markdown: "## Sezione\n\nCorpo dell'articolo.",
  };

  it("porta slug e corpo dell'articolo nel modello di dominio", () => {
    const item = mapRow(newsRowSchema.parse(row));

    expect(item?.slug).toBe("titolo-reale-1a2b3c4d");
    expect(item?.body).toContain("Corpo dell'articolo.");
  });

  it("resta linkabile anche se la vista non espone lo slug", () => {
    const { slug: _omitted, ...senzaSlug } = row;
    const item = mapRow(newsRowSchema.parse(senzaSlug));

    expect(item).not.toBeNull();
    expect(articleSlug(item as NewsItem)).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("coerenza fra il collegamento nella card e la pagina articolo", () => {
  it("ogni voce demo pubblicata è raggiungibile con lo slug che la card usa", async () => {
    const pubblicate = DEMO_NEWS_ITEMS.filter((item) => item.workflowState === "PUBLISHED");

    expect(pubblicate.length).toBeGreaterThan(0);
    for (const item of pubblicate) {
      const trovato = await mockNewsRepo.getBySlug(articleSlug(item));
      expect(trovato?.id, `slug irraggiungibile: ${articleSlug(item)}`).toBe(item.id);
    }
  });

  it("nessuno slug demo è duplicato", () => {
    const slugs = DEMO_NEWS_ITEMS.map((item) => articleSlug(item));

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uno slug inesistente non restituisce un articolo a caso", async () => {
    expect(await mockNewsRepo.getBySlug("slug-che-non-esiste")).toBeNull();
  });

  it("l'articolo demo dell'India porta con sé corpo redazionale e PDF ufficiale", async () => {
    const articolo = await mockNewsRepo.getBySlug("india-rapporto-apa-2025-26");

    expect(articolo?.body).toContain("ottavo rapporto annuale");
    expect(buildSourceLinks(articolo!)).toHaveLength(1);
  });

  it("il sommario dell'India non attribuisce al rapporto APA il safe harbour IT", async () => {
    const articolo = await mockNewsRepo.getBySlug("india-rapporto-apa-2025-26");

    expect(articolo?.summary).not.toContain("15,5%");
    expect(articolo?.body).not.toContain("15,5%");
  });
});
