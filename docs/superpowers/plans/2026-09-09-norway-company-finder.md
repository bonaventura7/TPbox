# Norway Company Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Norway a fully operational Company Finder provider using Brønnøysundregistrene for live company data and Regnskapsregisteret for official annual-report PDFs, following the existing Estonia pattern.

**Architecture:** Keep Norway's existing Enhetsregisteret adapter for identity data, add a dedicated server-side financial adapter for Regnskapsregisteret, expose documents through the existing internal `/api/company-finder/document` proxy, and update the country/coverage/orchestrator registry so Norway is treated as an automatic free-balance country. Use official endpoints only, with `api.brreg.no` followed by `data.brreg.no` as the existing resilience fallback.

**Tech Stack:** TypeScript, TanStack Start server routes, native `fetch`, Vitest, existing Company Finder `CompanyProfile` / `Financials` types, GitHub Actions CI, Vercel deployment.

**Spec:** `docs/superpowers/specs/2026-09-09-norway-company-finder-design.md`

## Global Constraints

- Use official Norwegian registry sources; do not scrape third-party aggregators.
- Do not embed the full ~1.1M-row registry dump in the Vercel application bundle.
- Follow the existing Estonia pattern: resolve company → fetch official profile → enumerate reports → expose an internal download URL.
- Keep server-side secrets out of client bundles.
- Preserve the existing `Financials` contract and internal document proxy architecture.
- Add regression tests before production code changes.

---

### Task 1: Add the design spec

**Files:**
- Create: `docs/superpowers/specs/2026-09-09-norway-company-finder-design.md`

- [ ] **Step 1: Write the design spec**

Document the official endpoints, request/response mapping, fallback sequence, invalid-input behavior, document proxy contract, and acceptance criteria.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-09-09-norway-company-finder-design.md
git commit -m "docs: add Norway company finder design"
```

### Task 2: Add failing financial-adapter tests

**Files:**
- Create: `src/lib/company-finder/sources/bilanci/brreg-no.test.ts`

**Interfaces:**
- Produces tests for `parseBrregAnnualYears(payload)` and `fetchBrregAnnualReports(orgnr)`.

- [ ] **Step 1: Write failing tests**

Cover: report-year extraction; deterministic descending sort; conversion to `FinancialDocumentSummary`; official PDF URL construction; HTTP failure handling; and 9-digit org.nr validation.

- [ ] **Step 2: Run the focused test**

Run:

```bash
npm test -- src/lib/company-finder/sources/bilanci/brreg-no.test.ts
```

Expected: FAIL because the financial adapter does not exist yet.

### Task 3: Implement the Norway financial adapter

**Files:**
- Create: `src/lib/company-finder/sources/bilanci/brreg-no.ts`

**Interfaces:**
- `fetchBrregAnnualReports(orgnr: string, timeoutMs?: number): Promise<BrregFinancialResult>`
- `brregAnnualReportUrl(orgnr: string, year: number): string`
- `parseBrregAnnualYears(payload: unknown): number[]`

- [ ] **Step 1: Implement the minimal adapter**

Use Regnskapsregisteret's year-list endpoint first; map each returned year to a `DOCUMENT_DOWNLOADABLE` annual-report document, expose an internal TPBox download URL, and use bounded timeouts. Validate org.nr as exactly nine digits.

- [ ] **Step 2: Run focused tests**

```bash
npm test -- src/lib/company-finder/sources/bilanci/brreg-no.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/company-finder/sources/bilanci/brreg-no.ts src/lib/company-finder/sources/bilanci/brreg-no.test.ts
git commit -m "feat: add Norway annual reports provider"
```

### Task 4: Add the internal Norway document proxy path

**Files:**
- Modify: `src/routes/api.company-finder.document.ts`
- Test: extend `src/lib/company-finder/sources/bilanci/brreg-no.test.ts`

**Interfaces:**
- Request: `/api/company-finder/document?country=NO&company=<9-digit-orgnr>&year=<YYYY>[&download=1]`
- Produces: official PDF bytes with `Content-Type: application/pdf` and safe content disposition.

- [ ] **Step 1: Add a failing proxy-contract test**

Verify a valid 9-digit company/year request resolves through `fetchBrregAnnualReportDocument` and rejects malformed org.nr/year before any upstream request.

- [ ] **Step 2: Run test and verify RED**

```bash
npm test -- src/lib/company-finder/sources/bilanci/brreg-no.test.ts
```

Expected: FAIL on the new contract.

- [ ] **Step 3: Implement the NO branch**

Fetch the official PDF bytes from the Regnskapsregisteret endpoint, verify `%PDF-` magic bytes, and return the bytes inline or as attachment. Never redirect the browser to the external registry.

- [ ] **Step 4: Run focused tests**

```bash
npm test -- src/lib/company-finder/sources/bilanci/brreg-no.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.company-finder.document.ts src/lib/company-finder/sources/bilanci/brreg-no.test.ts
git commit -m "feat: proxy Norway annual report PDFs"
```

### Task 5: Wire Norway into the Company Finder orchestration

**Files:**
- Modify: `src/lib/company-finder/orchestrator.ts`

**Interfaces:**
- Norway registry job remains `brreg`.
- Add financial job `fin-brreg` producing `Financials` from `fetchBrregAnnualReports`.

- [ ] **Step 1: Add failing orchestration tests**

Assert that a Norway search with a 9-digit org.nr returns both an Enhetsregisteret source and a financial source with downloadable annual-report documents.

- [ ] **Step 2: Run focused tests**

```bash
npm test -- test/company-finder-coverage.test.ts
```

Expected: FAIL because Norway is not yet connected to the financial route.

- [ ] **Step 3: Implement `FINANCIALS_ROUTES.NO`**

Use the org.nr from `ctx.localVat`; if only a company name is supplied, first use the existing `searchBrreg` result and its registry id cannot be consumed by a separate FIN job, so keep the initial scope to explicit org.nr/VAT and preserve a clear skipped state for name-only financial lookup rather than fabricating an identifier.

- [ ] **Step 4: Update result precedence and automatic coverage**

Make `fin-brreg` rank with the other automatic-document providers; ensure returned `documents[].downloadUrl` is the internal TPBox URL.

- [ ] **Step 5: Run focused tests**

```bash
npm test -- test/company-finder-coverage.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/company-finder/orchestrator.ts test/company-finder-coverage.test.ts
git commit -m "feat: wire Norway financials into company finder"
```

### Task 6: Update country capability and coverage metadata

**Files:**
- Modify: `src/lib/company-finder/countries.ts`
- Modify: `src/lib/company-finder/coverage.ts`
- Test: `test/company-finder-coverage.test.ts`

- [ ] **Step 1: Add failing assertions**

Assert Norway reports `financials.free === true` and belongs to `AUTO_ISOS`, with wording that describes official automatic retrieval rather than browser consultation.

- [ ] **Step 2: Verify RED**

```bash
npm test -- test/company-finder-coverage.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Update metadata**

