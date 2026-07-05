-- Storage RLS policies for the `photos` and `documents` buckets.
--
-- `storage.objects` has RLS enabled by default with zero policies, so
-- every operation (including authenticated INSERT) was denied outright —
-- "new row violates row-level security policy" on every upload attempt.
--
-- This is separate from apps/api/alembic/ (which owns the *application*
-- schema — schools, students, etc., authorized entirely at the FastAPI
-- service layer). Supabase Storage is platform-managed infrastructure
-- with its own RLS surface, uploaded to directly from the browser
-- (apps/web/src/lib/supabase/storage.ts) — FastAPI is never in that
-- request path, so there's no service-layer check to lean on here.
--
-- Deliberately broad rather than per-owner: Admin/DeputyHead upload
-- photos on behalf of students/staff, not just their own, so a
-- "users can only write their own path" policy would block legitimate
-- uploads. `photos` is already a public-read bucket (low sensitivity);
-- `documents` reads only ever happen server-side via signed URLs from
-- the service-role client (lib/storage-admin.ts), which bypasses RLS
-- entirely — so `documents` only needs a write policy here, not read.

create policy "Authenticated users can upload photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'photos');

create policy "Authenticated users can update photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'photos');

create policy "Authenticated users can delete photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'photos');

create policy "Authenticated users can upload documents"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents');

create policy "Authenticated users can update documents"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'documents');

create policy "Authenticated users can delete documents"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'documents');
