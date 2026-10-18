-- Health profile (sign-up, optional): powers the NHANES risk estimate and the Medical ID that is
-- shared ONLY inside an incident package. Owner-only through RLS; Edge Functions read it with the
-- service role to build incident packages. Mirrors src/lib/types/database.ts (HealthProfileRow).

create table if not exists public.health_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  age integer check (age between 1 and 120),
  sex text check (sex in ('female', 'male', 'unspecified')),
  weight_kg numeric check (weight_kg between 20 and 400),
  height_cm numeric check (height_cm between 80 and 250),
  allergies text[] not null default '{}',
  carries_epipen boolean not null default false,
  conditions text[] not null default '{}',
  family_history text[] not null default '{}',
  -- "Are you vulnerable?": if on, a photo of their medical card goes into incident packages.
  is_vulnerable boolean not null default false,
  medical_card_path text check (medical_card_path is null or char_length(medical_card_path) <= 300),
  -- NHANES model output at save time: chance of high blood pressure, diabetes or heart disease.
  risk_percent integer check (risk_percent between 0 and 100),
  updated_at timestamptz not null default now()
);

alter table public.health_profiles enable row level security;

drop policy if exists "health_profiles: owner reads" on public.health_profiles;
create policy "health_profiles: owner reads" on public.health_profiles
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "health_profiles: owner inserts" on public.health_profiles;
create policy "health_profiles: owner inserts" on public.health_profiles
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "health_profiles: owner updates" on public.health_profiles;
create policy "health_profiles: owner updates" on public.health_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "health_profiles: owner deletes" on public.health_profiles;
create policy "health_profiles: owner deletes" on public.health_profiles
  for delete to authenticated using (user_id = auth.uid());

-- Private bucket for medical card photos: objects live under "{user_id}/...".
insert into storage.buckets (id, name, public)
values ('medical-cards', 'medical-cards', false)
on conflict (id) do nothing;

drop policy if exists "medical-cards: owner uploads" on storage.objects;
create policy "medical-cards: owner uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'medical-cards' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "medical-cards: owner reads" on storage.objects;
create policy "medical-cards: owner reads" on storage.objects
  for select to authenticated
  using (bucket_id = 'medical-cards' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "medical-cards: owner replaces" on storage.objects;
create policy "medical-cards: owner replaces" on storage.objects
  for update to authenticated
  using (bucket_id = 'medical-cards' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "medical-cards: owner deletes" on storage.objects;
create policy "medical-cards: owner deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'medical-cards' and (storage.foldername(name))[1] = auth.uid()::text);
