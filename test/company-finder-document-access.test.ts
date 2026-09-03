import { describe, expect, it } from "vitest";

import { ALL_COUNTRIES } from "../src/lib/company-finder/countries";
import {
  DOCUMENT_ACCESS,
  documentAccessFor,
  documentTierFor,
  isOffered,
  type AccessInfo,
} from "../src/lib/company-finder/document-access";
import { isCovered } from "../src/lib/company-finder/coverage";
import { officialPageFor } from "../src/lib/company-finder/official-pages";

/**
 * La macchina a stati di document-access.ts è la promessa che il tool fa
 * all'utente: DOCUMENT_AVAILABLE / LIST_ONLY / SOURCE_RESTRICTED /
 * REGISTRY_ONLY. Questi test impediscono che uno stato venga promesso senza
 * la prova che lo giustifica, o che un paese ristretto finisca in un iframe.
 */

const TIERS = ["document", "list", "restricted", "registry"] as const;

describe("macchina a stati dell'accesso al documento", () => {
  it("copre esattamente i paesi del catalogo, uno stato ciascuno", () => {
    const catalog = new Set(ALL_COUNTRIES.map((c) => c.iso));
    const classified = Object.keys(DOCUMENT_ACCESS);
    for (const iso of classified) {
      expect(catalog.has(iso), `${iso} classificato ma non in catalogo`).toBe(true);
      expect(TIERS).toContain(DOCUMENT_ACCESS[iso]!.tier);
    }
    for (const country of ALL_COUNTRIES) {
      expect(
        DOCUMENT_ACCESS[country.iso],
        `${country.iso} senza classificazione: la macchina non ammette buchi`,
      ).toBeDefined();
    }
  });

  it("ogni stato porta la sua prova, scritta per l'utente", () => {
    for (const [iso, info] of Object.entries(DOCUMENT_ACCESS) as [string, AccessInfo][]) {
      expect(info.reason.length, `prova mancante per ${iso}`).toBeGreaterThan(40);
    }
  });

  it("Ungheria, Grecia, Polonia e Croazia sono SOURCE_RESTRICTED, con motivo", () => {
    for (const iso of ["HU", "GR", "PL", "HR"]) {
      expect(documentTierFor(iso), iso).toBe("restricted");
    }
    // HU: la prova nomina il CAPTCHA e le condizioni che vietano gli anonimizzatori.
    expect(documentAccessFor("HU")!.reason).toMatch(/CAPTCHA/);
    expect(documentAccessFor("HU")!.reason).toMatch(/sessione/);
  });

  it("le pagine dei paesi ristretti non finiscono mai in un iframe", () => {
    for (const [iso, info] of Object.entries(DOCUMENT_ACCESS)) {
      if (info.tier !== "restricted" || !info.consult) continue;
      expect(info.consult.browserOnly, `${iso} ristretto ma incorporabile`).toBe(true);
    }
  });

  it("l'Ungheria dichiara il canale massivo ufficiale come via residua", () => {
    const hu = documentAccessFor("HU")!;
    expect(hu.bulk?.url).toContain("e-beszamolo.im.gov.hu");
    expect(hu.bulk?.note).toMatch(/2016/);
  });

  it("la pagina ufficiale HU punta alla ricerca e racconta i limiti veri", () => {
    const page = officialPageFor("HU", "", "OTP Bank");
    expect(page).toBeDefined();
    expect(page!.url).toBe("https://e-beszamolo.im.gov.hu/oldal/beszamolo_kereses");
    expect(page!.mode).toBe("external");
    expect(page!.actionLabel).toBe("Apri il registro ufficiale");
    expect(page!.note).toMatch(/CAPTCHA/);
    expect(page!.note).toMatch(/sessione/);
    expect(page!.note).toMatch(/beszamolo_allomany_ertekesitese/);
    expect((page!.instructions ?? []).length).toBeGreaterThan(2);
  });

  it("i paesi 'registry' non sono offerti e non inventano una pagina", () => {
    for (const [iso, info] of Object.entries(DOCUMENT_ACCESS)) {
      if (info.tier !== "registry") continue;
      expect(isOffered(iso), iso).toBe(false);
      expect(isCovered(iso), iso).toBe(false);
      expect(officialPageFor(iso, "12345678", "Prova"), iso).toBeUndefined();
    }
  });

  it("i paesi ristretti restano offerti: il percorso umano esiste", () => {
    expect(isCovered("HU")).toBe(true);
    expect(isCovered("GR")).toBe(true);
    expect(isCovered("PL")).toBe(true);
    expect(isCovered("HR")).toBe(true);
  });
});
