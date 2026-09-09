import { createFileRoute } from "@tanstack/react-router";

const RUZ_ATTACHMENT_HOST = "www.registeruz.sk";
const MAX_BYTES = 30 * 1024 * 1024;

function jsonError(message: string, status: number): Response { return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } }); }

export const Route = createFileRoute("/api/company-finder/ruz-document")({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    const rawId = url.searchParams.get("attachment")?.trim() ?? "";
    const download = url.searchParams.get("download") === "1";
    if (!/^\d{1,10}$/.test(rawId)) return jsonError("attachment RÚZ non valido", 400);
    const id = Number(rawId);
    if (!Number.isSafeInteger(id)) return jsonError("attachment RÚZ non valido", 400);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const upstream = await fetch(`https://${RUZ_ATTACHMENT_HOST}/cruz-public/domain/financialreport/attachment/${id}`, {
        headers: { Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1", "User-Agent": "TPBox-Company-Finder/1.0" },
        signal: controller.signal, redirect: "follow", cache: "no-store",
      });
      if (!upstream.ok) return jsonError(`RÚZ HTTP ${upstream.status}`, upstream.status === 404 ? 404 : 502);
      const bytes = await upstream.arrayBuffer();
      if (bytes.byteLength > MAX_BYTES) return jsonError("documento RÚZ troppo grande", 502);
      const contentType = (upstream.headers.get("content-type") ?? "").toLowerCase();
      const signature = new TextDecoder("latin1").decode(new Uint8Array(bytes).slice(0, 8));
      if (!contentType.includes("pdf") && !signature.startsWith("%PDF-")) return jsonError("RÚZ non ha restituito un PDF valido", 502);
      return new Response(bytes, { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="ruz-attachment-${id}.pdf"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    } catch (error) {
      const err = error as { name?: string; message?: string };
      return jsonError(err?.name === "AbortError" ? "RÚZ timeout" : err?.message ?? "RÚZ non disponibile", 502);
    } finally { clearTimeout(timer); }
  } } },
});
