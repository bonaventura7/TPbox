import { describe, expect, test, vi } from "vitest";

import {
  handleDocumentRequest,
  isAllowedDocumentHost,
} from "../../src/lib/company-finder/document-proxy.server";

describe("German document proxy", () => {
  test("allows the official German registry host", () => {
    expect(isAllowedDocumentHost(new URL("https://www.unternehmensregister.de/de/suche"))).toBe(
      true,
    );
  });

  test("rejects an untrusted redirect host", () => {
    expect(isAllowedDocumentHost(new URL("https://example.com/file.pdf"))).toBe(false);
  });

  test("serves registry HTML from TPbox without external redirect", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () =>
        new Response("<html><body>registry page</body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    ) as typeof fetch;

    try {
      const response = await handleDocumentRequest(
        new Request(
          "https://t-pbox.vercel.app/api/company-finder/document?url=" +
            encodeURIComponent(
              "https://www.unternehmensregister.de/de/veroeffentlichung?payload=test",
            ),
        ),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("content-disposition")).toBe('inline; filename="bilancio.html"');
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-type") ?? "").toContain("text/html");
      expect(await response.text()).toContain("registry page");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
