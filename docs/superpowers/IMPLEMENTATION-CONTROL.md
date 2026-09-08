White-label document acquisition checkpoint

- Public Company Finder route verified HTTP 200 in production.
- Production runtime logs identified the concrete failure: German registry HTML was being served through TPbox and caused browser requests for the registry site's `_next/*` assets on the TPbox origin, producing 404s.
- Proxy behavior changed so HTML is never served as a document body; real PDF bytes remain downloadable through the TPbox endpoint, while HTML-only responses redirect to the final allowlisted registry page rather than being embedded.
- Automated regression coverage added for allowlisting and HTML-vs-document behavior.
