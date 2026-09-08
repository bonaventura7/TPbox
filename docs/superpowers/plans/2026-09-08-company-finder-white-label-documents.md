# Company Finder White-Label Document Acquisition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make German balance-sheet documents behave as TPbox-hosted downloads instead of proxied third-party HTML.

**Architecture:** Keep Company Finder server-side for discovery and retrieval. German registry HTML is never embedded; document retrieval either returns a validated PDF from the same-origin TPbox document route or a controlled machine-readable error. The UI shows only TPbox document labels and download actions.

**Tech Stack:** TanStack Start/Router, TypeScript, Vercel serverless functions, GitHub-based deployment.

**Spec:** `docs/superpowers/specs/2026-09-08-company-finder-white-label-documents-design.md`

## Global Constraints

- Browser requests must remain same-origin to TPbox for downloadable documents.
- Provider credentials, cookies, payloads, and upstream HTML must stay server-side.
- Only allowlisted HTTPS document hosts may be fetched; redirects are also allowlist-checked.
- A document is downloadable only when the backend has actual binary document bytes.
- Do not embed third-party registry HTML in an iframe.
- Return explicit JSON 4xx/5xx errors instead of masking upstream document failures as TPbox 404 pages.

---

### Task 1: Lock the regression behavior

**Files:**
- Create: `tests/company-finder/document-proxy.test.ts`
- Modify: `src/lib/company-finder/document-proxy.server.ts`

**Interfaces:**
- Consumes: `handleDocumentRequest(request: Request)` and `isAllowedDocumentHost(url: URL)`.
- Produces: deterministic behavior where an HTML-only upstream document is redirected to the final allowlisted source or rejected, never served as a TPbox document body.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";

import { isAllowedDocumentHost } from "../../src/lib/company-finder/document-proxy.server";

describe("German document proxy", () => {
  test("allows the official German registry host", () => {
    expect(isAllowedDocumentHost(new URL("https://www.unternehmensregister.de/de/suche"))).toBe(true);
  });

  test("rejects an untrusted redirect host", () => {
    expect(isAllowedDocumentHost(new URL("https://example.com/file.pdf"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails or identifies the current integration gap**

Run: `npm test -- tests/company-finder/document-proxy.test.ts`
Expected: the test runner executes; if the exported allowlist check already passes, use the second test in this task as the failing regression for HTML handling before implementation.

- [ ] **Step 3: Add the minimal HTML-handling regression test**

```ts

test("does not treat registry HTML as a downloadable document", async () => {
  const response = await handleDocumentRequest(
    new Request(
      "https://t-pbox.vercel.app/api/company-finder/document?url=" +
        encodeURIComponent("https://www.unternehmensregister.de/de/veroeffentlichung?payload=test"),
    ),
  );
  expect([302, 502]).toContain(response.status);
  expect(response.headers.get("content-type") ?? "").not.toContain("text/html");
});
```

- [ ] **Step 4: Run the regression test and record the observed result before implementation**

Run: `npm test -- tests/company-finder/document-proxy.test.ts`
Expected: current implementation may fail because upstream behavior is environment-dependent; the failure must identify HTML being served or an unresolved upstream fetch rather than a test typo.

- [ ] **Step 5: Commit the tests**

```bash
git add tests/company-finder/document-proxy.test.ts
git commit -m "test(company-finder): cover German document proxy HTML handling"
```

---

### Task 2: Ensure production document semantics are binary-or-redirect

**Files:**
- Modify: `src/lib/company-finder/document-proxy.server.ts`

**Interfaces:**
- Consumes: upstream registry responses and session cookies.
- Produces: PDF bytes for real documents; a 302 to the final official URL only when the response is HTML and no PDF link can be discovered; never returns third-party HTML as the body of the TPbox document route.

- [ ] **Step 1: Implement the minimal semantic rule**

Use the already established `html(...)`, `pdf(...)`, `fetchRaw(...)`, and `redirectTo(...)` helpers. In the HTML branch, after all allowlisted PDF candidates fail, return `redirectTo(first.finalUrl)`; do not call `serve(first, wantDownload)`.

- [ ] **Step 2: Preserve download behavior for true PDF responses**

Keep `serve(first, wantDownload)` only for binary PDF/octet-stream/XML/ZIP document payloads validated by content type or PDF magic bytes.

- [ ] **Step 3: Run the focused tests**

Run: `npm test -- tests/company-finder/document-proxy.test.ts`
Expected: PASS for host allowlisting and HTML non-proxy semantics.

- [ ] **Step 4: Run the project test suite**

Run: `npm test`
Expected: PASS with no new failures.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/lib/company-finder/document-proxy.server.ts tests/company-finder/document-proxy.test.ts
git commit -m "fix(company-finder): never proxy German registry HTML as document"
```

---

### Task 3: Keep the Company Finder UI white-label

**Files:**
- Modify: `src/routes/tool.company-finder.tsx`

**Interfaces:**
- Consumes: `Financials.documents[].downloadUrl` and `Financials.documentUrl`.
- Produces: only TPbox labels/actions in the rendered result; no upstream URL is presented as a normal document destination.

- [ ] **Step 1: Add a UI regression assertion or narrow rendering test if the project has an existing component-test pattern**

Search the current test conventions first with `find`/GitHub search for `tool.company-finder` and `FinancialsCard` tests. Reuse the existing framework rather than introducing a new test dependency.

- [ ] **Step 2: Remove any user-visible provider label from the document action for this flow**

For downloadable German documents, use labels such as `Bilancio 2024` and `Scarica bilancio`. Do not render the external URL string.

- [ ] **Step 3: Ensure the document viewer is not an iframe to a third-party HTML page**

When `financials.documentUrl` refers to a same-origin PDF endpoint it may be rendered; otherwise rely on the download action instead of embedding upstream registry HTML.

- [ ] **Step 4: Run the project tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/tool.company-finder.tsx
git commit -m "fix(company-finder): keep German documents white-label"
```

---

### Task 4: Deploy and verify end-to-end

**Files:**
- No source changes unless verification reveals a concrete defect.

**Interfaces:**
- Consumes: `main` production deployment.
- Produces: verified production Company Finder page and verified document route behavior.

- [ ] **Step 1: Push `main` and wait for a Vercel READY deployment**

Use the existing GitHub-to-Vercel integration. Do not claim completion while the deployment is `BUILDING` or `QUEUED`.

- [ ] **Step 2: Verify the production page**

Request: `https://t-pbox.vercel.app/tool/company-finder`
Expected: HTTP 200.

- [ ] **Step 3: Verify the document route without a URL**

Request: `https://t-pbox.vercel.app/api/company-finder/document`
Expected: HTTP 400 with JSON `{ "error": "url mancante" }`.

- [ ] **Step 4: Inspect production runtime logs for the document route**

Filter logs by `requestPath`/`query=company-finder/document` and check for the previous `_next/*` HTML-asset 404 pattern. Expected: no browser-side cascade of third-party `_next/*` requests caused by the document route.

- [ ] **Step 5: Verify a real German search result**

Use the existing Company Finder Germany example and confirm the result contains a TPbox same-origin document action rather than an embedded Unternehmensregister HTML page.

- [ ] **Step 6: Run build-log verification**

Expected: no build errors and deployment state `READY`.

- [ ] **Step 7: Only then report completion**

State exactly which checks were observed and distinguish verified behavior from any upstream limitation that could not be reproduced from the deployment environment.
