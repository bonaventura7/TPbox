# Norway Company Finder Design

## Objective

Upgrade Norway (`NO`) from live company-profile-only support to the same operational class as Estonia: live official registry lookup plus automatic retrieval of official annual-report PDFs, all surfaced inside TPbox.

## Official sources

- Enhetsregisteret: `https://api.brreg.no/enhetsregisteret/api/enheter` and `https://data.brreg.no/enhetsregisteret/api/enheter` for company identity and open registry data.
- Regnskapsregisteret annual-report API: `https://data.brreg.no/regnskapsregisteret/regnskap/aarsregnskap/kopi/{orgnr}/aar` returns the years for which an annual-report copy exists; `https://data.brreg.no/regnskapsregisteret/regnskap/aarsregnskap/kopi/{orgnr}/{aar}` returns the annual report as PDF.
- Brønnøysundregistrene documents that the annual-report-copy API is public and supports the latest 15 years.

## Request flow

1. Normalize input. Norway organization numbers are exactly 9 digits locally; an input such as `NO123456789` maps to local org.nr `123456789`.
2. Run the existing `brreg` Enhetsregisteret adapter to build `CompanyProfile`.
3. For an explicit 9-digit org.nr, run `fin-brreg` in parallel and ask Regnskapsregisteret for the available annual-report years.
4. Convert each year to a `FinancialDocumentSummary` with `DOCUMENT_DOWNLOADABLE` availability and an internal TPbox URL:
   `/api/company-finder/document?country=NO&company=<orgnr>&year=<year>`.
5. The internal document route fetches the official PDF server-side, verifies the `%PDF-` magic bytes, and returns the bytes inline or as an attachment. The browser never redirects to the Norwegian registry.

## Name-only behavior

The current Company Finder can resolve Norway by name through Enhetsregisteret, but the financial route must not fabricate an organization number from the name. Name-only searches therefore return profile data and a clear financial skipped state unless an explicit org.nr/VAT is available. This mirrors the project's fail-closed principle.

## Resilience

- Company lookup keeps the existing two-host fallback: `api.brreg.no` then `data.brreg.no`.
- Annual-report financial lookup uses the official `data.brreg.no` Regnskapsregisteret endpoint with a bounded timeout.
- A financial upstream failure does not fail the company-profile lookup; it produces a failed/skipped financial source status.
- Invalid org.nr/year are rejected before any upstream call.
- Empty year lists are valid and produce `available: false` without an invented document.

## UX/data contract

`countries.ts` must declare Norway financials as free/automatic. `coverage.ts` must move `NO` into `AUTO_ISOS` and remove it from `CONSULT_PAGES`. `orchestrator.ts` must register `FINANCIALS_ROUTES.NO` and give it automatic-document precedence. All document links exposed to the client must be internal TPbox links.

## Acceptance criteria

- A valid Norwegian org.nr produces a live company profile from Enhetsregisteret.
- The same search returns a financial source backed by Regnskapsregisteret.
- Available annual-report years are listed newest-first.
- A generated internal document URL returns the official PDF with `Content-Type: application/pdf`.
- `download=1` returns `Content-Disposition: attachment`.
- Malformed org.nr/year returns HTTP 400 without an upstream request.
- An upstream 404/5xx is surfaced as a controlled source failure, not a runtime crash.
- Norway is shown as automatically covered/free in the Company Finder capability metadata.
