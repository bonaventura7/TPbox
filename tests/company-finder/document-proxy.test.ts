import { describe, expect, test, vi } from "vitest";

import {
  handleDocumentRequest,
  isAllowedDocumentHost,
} from "../../src/lib/company-finder/document-proxy.server";

describe("German document proxy", () => {
  test("allows the official German registry host", () => {
    expect(
      isAllowedDocumentHost(
        new URL("https://www.unternehmensregister.de/de/suche"),
      ),
    ).toBe(true);
  });

  test("rejects an untrusted redirect host", () => {
    expect(isAllowedDocumentHost(new URL("https://example.com/file.pdf"))).toBe(
      false,
    );
  });

  test("does not treat registry HTML as a downloadable document", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("/de/suche")) {
        return new Response("<html><body>registry page</body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("<html><body>registry page</body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }) as typeof fetch;

    try {
      const response = await handleDocumentRequest(
        new Request(
          "https://t-pbox.vercel.app/api/company-finder/document?url=" +
            encodeURIComponent(
              "https://www.unternehmensregister.de/de/veroeffentlichung?payload=test",
            ),
        ),
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "unternehmensregister.de",
      );
      expect(response.headers.get("content-type") ?? "").not.toContain(
        "text/html",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
