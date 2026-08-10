export function redactSecret(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,}]+/gi, '$1[REDACTED]')
    .replace(/(api[_-]?key\s*[:=]\s*)[^\s,}]+/gi, '$1[REDACTED]')
    .replace(/(openrouter_api_key\s*[:=]\s*)[^\s,}]+/gi, '$1[REDACTED]')
    .replace(/(openai_api_key\s*[:=]\s*)[^\s,}]+/gi, '$1[REDACTED]')
    .replace(/\bsk-or-v1-[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, '[REDACTED]');
}
