begin;

create table public.mw_edu_profile_submissions (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  profile jsonb not null check (
    jsonb_typeof(profile) = 'object' and octet_length(profile::text) <= 16000
    and jsonb_typeof(profile->'name') = 'string'
    and jsonb_typeof(profile->'specialty') = 'string'
    and jsonb_typeof(profile->'course') = 'string'
    and jsonb_typeof(profile->'bio') = 'string'
    and jsonb_typeof(profile->'photo') = 'string'
    and jsonb_typeof(profile->'website') = 'string'
    and profile ?& array['name','specialty','course','bio','photo','website']
    and length(btrim(profile->>'name')) between 1 and 80
    and length(btrim(profile->>'specialty')) between 1 and 160
    and length(btrim(profile->>'course')) between 1 and 200
    and length(btrim(profile->>'bio')) between 1 and 3000
    and (profile->>'photo' = '' or profile->>'photo' like 'https://%')
    and (profile->>'website' = '' or profile->>'website' like 'https://%')
  ),
  status text not null default 'pending' check (status in ('pending','approved','changes')),
  note text not null default '',
  revision uuid not null default gen_random_uuid()
);

create table public.mw_edu_directory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  profile jsonb not null
);

create table public.mw_instructor_applications (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new','contacted','closed')),
  name text not null check (length(btrim(name)) between 1 and 80),
  email text not null check (length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  graduate boolean not null,
  background text not null check (length(btrim(background)) between 1 and 800),
  specialty text not null check (length(btrim(specialty)) between 1 and 160),
  proposal text not null check (length(btrim(proposal)) between 1 and 3000),
  availability text not null check (length(btrim(availability)) between 1 and 400),
  website text not null default '' check (length(website) <= 500 and (website = '' or website like 'https://%')),
  consent boolean not null check (consent)
);

alter table public.mw_edu_profile_submissions enable row level security;
alter table public.mw_edu_directory enable row level security;
alter table public.mw_instructor_applications enable row level security;
revoke all on public.mw_edu_profile_submissions, public.mw_edu_directory, public.mw_instructor_applications from public, anon, authenticated;
grant select on public.mw_edu_profile_submissions to authenticated;
grant insert (user_id, profile), update (profile) on public.mw_edu_profile_submissions to authenticated;
grant select (id, profile) on public.mw_edu_directory to anon, authenticated;
grant insert (name,email,graduate,background,specialty,proposal,availability,website,consent) on public.mw_instructor_applications to anon, authenticated;
grant select, update (status) on public.mw_instructor_applications to authenticated;

create policy directory_read on public.mw_edu_directory for select to anon,authenticated using (true);
create policy submission_read on public.mw_edu_profile_submissions for select to authenticated
  using ((select auth.uid()) = user_id or (select public.mw_is_admin()));
create policy submission_insert on public.mw_edu_profile_submissions for insert to authenticated
  with check ((select auth.uid()) = user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy submission_update on public.mw_edu_profile_submissions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy application_insert on public.mw_instructor_applications for insert to anon,authenticated with check (true);
create policy application_read on public.mw_instructor_applications for select to authenticated using ((select public.mw_is_admin()));
create policy application_update on public.mw_instructor_applications for update to authenticated
  using ((select public.mw_is_admin())) with check ((select public.mw_is_admin()));

create function public.mw_reset_edu_submission() returns trigger language plpgsql set search_path = '' as $$
begin
  new.revision := gen_random_uuid();
  new.status := 'pending';
  new.note := '';
  return new;
end;
$$;
revoke all on function public.mw_reset_edu_submission() from public,anon,authenticated;
create trigger reset_edu_submission before update of profile on public.mw_edu_profile_submissions
  for each row execute function public.mw_reset_edu_submission();

create function public.mw_review_edu_profile(candidate uuid, expected_revision uuid, decision text, feedback text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  submission public.mw_edu_profile_submissions%rowtype;
begin
  if public.mw_is_admin() is distinct from true then
    raise exception '관리자 권한이 필요합니다.';
  end if;
  select * into submission from public.mw_edu_profile_submissions
    where user_id = candidate and revision = expected_revision for update;
  if not found then raise exception '프로필이 변경되었습니다. 새로고침해 주세요.'; end if;
  if decision = 'approved' and submission.status = 'pending' then
    insert into public.mw_edu_directory (user_id,profile)
      values (candidate, jsonb_build_object(
        'name',submission.profile->>'name','specialty',submission.profile->>'specialty',
        'course',submission.profile->>'course','bio',submission.profile->>'bio',
        'photo',submission.profile->>'photo','website',submission.profile->>'website'
      ))
      on conflict (user_id) do update set profile = excluded.profile;
  elsif decision = 'changes' and submission.status = 'pending' and length(btrim(feedback)) between 1 and 500 then
    null;
  elsif decision = 'hide' then
    delete from public.mw_edu_directory where user_id = candidate;
    decision := 'changes';
  else
    raise exception '처리할 수 없는 상태입니다.';
  end if;
  update public.mw_edu_profile_submissions
    set status = decision, note = left(coalesce(feedback,''),500)
    where user_id = candidate;
end;
$$;
revoke all on function public.mw_review_edu_profile(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.mw_review_edu_profile(uuid,uuid,text,text) to authenticated;
commit;