Set Norway's capability to automatic/free, remove it from consultation-only coverage, and keep the official source label aligned with Regnskapsregisteret.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- test/company-finder-coverage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/company-finder/countries.ts src/lib/company-finder/coverage.ts test/company-finder-coverage.test.ts
git commit -m "feat: mark Norway balance coverage automatic"
```

### Task 7: Add source and integration regression coverage

**Files:**
- Create: `test/company-finder-no-regression.test.ts`

- [ ] **Step 1: Add tests**

Use mocked `fetch` only at the network boundary to cover: successful org.nr lookup + annual reports, no-report response, upstream 404, malformed org.nr, and internal download URL shape.

- [ ] **Step 2: Run focused tests**

```bash
npm test -- test/company-finder-no-regression.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add test/company-finder-no-regression.test.ts
git commit -m "test: cover Norway company finder integration"
```

### Task 8: Documentation and verification

**Files:**
- Modify: `docs/superpowers/IMPLEMENTATION-CONTROL.md` only if the project control log requires this change.

- [ ] **Step 1: Run the full static suite**

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Push the feature branch**

```bash
git push -u origin feat/norway-company-finder
```

- [ ] **Step 3: Open a PR into `main`**

PR title: `feat(company-finder): add automatic Norway registry and annual reports`

- [ ] **Step 4: Verify GitHub Actions**

Require the repository CI checks for the PR to pass before considering the change deployable.

- [ ] **Step 5: Verify Vercel preview**

Open `/tool/company-finder`, select Norway, run an org.nr lookup, and verify the source panel reports Brønnøysundregistrene plus downloadable annual reports without leaving TPbox.

- [ ] **Step 6: Verify a document request**

Open one generated internal `downloadUrl`; expect HTTP 200, PDF content type, PDF magic bytes, and attachment behavior when `download=1`.

- [ ] **Step 7: Finalize**

Report exactly which checks passed and any environment limitation. Do not claim a local test result when only CI/Vercel was available.
