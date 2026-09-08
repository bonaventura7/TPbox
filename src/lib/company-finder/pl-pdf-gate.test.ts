import { describe, expect, it } from "vitest";

import { isPdfResponse } from "./pl-pdf-gate";

describe("Poland PDF response gate", () => {
  it("accepts AVIO POLSKA 2024 when the body really starts with %PDF-", async () => {
    const response = new Response("%PDF-1.7\nAVIO POLSKA 2024", {
      status: 200,
      headers: { "content-type": "application/pdf" },
    });

    await expect(isPdfResponse(response)).resolves.toBe(true);
  });

  it("rejects an HTML/WAF challenge even when content-type claims PDF", async () => {
    const response = new Response("<html><title>Incapsula</title>", {
      status: 200,
      headers: { "content-type": "application/pdf" },
    });

    await expect(isPdfResponse(response)).resolves.toBe(false);
  });
});
