# TPBox Company Finder — Integrated Registry & Financial Documents Design

**Date:** 2026-09-03  
**Status:** Design approved in chat; implementation intentionally gated on written-spec review.

## 1. Objective

Evolve Company Finder from a browser-oriented registry consultation flow into a fully integrated, server-mediated company and financial-document retrieval system.

The user interacts only with TPBox. Source registries remain implementation details on the server side and are never presented as outbound links, iframes, provider labels, raw source payloads, or clickable source domains in the normal Company Finder result experience.

The change also corrects country coverage and retrieval behavior for Greece, Latvia, Czech Republic, Estonia, and removes Luxembourg, Lithuania, and Portugal from supported coverage.

## 2. Non-negotiable Golden Rule

**The browser must never be instructed to open an underlying registry/source.**

The result UI must not contain:

- direct registry/source URLs;
- `target="_blank"` source CTAs;
- iframes pointing to registry pages;
- provider/adapter names;
- raw registry API payloads;
- source-domain labels that can be clicked to leave TPBox.

The browser talks only to TPBox application endpoints. TPBox server functions perform source requests, normalize the response, and return only the domain data required by the UI.

This does not claim that a technically sophisticated user can never infer infrastructure details from external observation; it defines the product boundary: source navigation is not part of the user experience and source URLs are not delivered as result metadata.

## 3. Supported-country outcome

### Keep / correct

- **Greece (GR):** company search and financial-document retrieval through server-side source integration. A 10-digit Greek GEMI/company number is treated as a company identifier, not as a VIES VAT number. Greek VAT validation remains a separate path for genuine VAT identifiers.
- **Latvia (LV):** keep as public/free current-company data, with explicit handling for historical/public-part documents that require official authentication. The app must not mislabel Latvia as paywalled and must not attempt to automate a user's eID/e-signature credentials.
- **Czech Republic (CZ):** use ARES for entity identification and the Ministry of Justice commercial register filing/document system for financial documents. The supplied ČEZ filing is the canonical integration test fixture.
- **Estonia (EE):** keep public registry integration and move retrieval fully server-side, including annual-report document acquisition and internal document presentation/download.

### Remove from coverage

- Luxembourg (LU)
- Lithuania (LT)
- Portugal (PT)

Their entries must not remain selectable as supported Company Finder countries and must not be exposed by a stale coverage constant, adapter registration, example chip, or country-selection UI.

## 4. Architecture

### 4.1 Layers

**UI layer**

`src/routes/tool.company-finder.tsx` and focused child components present normalized company candidates, available financial periods, document actions, translated document content, and service-state messages. UI components never receive raw provider URLs.

**Orchestration layer**

`src/lib/company-finder/orchestrator.ts` remains the country-agnostic coordinator. It resolves input type, dispatches to the country adapter, normalizes results, and exposes only internal company/document identifiers.

**Country-adapter layer**

Country modules implement:

1. entity lookup;
2. document listing;
3. document acquisition;
4. source-specific normalization;
5. source-specific failure classification.

Provider URLs are internal constants or generated server-side request targets only.

**Document-service layer**

A reusable service handles:

- fetching original document bytes/text server-side;
- MIME/type detection;
- XHTML/XML/HTML parsing;
- extraction of semantic document content;
- preservation of the original document;
- deterministic PDF rendering where supported;
- internal download responses;
- translated-view generation.

**Translation layer**

Translation is applied only to extracted user-visible text. Numerical values, currencies, dates, accounting identifiers, table structure, and document references must be preserved verbatim unless a presentation-only normalization is explicitly required.

AI output is never the authoritative accounting source and must not be used to invent missing figures.

## 5. Country-specific design

### 5.1 Greece

Input handling:

- Greek GEMI/company identifier: route to the Greek company/registry integration, never to VIES.
- Greek VAT number: retain the existing VAT-oriented path.

The server uses the company page / financial section as the discovery surface and extracts available balance-sheet/document metadata and downloadable filings.

The browser receives normalized records such as:

- company name;
- registration identifier;
- fiscal/document year;
- document type;
- availability status;
- internal TPBox document ID;
- translated content when available.

The Greek registry URL supplied for testing is an integration fixture only; it must remain backend-only.

### 5.2 Latvia

Public current company data remains supported without treating the registry as paid.

For document types requiring official authentication, the system must return an explicit product state such as `AUTHENTICATED_SOURCE_REQUIRED` rather than attempting credential automation or presenting a source link.

The user-facing message must explain the limitation in Italian without exposing implementation details or a registry URL.

### 5.3 Czech Republic

Entity identification:

- use ARES for company identification and VAT/registration normalization where appropriate.

Financial documents:

- use the Ministry of Justice `Sbírka listin` as the source of deposited filings;
- retrieve filing metadata and document bytes server-side;
- support XHTML/XML source documents as first-class inputs;
- expose a clean internal document viewer and download action.

Canonical test fixture:

- supplied ČEZ filing detail URL ending in `dokument=92142348&subjektId=59933&spis=74311`.

The exact source URL is not to be rendered in the product UI.

### 5.4 Estonia

Use the public commercial-register API/page for entity lookup and annual-report metadata, but perform all retrieval from the server.

The app should normalize annual-report entries and expose:

- available year;
- document type;
- original-file availability;
- internal preview/download actions;
- translated view when source text is not Italian.

## 6. Internal document experience

Replace browser-in-browser behavior with a first-class TPBox document experience:

`Società → Bilanci disponibili → 2024 → Bilancio annuale → Visualizza / Scarica / Esporta PDF`

The document screen contains:

