# Greece GEMI Public Financials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TPbox resolve Greek financial statements through a resilient free cascade: GEMI Open Data → public GEMI/Business Portal filing → PDF/iXBRL extraction, without changing the existing PLN behavior.

**Architecture:** Keep the existing Greece GEMI adapter as the registry/document discovery layer. Add a focused financial-document extraction layer that accepts public PDF/iXBRL content, normalizes Greek financial labels and European number formats into the existing `FinancialYear` schema, and returns provenance/availability without exposing source tokens. If server-side retrieval is unavailable, retain the official public registry fallback rather than bypassing CAPTCHA/session controls.

**Tech Stack:** TypeScript, TanStack Start, Vitest, existing fetch/runtime primitives, existing TPbox financial types, optional open-source parsing dependency only if already available or demonstrably required.

**Spec:** Approved in chat: architecture C — GEMI + Public Registry + PDF/iXBRL cascade; PLN changes are explicitly out of scope.

## Global Constraints

- Greece financial source must remain free to the user and must not require a paid third-party data provider.
- GEMI_API_KEY is optional; never hardcode credentials.
- Do not bypass CAPTCHA, authentication, session controls, or access restrictions.
- Preserve `PLN` behavior exactly; do not modify Poland/shared currency behavior in this plan.
- Financial values must never be fabricated; unavailable values remain absent.
- Use bounded network timeouts/retries and explicit source/restriction states.
- Preserve document-domain allowlisting for automatic downloads.
- Every production behavior change requires a failing test first.
- CI must explicitly execute Greece tests.

---

### Task 1: Establish Greece extraction contract with failing tests

**Files:**
- Modify: `src/lib/company-finder/sources/bilanci/gemi-gr.test.ts`
- Inspect: `src/lib/company-finder/types.ts`
- Inspect: existing financial source tests for conventions

**Interfaces:**
- Consumes: Greek filing text/HTML represented as a string plus an optional source URL.
- Produces: a pure extraction contract returning `FinancialYear[]` and normalized metadata without network access.

- [ ] **Step 1: Write failing tests for Greek number normalization**

Cover `1.234,56`, `-1.234,56`, `(1.234,56)`, integer thousands such as `1.234`, and invalid/empty values. The expected numeric result must use JavaScript numbers and preserve negative sign.

- [ ] **Step 2: Write failing tests for Greek financial labels**

Cover Greek/English variants for revenue, operating profit/EBITDA where identifiable, net income, total assets, and equity. Verify that unrelated registry text is ignored.

- [ ] **Step 3: Write failing tests for year extraction**

Given a compact representative statement containing 2024 and 2023 columns, verify two `FinancialYear` entries with `currency: "EUR"` and correct period labels.

- [ ] **Step 4: Run only the new test file**

Run: `npx vitest run src/lib/company-finder/sources/bilanci/gemi-gr.test.ts`

Expected: FAIL because the new extraction functions do not yet exist.

---

### Task 2: Implement pure Greek financial extractor

**Files:**
- Create: `src/lib/company-finder/sources/bilanci/gemi-gr-financials.ts`
- Modify: `src/lib/company-finder/sources/bilanci/gemi-gr.test.ts`

**Interfaces:**
- Produces: `parseGreekFinancialDocument(input: { text: string; sourceUrl?: string }): GreekFinancialParseResult`.
- `GreekFinancialParseResult` contains `years: FinancialYear[]`, `matched: boolean`, and `confidence: "high" | "medium" | "low"`.

- [ ] **Step 1: Implement number parsing only**

Normalize whitespace and Unicode minus characters; remove thousands separators `.`/spaces; convert decimal comma to `.`; support parentheses as negative; reject strings without digits.

- [ ] **Step 2: Implement label matching**

Use explicit Greek and English aliases rather than broad `accounts?` matching. Keep mappings local to Greece and document the aliases in constants.

- [ ] **Step 3: Implement year-column extraction**

Recognize four-digit years in a bounded header window, then map nearby financial rows to those columns. Do not infer an amount when column alignment is ambiguous.

- [ ] **Step 4: Implement the canonical `FinancialYear` output**

Return only fields actually extracted. Set currency to `EUR` for Greek financial statements unless the document explicitly declares another currency. Keep `periodLabel` stable and human-readable.

- [ ] **Step 5: Run the focused tests**

Run: `npx vitest run src/lib/company-finder/sources/bilanci/gemi-gr.test.ts`

Expected: PASS for all extractor cases.

- [ ] **Step 6: Add malformed-document tests**

