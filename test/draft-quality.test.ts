import { describe, expect, it } from 'vitest';
import { validateDraft } from '../supabase/functions/_shared/draft-quality';

const validDraft = {
  publishable: true,
  title: 'Il Cile chiarisce il trattamento dei beni immateriali nel transfer pricing',
  summary: 'Il SII ha pubblicato un chiarimento specifico sulla valutazione dei beni immateriali. Il documento precisa i criteri applicabili alle operazioni infragruppo.',
  content_markdown: 'A'.repeat(1400),
  category: 'TP',
  normative_references: [],
};

describe('generated draft quality gate', () => {
  it('accepts a complete, explicitly publishable draft', () => {
    expect(validateDraft(validDraft).ok).toBe(true);
  });

  it('rejects an institutional overview with no concrete development', () => {
    const result = validateDraft({
      ...validDraft,
      publishable: false,
      rejection_reason: 'La fonte è soltanto la homepage dell’ente.',
    });
    expect(result).toEqual({
      ok: false,
      reason: 'fonte non adatta a una notizia: La fonte è soltanto la homepage dell’ente.',
    });
  });

  it('rejects short generic copy even when marked publishable', () => {
    const result = validateDraft({ ...validDraft, content_markdown: 'Testo generico.'.repeat(20) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('articolo troppo breve');
  });

  it('rejects malformed normative references', () => {
    expect(validateDraft({ ...validDraft, normative_references: ['Art. 1', 2] }).ok).toBe(false);
  });
});
