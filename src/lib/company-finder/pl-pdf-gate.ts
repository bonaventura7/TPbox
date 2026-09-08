const PDF_MAGIC = "%PDF-";

export function isPdfBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PDF_MAGIC.length) return false;
  return new TextDecoder("latin1").decode(bytes.slice(0, PDF_MAGIC.length)) === PDF_MAGIC;
}

export async function isPdfResponse(response: Response): Promise<boolean> {
  if (!response.ok) return false;
  return isPdfBytes(new Uint8Array(await response.clone().arrayBuffer()));
}
