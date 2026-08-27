import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WHITELIST } from '../supabase/functions/_shared/whitelist';

const migrationPath = fileURLToPath(
  new URL('../supabase/migrations/20260811010000_sync_news_sources_registry.sql', import.meta.url),
);
const migration = readFileSync(migrationPath, 'utf8');

describe('news_sources registry synchronization migration', () => {
  it('registers every exact source name used by the Edge whitelist', () => {
    const uniqueNames = [...new Set(WHITELIST.map((source) => source.name))];
    expect(uniqueNames).toHaveLength(58);

    for (const name of uniqueNames) {
      const escaped = name.replaceAll("'", "''");
      expect(migration, `missing news_sources row for ${name}`).toContain(`('${escaped}',`);
    }
  });

  it('keeps synchronized rows disabled and idempotent', () => {
    expect(migration).toContain("'HTML_WATCH', false");
    expect(migration).toContain('ON CONFLICT (name) DO NOTHING');
  });
});