- document title in Italian;
- company and period context;
- document status;
- a readable document body or rendered pages;
- download original;
- export PDF when conversion is available;
- translation status.

No external navigation control is present.

## 7. XHTML/XML to PDF

Conversion is deterministic and server-side.

Priority order:

1. preserve original source file exactly;
2. parse and render source structure using a deterministic converter/runtime already suitable for server execution;
3. produce a PDF derivative without modifying accounting facts;
4. store or stream the derivative through TPBox only.

AI is not used for financial-content conversion. AI is limited to language translation and related text normalization.

Where reliable rendering is impossible, the system must say that PDF export is unavailable and retain the original download instead of generating a misleading PDF.

## 8. Translation

Default translation target: Italian.

A translation provider abstraction must allow OpenRouter-backed models through the secret `OPENROUTER_API_KEY` environment variable only.

A free NVIDIA-hosted model available through OpenRouter is preferred for the first implementation where reliability and context limits are adequate. The application must keep the model name configurable rather than hard-code an assumption that a particular free model will always exist.

Translation safeguards:

- never send provider URLs or credentials to the client;
- preserve accounting numbers, signs, percentages, currencies, dates, document IDs, and table ordering;
- cache by document-content hash + target language + model/version where appropriate;
- on translation failure, show the original extracted text rather than fabricated output;
- mark translated content as a presentation derivative, not a source-of-record.

## 9. API/data contracts

The client receives normalized structures conceptually equivalent to:

`CompanyCandidate`

- `companyId` — TPBox internal identifier;
- `name`;
- `country`;
- `registrationNumber?`;
- `vatNumber?`;
- `matchType`.

`FinancialDocument`

- `documentId` — TPBox internal identifier;
- `companyId`;
- `period`;
- `documentType`;
- `language`;
- `mimeType`;
- `originalAvailable`;
- `pdfAvailable`;
- `translationAvailable`;
- `status`.

No `sourceUrl`, provider name, registry hostname, or raw payload is part of the browser-facing contract.

Internal server metadata may retain source URL, source identifier, timestamps, content hash, and retrieval diagnostics for audit/debug purposes.

## 10. Errors and graceful degradation

Standardized states include:

- invalid input;
- company not found;
- ambiguous company match;
- source temporarily unavailable;
- rate limited;
- source requires authentication;
- document unavailable;
- unsupported document format;
- PDF conversion unavailable;
- translation unavailable;
- stale document metadata;
- service degraded.

User messages must be Italian, actionable, and registry-agnostic.

## 11. Secrets and security

The OpenRouter credential supplied during the request is treated as a secret and must never be written into source files, prompts, Git history, client bundles, logs, UI text, or database seed data.

Use an environment/secret variable named `OPENROUTER_API_KEY`.

No secret is exposed to the browser.

Source retrieval occurs only from server-side functions.

The implementation must keep timeouts, bounded retries, request correlation IDs, idempotent document acquisition, and safe error redaction.

## 12. Supabase position

Supabase is not required for the first implementation solely to make the retrieval architecture work.

Avoid a migration unless persistence materially enables:

- document cache/index;
- translation cache;
- retrieval audit trail;
- rate-limit state;
- document-content deduplication.

If persistence is introduced, it must store internal IDs and hashes and must not expose source URLs to ordinary client queries.

## 13. Testing strategy

### Unit tests

- country coverage assertions;
- LU/LT/PT absent from selectable coverage;
- Greek GEMI detection vs Greek VAT detection;
- normalization of Czech ARES entity data;
- Czech filing metadata parsing;
- Estonia annual-report normalization;
- Latvia authentication-required classification;
- source URL stripping from browser-facing DTOs;
- translation preservation of figures and accounting tokens;
- deterministic PDF-conversion error handling.

### Integration fixtures

Use the supplied Greece company fixture and the supplied ČEZ Czech filing fixture as server-side tests. Estonia and Latvia fixtures should validate their current supported/degraded states.

### E2E / browser checks

For Company Finder:

- no source links in DOM;
- no iframe with external registry origin;
- no `target="_blank"` source CTA;
- result can open a TPBox document viewer;
- internal download remains on TPBox origin;
- Greek, Czech, and Estonian sample flows do not navigate away from TPBox;
- removed countries are not selectable.

### Deployment gate

Production deployment is accepted only after:

1. typecheck/build succeeds;
2. test suite passes;
3. targeted Company Finder browser verification succeeds;
4. Vercel production deployment is READY;
5. production smoke checks confirm document endpoints and UI do not expose source navigation.

## 14. Scope boundaries

In scope:

- Company Finder and its document retrieval/viewer flow;
- country coverage and adapters listed above;
- server-side document normalization;
- translation service abstraction;
- deterministic XHTML/XML-to-PDF derivative generation;
- relevant UI redesign;
- tests and deployment verification.

Out of scope:

- redesign of unrelated public editorial pages;
- unrelated adapters or country integrations;
- automated user login/eID workflows for official registries;
- AI generation of accounting values;
- broad database redesign without a demonstrated need.

## 15. Acceptance criteria

The task is successful when a normal user can search a supported company, obtain available financial documents through TPBox, view translated content in Italian, download the original internally, and generate a PDF derivative where technically supported — without any source-opening action appearing in the UI.

Greece must correctly distinguish GEMI from VAT. Latvia must be classified as free/current-data with authentication required only where the official service requires it. Czech Republic and Estonia must use true server-side retrieval rather than browser navigation. Luxembourg, Lithuania, and Portugal must be absent from supported coverage.

The implementation must remain reversible and localized to Company Finder, without rebase/amend/force-push operations.
