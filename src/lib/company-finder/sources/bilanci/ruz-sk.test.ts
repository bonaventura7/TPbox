import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRuzAttachmentUrl, fetchRuzCompanyByDic, fetchRuzCompanyByIco, filterStatementsByYears, normalizeRuzDic, normalizeRuzIco, parseRuzAccountingEntity, parseRuzFinancialStatement, parseRuzReport, resolveRuzIcoByName } from "./ruz-sk";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Slovacchia — RÚZ", () => {
  it("normalizes IČO and DIČ", () => { expect(normalizeRuzIco("SK 00 603 481")).toBe("00603481"); expect(normalizeRuzDic("SK 2020372596")).toBe("2020372596"); expect(normalizeRuzIco("1234567")).toBeUndefined(); });
  it("builds the official attachment URL", () => { expect(buildRuzAttachmentUrl(7172581)).toBe("https://www.registeruz.sk/cruz-public/domain/financialreport/attachment/7172581"); });
  it("parses entity, statement and PDF report", () => {
    expect(parseRuzAccountingEntity({ id:336953, ico:"00603481", nazovUJ:"Bratislava", mesto:"Bratislava", ulica:"Primaciálne námestie 1", psc:"81499", idUctovnychZavierok:[340867] })).toMatchObject({ id:336953, ico:"00603481", name:"Bratislava", statementIds:[340867] });
    expect(parseRuzFinancialStatement({ id:340867, obdobieDo:"2025-12", idUctovnychVykazov:[686260] })).toMatchObject({ id:340867, periodEnd:"2025-12", reportIds:[686260] });
    expect(parseRuzReport({ id:686260, prilohy:[{ id:7172581, meno:"Bilancia.pdf", mimeType:"application/pdf" }, { id:123, meno:"data.xml", mimeType:"application/xml" }] })).toEqual({ id:686260, attachments:[{ id:7172581, name:"Bilancia.pdf", mimeType:"application/pdf" }] });
  });
  it("traverses IČO to statements to reports to internal PDF", async () => {
    const payloads = new Map([
      ["/cruz-public/api/uctovne-jednotky?zmenene-od=2000-01-01&ico=00603481&max-zaznamov=100", { id:[336953] }],
      ["/cruz-public/api/uctovna-jednotka?id=336953", { id:336953, ico:"00603481", nazovUJ:"Bratislava", idUctovnychZavierok:[340867] }],
      ["/cruz-public/api/uctovna-zavierka?id=340867", { id:340867, obdobieDo:"2025-12", idUctovnychVykazov:[686260] }],
      ["/cruz-public/api/uctovny-vykaz?id=686260", { id:686260, prilohy:[{ id:7172581, meno:"Bilancia.pdf", mimeType:"application/pdf" }] }],
    ]);
    vi.stubGlobal("fetch", vi.fn(async (input:string|URL) => { const u=new URL(String(input)); const p=payloads.get(`${u.pathname}${u.search}`); return p ? new Response(JSON.stringify(p), { status:200 }) : new Response("missing", { status:404 }); }));
    const result=await fetchRuzCompanyByIco("00603481");
    expect(result.ok).toBe(true); expect(result.data?.company.name).toBe("Bratislava"); expect(result.data?.financials.documents[0]).toMatchObject({ year:2025, downloadUrl:"/api/company-finder/ruz-document?attachment=7172581&download=1" });
  });
  it("uses the official DIČ filter", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input:string|URL) => { const u=new URL(String(input)); if(u.pathname.endsWith("/uctovne-jednotky") && u.searchParams.get("dic")==="2020372596") return new Response(JSON.stringify({ id:[336953] }), { status:200 }); if(u.pathname.endsWith("/uctovna-jednotka")) return new Response(JSON.stringify({ id:336953, ico:"00603481", nazovUJ:"Bratislava", idUctovnychZavierok:[] }), { status:200 }); throw new Error("unexpected URL"); }));
    await expect(fetchRuzCompanyByDic("SK2020372596")).resolves.toMatchObject({ ok:true, data:{ company:{ ico:"00603481" } } });
  });
  it("resolves a Slovak name to IČO through GLEIF", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input:string|URL) => {
      const u=new URL(String(input));
      if(u.hostname!=="api.gleif.org") throw new Error("RÚZ should not be called");
      return new Response(JSON.stringify({ data:[{ attributes:{ lei:"549300EXAMPLE", entity:{ legalName:{ name:"Bratislava" }, legalAddress:{ country:"SK" }, registeredAs:"00603481" } } }] }), { status:200 });
    }));
    await expect(resolveRuzIcoByName("Bratislava")).resolves.toBe("00603481");
  });
  it("fails closed on malformed IČO", async () => { const spy=vi.fn(); vi.stubGlobal("fetch", spy); const result=await fetchRuzCompanyByIco("1234567"); expect(result.ok).toBe(false); expect(spy).not.toHaveBeenCalled(); });
});

describe("RÚZ — filtro per esercizio", () => {
  const statements = [
    { id: 3, periodEnd: "2024-12", reportIds: [30] },
    { id: 2, periodEnd: "2023-12", reportIds: [20] },
    { id: 1, periodEnd: "2022-12", reportIds: [10] },
  ];

  it("senza anni richiesti restituisce tutto, dal più recente", () => {
    expect(filterStatementsByYears(statements, undefined).map((s) => s.id)).toEqual([3, 2, 1]);
  });

  it("con anni richiesti restituisce solo quelli", () => {
    expect(filterStatementsByYears(statements, [2023]).map((s) => s.id)).toEqual([2]);
  });

  it("ignora gli anni non depositati senza fallire", () => {
    expect(filterStatementsByYears(statements, [2023, 1999]).map((s) => s.id)).toEqual([2]);
  });

  it("scarta i bilanci senza periodEnd leggibile", () => {
    const withBroken = [...statements, { id: 4, reportIds: [40] }];
    expect(filterStatementsByYears(withBroken, [2024]).map((s) => s.id)).toEqual([3]);
  });

  it("ordina dal più recente anche se l'input arriva in ordine sparso", () => {
    const scrambled = [
      { id: 1, periodEnd: "2022-12", reportIds: [10] },
      { id: 4, periodEnd: "2025-12", reportIds: [40] },
      { id: 2, periodEnd: "2023-12", reportIds: [20] },
      { id: 3, periodEnd: "2024-12", reportIds: [30] },
    ];
    expect(filterStatementsByYears(scrambled, undefined).map((s) => s.id)).toEqual([4, 3, 2, 1]);
  });

  it("un array di anni vuoto equivale a nessun filtro", () => {
    expect(filterStatementsByYears(statements, []).map((s) => s.id)).toEqual([3, 2, 1]);
  });
});
