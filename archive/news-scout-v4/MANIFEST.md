# news-scout v4 production backup

- Source: Supabase Edge Function `news-scout`
- Supabase project ref: `igtthymjeujkgfpmgoqj`
- Production version observed: v4
- Production status observed: ACTIVE
- `verify_jwt`: true
- Supabase function SHA-256 observed: `ff10a6991eb1a8cd09303b5ce056d0aeb30922945b7eac135e29478877962263`
- Retrieved from: Supabase Edge Function source, 2026-08-09
- Candidate PR head compared against: `7a56d8a1f8af3dfcf2b1ec22790fcbbc5d7a441f`

## Rollback

The branch `backup/news-scout-v4` contains the v4-compatible function at `supabase/functions/news-scout/index.ts` and its local `whitelist.ts` dependency. A rollback can therefore be performed by checking out this branch and deploying `news-scout` explicitly to project ref `igtthymjeujkgfpmgoqj`.

No production deploy was performed while creating this backup.
