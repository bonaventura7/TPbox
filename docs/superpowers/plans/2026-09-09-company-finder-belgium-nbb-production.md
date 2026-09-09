# Company Finder Belgium NBB Production Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the validated Belgium NBB-CBSO fix onto the current `main` line, preserve the newer Estonia integration, and verify Belgian company lookup plus official annual-account document retrieval in Vercel production.

**Architecture:** Keep CBE/KBO as the identity source and NBB-CBSO Authentic Data Query as the annual-accounts source. The browser receives only a same-origin proxy URL; the Vercel server injects `NBB-CBSO-Subscription-Key` and `X-Request-Id` for the two CBSO hosts, with SSRF allowlisting, timeout, PDF validation, and an explicit degraded response when the key is absent.

**Tech Stack:** TanStack Start, TypeScript, Vitest, Vercel, GitHub.

**Spec:** Existing validated Belgium fix commit `ca86fdab1d020e58d5d3b0fe79149d0ede7b25e7` and current `main` Company Finder flow.

## Global Constraints

- Preserve current `main` functionality, including Estonia integration.
- Never expose `NBB_CBSO_API_KEY` to the browser or place it in document URLs.
- Only allow known document hosts and HTTPS, with the existing Denmark HTTP exception.
- Use TDD for production-code changes: failing test first, then minimal implementation.
- Do not weaken timeout, size, redirect, PDF, or SSRF protections.
- Do not use Pappers as the primary Belgian data dependency; it remains an external oracle/reference.
- Production success requires an actual Vercel request for a real Belgian CBE, not only static tests.

---

### Task 1: Reconcile the validated Belgium fix with current main

**Files:**
- Modify: `src/lib/company-finder/document-proxy.server.ts`
- Modify: `src/lib/company-finder/sources/bilanci/cbso-be.ts`
- Modify: `src/routes/api.company-finder.document.ts`
- Create: `test/company-finder-be-cbso.test.ts`
- Create: `docs/be-nbb-cbso-chiave.md`

**Interfaces:**
- `fetchCbsoAccounts(cbe, apiKey, baseOverride?, timeoutMs?)` remains the Belgium financials interface.
- `handleDocumentRequest(request)` remains the document proxy interface.
- `/api/company-finder/document?url=...&accept=application/pdf` remains the browser-facing document contract.

- [ ] **Step 1: Add the validated Belgium test suite from the known-good fix.**
  Use the 10 offline cases in commit `ca86fdab1d020e58d5d3b0fe79149d0ede7b25e7`, covering CBE normalization, missing key, malformed CBE, `/references`, UAT2, 401/403, empty/404 references, proxy 503, proxy key injection, and UAT2 proxy injection.

- [ ] **Step 2: Run the Belgium test before production edits.**
  Run `npm test -- test/company-finder-be-cbso.test.ts`. Expected on current main: the suite exposes the missing server-side CBSO-key behavior rather than silently passing.

- [ ] **Step 3: Port only the Belgium changes from the validated fix.**
  Add CBSO host detection, server-side `NBB_CBSO_API_KEY` injection, `X-Request-Id`, actionable 503 behavior, the `?url=` proxy branch, and the documented proxied PDF URL contract. Do not overwrite unrelated current-main/Estonia behavior.

- [ ] **Step 4: Run the focused Belgium suite.**
  Run `npm test -- test/company-finder-be-cbso.test.ts`. Expected: all 10 tests pass.

- [ ] **Step 5: Run the full static quality gate.**
  Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Expected: all commands exit successfully.

- [ ] **Step 6: Commit the reconciled implementation.**
  Commit with `fix(company-finder): enable Belgium NBB-CBSO end-to-end on main`.

---

### Task 2: Configure the NBB secret safely in Vercel

**Files:**
- No source-file changes required.
- Vercel project environment: `NBB_CBSO_API_KEY`.

**Interfaces:**
- Production runtime reads `process.env.NBB_CBSO_API_KEY` only server-side.

- [ ] **Step 1: Inspect current Vercel environment configuration without printing secret values.**
  Confirm whether `NBB_CBSO_API_KEY` exists for Production and Preview. Never retrieve or echo the value.

- [ ] **Step 2: If the production key is already configured, leave it unchanged.**
  Do not rotate or replace a working credential unnecessarily.

- [ ] **Step 3: If the key is absent, stop at the human-required NBB subscription step.**
  The application must remain safe in degraded mode and return the explicit 503 configuration message; do not invent a key or put a credential in source control.

- [ ] **Step 4: If a valid key is available through the authorized Vercel environment, configure it for Production and Preview as appropriate.**
  Keep `NBB_CBSO_BASE` unset for production unless UAT2 is intentionally being tested.

---

### Task 3: Deploy and verify Belgium end-to-end

**Files:**
- No additional source files.

**Interfaces:**
- Production URL: `/tool/company-finder`.
- Belgian test company: CBE `0442824497` / VAT `BE0442824497`.

- [ ] **Step 1: Deploy the reconciled branch to Vercel Preview.**
  Wait for a successful build and inspect build logs if it fails.

- [ ] **Step 2: Exercise the preview with CBE `0442824497`.**
  Expected: company identity resolves and the NBB annual-account result exposes a same-origin `/api/company-finder/document?...accept=application/pdf` URL without the NBB key.

- [ ] **Step 3: Exercise the preview document endpoint.**
  Expected with a configured key: HTTP 200, `Content-Type: application/pdf`, and a valid `%PDF-` payload. Expected without a key: HTTP 503 with the actionable `NBB_CBSO_API_KEY` message.

- [ ] **Step 4: Inspect Vercel runtime logs for the Belgium request.**
  Confirm no key value is logged and no unexpected 4xx/5xx occurs.

- [ ] **Step 5: Promote/merge only after preview verification passes.**
  Merge the branch to `main` using the repository's normal review/merge path.

- [ ] **Step 6: Verify production.**
  Re-run the same CBE/VAT lookup against `https://t-pbox.vercel.app/tool/company-finder` and verify the official NBB document retrieval.

---

### Task 4: Regression and rollback gate

**Files:**
- No additional source files unless a test reveals a regression.

- [ ] **Step 1: Check the production deployment commit.**
  Confirm it contains the reconciled Belgium changes while retaining the current Estonia commit lineage.

- [ ] **Step 2: Check production runtime error counts.**
  Scope logs to the new deployment and Belgium route/document requests.

- [ ] **Step 3: If Belgium fails but main is otherwise healthy, roll back the deployment.**
  Restore the previous known-good production deployment rather than stacking speculative fixes.

- [ ] **Step 4: If verification passes, record the final evidence.**
  Capture deployment ID, commit SHA, focused-test result, full quality-gate result, and production E2E result without recording secrets.
