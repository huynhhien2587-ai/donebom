create table if not exists public.bom_jobs (
  token uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  source_path text not null,
  total integer not null default 0,
  result jsonb not null,
  created_at timestamptz not null default now()
);

-- Nếu bảng đã tồn tại từ bản trước, đảm bảo có cột total
alter table public.bom_jobs add column if not exists total integer not null default 0;

create index if not exists bom_jobs_user_created_idx on public.bom_jobs (user_id, created_at desc);

alter table public.bom_jobs enable row level security;

drop policy if exists "users read own jobs" on public.bom_jobs;
create policy "users read own jobs" on public.bom_jobs for select to authenticated using (auth.uid() = user_id);

drop policy if exists "users insert own jobs" on public.bom_jobs;
create policy "users insert own jobs" on public.bom_jobs for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "users update own jobs" on public.bom_jobs;
create policy "users update own jobs" on public.bom_jobs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public) values ('bom-files', 'bom-files', false) on conflict (id) do nothing;

-- QUAN TRỌNG: path bắt buộc theo dạng uploads/{user_id}/{token}.{ext}
-- để mỗi user chỉ thao tác được trên file của chính mình.
drop policy if exists "bom upload" on storage.objects;
create policy "bom upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bom-files'
    and (storage.foldername(name))[1] = 'uploads'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "bom read" on storage.objects;
create policy "bom read" on storage.objects for select to authenticated
  using (
    bucket_id = 'bom-files'
    and (storage.foldername(name))[1] = 'uploads'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "bom delete" on storage.objects;
create policy "bom delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'bom-files'
    and (storage.foldername(name))[1] = 'uploads'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
