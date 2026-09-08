const PDF_MAGIC = "%PDF-";

export function isPdfBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PDF_MAGIC.length) return false;
  const prefix = new TextDecoder("latin1").decode(bytes.slice(0, PDF_MAGIC.length));
  return prefix === PDF_MAGIC;
}

export async function isPdfResponse(response: Response): Promise<boolean> {
  if (!response.ok) return false;
  const bytes = new Uint8Array(await response.clone().arrayBuffer());
  return isPdfBytes(bytes);
}
