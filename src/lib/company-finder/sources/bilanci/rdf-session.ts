export function isRdfWafChallenge(body: string): boolean {
  const normalized = body.toLowerCase();
  return (
    normalized.includes("incapsula") ||
    normalized.includes("request unsuccessful") ||
    normalized.includes("incident id") ||
    normalized.includes("imperva")
  );
}

export function isRdfSessionEstablished(headers: Headers): boolean {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies =
    typeof getSetCookie === "function"
      ? getSetCookie.call(headers)
      : (headers.get("set-cookie") ?? "");
  return cookies.includes("XSRF-TOKEN=");
}
