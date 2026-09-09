# Poland Company Finder — free annual accounts design

**Goal:** make Poland Company Finder reliably resolve a KRS company and provide a free annual financial-statement download/preview path, following the Estonia adapter pattern while remaining resilient to the Polish RDF viewer WAF.

## Evidence and root cause

- The current production path already uses the official Polish KRS API for company data and the Ministry RDF viewer for financial documents.
- The RDF adapter has a correct WAF/Incapsula detection and a reversible official-browser fallback, but the production Vercel team is on Hobby and the adapter permits 30-second waits. That makes the server-side path fragile for an interactive download endpoint.
- The Estonia adapter demonstrates the desired contract: public registry lookup, annual-report discovery, direct document retrieval, internal preview/download URL, and server-side source handling.
- ALEO publicly exposes KRS-derived annual-report entries with PDF/XML download affordances. It is a secondary source only; official KRS/RDF remains primary.

## Design

1. Keep KRS company resolution on the official Ministry API.
2. Keep RDF as the primary financial-document provider.
3. Keep the current WAF-safe session bootstrap and PDF magic-byte validation.
4. Add a secondary ALEO PDF fallback only after official RDF retrieval fails. Resolve the company name from KRS so the fallback does not depend on user-entered naming.
5. Prefer direct ALEO HTML before the existing reader fallback; never expose the reader URL to the client.
6. Bound total server-side work to the Vercel Hobby interactive budget. If the official path cannot complete inside its deadline, immediately try the secondary path rather than waiting for a 30-second timeout.
7. If both server-side providers fail, redirect to the exact official RDF browser URL as the final reversible/manual fallback.
8. Preserve source-opaque UI: users see “Bilancio disponibile” / “Scarica bilancio” and degraded-state copy, not provider internals.
9. Add focused tests for: RDF failure -> KRS name resolution -> ALEO PDF success; invalid KRS; non-PDF rejection; final official fallback; direct ALEO preferred over reader fallback.
10. No CAPTCHA/WAF/login bypass is introduced.

## Non-goals

- No paid provider or API key.
- No Vercel plan upgrade.
- No PDF generation from XML.
- No client-side fetch to Polish providers.

## Success criteria

- KRS company lookup remains deterministic and source-safe.
- A representative Polish KRS with an annual report can return a valid PDF through RDF when available.
- When RDF is blocked/slow, the endpoint can return a valid ALEO PDF without exposing third-party provider details.
- If both automated paths degrade, the user receives a working official browser destination instead of a dead 502.
- Guardrail CI passes and the Vercel preview builds.
