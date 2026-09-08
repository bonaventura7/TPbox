# Company Finder White-Label Document Acquisition Design

## Goal
Provide German financial statements inside TPbox without navigating or embedding the external registry website in the end-user experience.

## Architecture
The browser interacts only with TPbox. Company Finder resolves company metadata and document metadata server-side; a document acquisition layer retrieves a real document (preferably PDF), validates it, and serves it from a same-origin TPbox endpoint. External registry HTML is never embedded in an iframe. When the upstream source exposes only a web publication and no retrievable document, TPbox must fail explicitly or provide a compliant external handoff only where product policy allows; it must not proxy third-party application HTML as a TPbox document.

## Germany flow
1. `searchUrAccounting()` may use OpenRegister as the structured source when configured.
2. If OpenRegister is unavailable or fails, use Unternehmensregister as a server-side discovery source.
3. Extract the publication identifier/payload server-side.
4. Resolve a real PDF/document endpoint using the authenticated/session-aware server flow.
5. Return `Financials.documents[].downloadUrl` as a same-origin TPbox URL.
6. The document endpoint returns PDF bytes with attachment disposition for downloads.
7. If only HTML is available, do not pass it through as a document; return a controlled error or compliant source handoff.

## White-label UX
The UI exposes only TPbox concepts such as `Bilancio 2024` and `Scarica bilancio`. Provider domains, source URLs, cookies, payloads, and third-party HTML must not be rendered in the normal user interface.

## Resilience and security
- Validate all upstream hosts against an explicit allowlist.
- Preserve required upstream cookies only on the server.
- Follow redirects only to allowlisted hosts.
- Limit request size, timeout, and redirect count.
- Detect PDFs by magic bytes, not only by content type.
- Never expose upstream credentials or provider API keys to the browser.
- Return machine-readable 4xx/5xx errors instead of a misleading TPbox 404 page.

## Success criteria
- `/tool/company-finder` remains HTTP 200.
- German annual-report results do not embed Unternehmensregister HTML.
- A successful German document download is a binary PDF delivered from a TPbox same-origin endpoint.
- An upstream HTML-only response does not create browser-side `_next/*` 404 noise.
- Automated tests cover allowlisting, PDF-vs-HTML behavior, and controlled upstream failure handling.
