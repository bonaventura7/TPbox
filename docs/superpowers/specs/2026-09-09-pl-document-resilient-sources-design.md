# Poland Financial Document Retrieval — Resilient Sources Design

## Goal
Make the Company Finder Poland (PL/KRS) annual-report download resilient to upstream 403/WAF failures by orchestrating multiple lawful retrieval sources, validating the returned binary, preserving provenance, and exposing a deterministic official-browser fallback when server-side sources are unavailable.

## Context
The current PL route calls the official KRS RDF viewer directly. In production, the upstream RDF session currently returns HTTP 403 from the server-side runtime, so the application correctly refuses to return the response as a PDF. The existing `%PDF-` gate prevents an HTML/WAF response from being mislabeled as a PDF, but it leaves the user without a successful document path.

The target behavior is free-first with a configurable reliability fallback:
1. Try the official KRS RDF adapter first.
2. If that fails or returns a non-PDF, try an openly accessible public mirror that exposes the requested filing.
3. If configured, try a licensed provider API for higher reliability.
4. Never bypass CAPTCHA/WAF/security challenges.
5. If all server-side sources fail, return a structured `official-browser` fallback with provenance rather than an opaque 502.

## Architecture

### 1. Source orchestration
Introduce a PL-specific orchestrator with a stable result contract. Each source adapter is responsible only for acquisition; the orchestrator controls priority, timeouts, validation, and fallback.

Conceptual flow:

`KRS -> year -> source orchestrator -> official RDF -> public mirror -> licensed provider -> official browser fallback`

The orchestrator returns:
- `ok`
- `source` (`krs-rdf`, `aleo`, `provider`, or `official-browser`)
- `bytes` when a server-side PDF is available
- `contentType`
- `filename`
- `provenanceUrl`
- a stable `errorCode` / human-readable `error`

### 2. Official RDF adapter
Keep the existing `poland-rdf.ts` as the official KRS acquisition adapter. No anti-bot bypass is added. The adapter can fail fast on upstream 401/403/timeouts and the orchestrator then proceeds to the next lawful source.

### 3. Public mirror adapter
Add an adapter for an openly reachable mirror such as ALEO. It should:
- search by KRS and requested year using the mirror's public page;
- discover the PDF link for the annual financial report;
- fetch the PDF server-side;
- enforce a strict PDF magic-byte check;
- return the canonical mirror page as provenance.

The adapter must not scrape authenticated/private content or defeat anti-bot mechanisms. If the mirror itself responds with a challenge page, it is treated as a source failure and the orchestrator continues.

### 4. Optional licensed-provider adapter
Add an environment-configured provider interface rather than hard-coding one vendor. A provider is enabled only when its base URL and API key are present. The adapter must expose the same normalized result contract as the public mirror.

Suggested environment variables:
- `PL_DOCUMENT_PROVIDER_URL`
- `PL_DOCUMENT_PROVIDER_API_KEY`

No provider dependency is required for the free-first path.

### 5. PDF validation
Centralize validation in `pl-pdf-gate.ts`:
- HTTP response must be successful;
- content must begin with `%PDF-`;
- maximum size remains bounded;
- content type may be corrected to `application/pdf` only after magic-byte validation.

A successful HTTP response containing HTML, JSON, or an anti-bot page is never accepted as a document.

### 6. Route integration
Update `/api/company-finder/document` for `country=PL` so it calls the orchestrator instead of directly calling the RDF adapter. Successful results continue to stream inline/download as PDF. Failed resolution returns a structured JSON response containing:
- `fallback: "official-browser"`
- `sourceAttempts`
- `provenance` when available
- an official KRS browser URL that the UI can open manually.

### 7. Caching and Supabase
Do not make Supabase a hard dependency for the first delivery. The retrieval path must work without a database. The architecture leaves a clean seam for a later Supabase cache/audit layer using document checksum, KRS, year, source, and retrieval timestamp. This keeps the critical path simple and avoids adding a new failure domain while the source strategy is proven.

## Error handling

Each adapter maps failures into categories (`not-found`, `forbidden`, `challenge`, `timeout`, `invalid-pdf`, `upstream`, `configuration`). The orchestrator continues to the next source for recoverable acquisition failures. Invalid PDF content is always terminal for that source but not for the overall orchestration.

The route must not expose secrets, authorization headers, or raw provider errors. Logs may contain source names and status codes, but not API keys.

## Testing

Use TDD for the new behavior:
1. Unit tests for adapter URL construction and response parsing.
2. Unit tests for HTML/challenge rejection and valid `%PDF-` acceptance.
3. Orchestrator tests proving source order and fallback behavior.
4. Route-level tests proving successful PDF response and structured browser fallback.
5. Existing CI checks must continue to pass.
6. Production verification should exercise the known acceptance case `KRS=0000002594`, year `2024` and confirm that the route no longer fails solely because official RDF returns 403 when a public fallback is available.

## Non-goals
- CAPTCHA or WAF bypass.
- Browser automation against protected challenge pages.
- Mandatory Supabase persistence in the first iteration.
- Broad refactoring of unrelated Company Finder countries.