Verify that a registry-only page, unrelated announcement, or malformed table returns `matched: false` or partial fields without throwing.

---

### Task 3: Connect public GEMI/iXBRL retrieval to extraction

**Files:**
- Modify: `src/lib/company-finder/sources/bilanci/gemi-gr.ts`
- Inspect/modify: `src/lib/company-finder/greek-filing.ts` only if required by the existing public-filing contract
- Modify: `src/lib/company-finder.functions.ts` only for Greece wiring; do not touch Poland code
- Test: Greece source tests

**Interfaces:**
- Consumes: existing GEMI company/document discovery and `resolveGreekFilingUrl`.
- Produces: `Financials` containing extracted years when the public document is downloadable; otherwise explicit document availability/restriction and official-page fallback.

- [ ] **Step 1: Add a failing integration-style unit test with mocked fetch**

Return a representative Greek financial document body from the allowed filing host and assert that `fetchGreekFinancials` exposes extracted `years`, EUR currency, source provenance, and document URL.

- [ ] **Step 2: Add a failing fallback test**

When the filing URL cannot be fetched, assert `DOCUMENT_FOUND`/`REGISTRY_ONLY` semantics and no fabricated financial values.

- [ ] **Step 3: Implement minimal fetch-and-parse path**

Reuse existing bounded timeout behavior. Fetch only allowlisted HTTPS document hosts. Pass response text to the pure parser. Do not introduce CAPTCHA/session bypasses.

- [ ] **Step 4: Preserve existing GEMI metadata behavior**

Keep company identity, GEMI identifier, and existing document summaries intact. Only enrich `financials.years` when extraction is successful.

- [ ] **Step 5: Run focused Greece tests**

Run: `npx vitest run src/lib/company-finder/sources/bilanci/gemi-gr.test.ts src/lib/company-finder/greek-filing.test.ts`

Expected: PASS.

---

### Task 4: Ensure CI covers Greece and validate the branch

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add Greece financial tests to the existing Vitest guardrail command**

Add `src/lib/company-finder/sources/bilanci/gemi-gr.test.ts` to the explicit test list. Do not broaden the workflow into an unrelated full-suite refactor.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: exit code 0 for the branch's current TypeScript state.

- [ ] **Step 3: Run the Greece-focused test set**

Run: `npx vitest run src/lib/company-finder/sources/bilanci/gemi-gr.test.ts src/lib/company-finder/greek-filing.test.ts`

Expected: exit code 0.

- [ ] **Step 4: Run the configured CI guardrail test command**

Run the exact Vitest command from `.github/workflows/ci.yml` after adding the Greece test.

Expected: exit code 0, or a clearly isolated pre-existing failure documented with evidence.

- [ ] **Step 5: Run production build**

Run: `npm run build`

Expected: exit code 0. If Vercel reports only infrastructure/build-rate-limit failure, record it separately rather than misclassifying it as an application failure.

---

### Task 5: Real-source smoke validation and rollback evidence

**Files:**
- No production code unless the smoke test reveals a defect.
- Optional: add a deterministic fixture under `src/lib/company-finder/sources/bilanci/fixtures/` only if a public filing can be legally and stably represented as test input.

- [ ] **Step 1: Select one real Greek company with a public GEMI identifier**

Use only publicly accessible registry/document information. Do not store credentials or private data.

- [ ] **Step 2: Verify company → GEMI → financial filing resolution**

Confirm the adapter reaches a financial document or an explicit public-registry fallback.

- [ ] **Step 3: Verify extracted values manually against the source document**

Check at least revenue, net income, total assets, equity, years, and currency where those rows are present. If the source does not expose a row, leave it undefined rather than infer it.

- [ ] **Step 4: Verify rollback path**

The Greece change remains isolated on `fix/greece-gemi-financials`; reverting the Greece-specific commits must restore the prior behavior without touching PLN.

- [ ] **Step 5: Final verification gate**

Re-run the focused tests, typecheck, and build before claiming completion. Completion requires fresh command evidence.

---

## Quality Gate

- Greece adapter compiles and its tests pass.
- Financial extractor has deterministic unit coverage for Greek number formats and labels.
- Public filing retrieval never bypasses CAPTCHA/auth/session controls.
- No paid provider is required.
- No credentials are hardcoded.
- PLN code remains unchanged by this work.
- CI explicitly executes Greece tests.
- Build/typecheck evidence is fresh.
- Real-source smoke test reaches either extracted financial values or a truthful public-registry/document restriction.
- Rollback remains branch/commit-local and reversible.
