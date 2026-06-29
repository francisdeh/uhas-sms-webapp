# `supabase/` — Supabase CLI project (placeholder)

Empty in this PR. The Supabase local config lands in **Phase 0 PR #3** with:

- `supabase init` → `config.toml`
- `migrations/0001_baseline.sql` — Alembic-generated baseline that mirrors the current Drizzle schema (33 tables, RLS NOT yet enabled)
- `seed.sql` — minimum local-dev dataset (one school, classes, subjects, a few accounts)

Local dev workflow lives in [`v2/UHAS_Backend_Architecture_v1.1.md`](../v2/UHAS_Backend_Architecture_v1.1.md) §11.
