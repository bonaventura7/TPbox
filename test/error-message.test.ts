import { describe, expect, it } from 'vitest';
import { errorMessage } from '../supabase/functions/_shared/error-message';

describe('persistence error serialization', () => {
  it('preserves PostgREST message, code, details and hint', () => {
    const rendered = errorMessage({
      message: 'insert or update violates foreign key constraint',
      code: '23503',
      details: 'Key (source_name) is not present in news_sources.',
      hint: 'Register the exact source name.',
    });

    expect(rendered).toContain('message=insert or update violates foreign key constraint');
    expect(rendered).toContain('code=23503');
    expect(rendered).toContain('details=Key (source_name) is not present in news_sources.');
    expect(rendered).toContain('hint=Register the exact source name.');
    expect(rendered).not.toBe('[object Object]');
  });

  it('keeps ordinary Error messages concise', () => {
    expect(errorMessage(new Error('source HTTP 404'))).toBe('source HTTP 404');
  });
});
