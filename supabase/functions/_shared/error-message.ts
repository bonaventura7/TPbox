type PostgrestErrorLike = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
};

function field(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Preserve the useful PostgREST fields instead of storing "[object Object]". */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;

  if (error && typeof error === 'object') {
    const value = error as PostgrestErrorLike;
    const parts = (['message', 'code', 'details', 'hint'] as const)
      .map((key) => {
        const rendered = field(value[key]);
        return rendered ? `${key}=${rendered}` : null;
      })
      .filter((part): part is string => part !== null);

    if (parts.length) return parts.join(' | ');

    try {
      return JSON.stringify(error);
    } catch {
      return 'errore non serializzabile';
    }
  }

  return String(error);
}
