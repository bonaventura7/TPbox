# Poland Free Balance Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add a bounded secondary free Polish annual-report path behind the official RDF provider, preserving Estonia-style server-side preview/download semantics.

**Architecture:** Official KRS/RDF remains primary. When RDF fails or exhausts its bounded deadline, resolve the company name from the existing official KRS adapter and query the existing ALEO adapter for a PDF; if that fails, use the exact official RDF browser fallback. The client contract stays unchanged and provider details stay server-side.

**Tech Stack:** TypeScript, TanStack Start server routes, Vitest, existing KRS/RDF/ALEO adapters, Vercel Hobby.

**Spec:** `docs/superpowers/specs/2026-09-09-poland-free-balance-design.md`

## Global Constraints

- No credentials or paid provider dependencies.
- No CAPTCHA/WAF/login bypass.
- Official KRS/RDF is the primary source.
- PDF responses must pass the existing magic-byte gate.
- All provider calls remain server-side.
- Interactive request must remain bounded for Vercel Hobby.

---

### Task 1: RED — regression contract for RDF-to-ALEO fallback

**Files:**
- Modify: `src/lib/company-finder/sources/bilanci/poland-rdf.test.ts`
- Test target: `src/lib/company-finder/sources/bilanci/poland-rdf.test.ts`

**Interfaces:**
- Consumes: existing `fetchPolishAnnualReport` behavior and new fallback orchestration contract.
- Produces: a failing regression that proves a Polish annual report can fall back to ALEO after RDF failure without accepting non-PDF bytes.

- [ ] **Step 1: Write the failing test**

Add a test that stubs KRS company resolution, RDF failure, ALEO HTML with a PDF link, and the PDF response. Assert the result is `ok`, `application/pdf`, and `%PDF-`.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `npx vitest run src/lib/company-finder/sources/bilanci/poland-rdf.test.ts`
Expected: FAIL because the current annual-report function has no ALEO fallback.

- [ ] **Step 3: Commit the RED test**

Commit message: `test(PL): add free annual-report fallback regression`

### Task 2: GREEN — bounded ALEO fallback orchestration

**Files:**
- Modify: `src/lib/company-finder/sources/bilanci/poland-rdf.ts`
- Modify: `src/lib/company-finder/sources/bilanci/poland-aleo.ts`
- Modify: `src/routes/api.company-finder.document.ts`
- Test: `src/lib/company-finder/sources/bilanci/poland-rdf.test.ts`

**Interfaces:**
- Consumes: `fetchKrsOdpis`, `fetchAleoAnnualReport`, existing RDF result.
- Produces: `fetchPolishAnnualReport(krs, year, timeoutMs)` returning a validated PDF when either primary or secondary source succeeds.

- [ ] **Step 1: Implement the smallest fallback**

After RDF failure, call `fetchKrsOdpis(krs, remainingBudget)` to obtain `profile.name`. If a name exists, call `fetchAleoAnnualReport(profile.name, year, remainingBudget)`. Return the ALEO result only after its PDF validation succeeds.

- [ ] **Step 2: Bound the request**

Use one absolute deadline rather than independent 30-second waits. The default interactive budget is 7.5 seconds for RDF plus fallback work, leaving a small response/redirect margin on Hobby. Pass remaining milliseconds into each provider.

- [ ] **Step 3: Prefer direct ALEO HTML**

In `poland-aleo.ts`, try the direct `https://aleo.com/pl/firma/<slug>` page first. Keep the existing reader fallback only when the direct page fails. Keep document downloads restricted to `https://aleo.com` and require PDF magic bytes.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/lib/company-finder/sources/bilanci/poland-rdf.test.ts`
Expected: PASS.

### Task 3: GREEN — final official-browser fallback contract

**Files:**
- Modify: `src/routes/api.company-finder.document.ts`
- Modify: `src/lib/company-finder/pl-official-fallback.test.ts`
- Test: `src/lib/company-finder/sources/bilanci/poland-rdf.test.ts`

**Interfaces:**
- Consumes: validated KRS and year.
- Produces: HTTP 302 to the official RDF browser when automated providers fail.

- [ ] **Step 1: Add regression for provider exhaustion**

Stub both RDF and ALEO failures and assert the document route produces the existing official-browser redirect with `X-Company-Finder-Fallback: official-polish-rdf-browser`.

- [ ] **Step 2: Run the focused tests**

Run: `npx vitest run src/lib/company-finder/sources/bilanci/poland-rdf.test.ts src/lib/company-finder/pl-official-fallback.test.ts`
Expected: PASS.

### Task 4: Quality gate and Vercel preview

**Files:**
- No production-code additions unless verification identifies a concrete failure.

- [ ] **Step 1: Run the complete Guardrail CI test set locally if dependencies are available**

Run: `npm ci && npx vitest run test/source-gate.test.ts test/source-registry-sync.test.ts test/feed-primary-url.test.ts test/draft-quality.test.ts test/error-message.test.ts test/auth-policy.test.ts test/llm-provider.test.ts test/auth-before-llm.test.ts src/lib/company-finder/greek-filing.test.ts src/lib/company-finder/official-pages-pl.test.ts src/lib/company-finder/pl-pdf-gate.test.ts src/lib/company-finder/sources/bilanci/pappers-public-fr.test.ts src/lib/company-finder/sources/bilanci/poland-rdf.test.ts src/lib/company-finder/sources/bilanci/brreg-no.test.ts test/company-finder-no-regression.test.ts test/company-finder-germany-public-balance.test.ts test/company-finder-germany-resolver.test.ts test/company-finder-be-cbso.test.ts src/lib/market-data/treasury.test.ts src/lib/market-data/treasury-registry.test.ts`

- [ ] **Step 2: Run typecheck, lint, and build**

Run: `npm run typecheck && npm run lint && npm run build`

- [ ] **Step 3: Push branch through Vercel preview**

The branch is connected to the `t-pbox` Vercel project. Verify the deployment reaches READY before creating a PR.

- [ ] **Step 4: Request code review**

Review the final diff against `main` and block merge on any Critical/High finding.
