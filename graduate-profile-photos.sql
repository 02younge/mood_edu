begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('mw-graduate-photos','mw-graduate-photos',false,5242880,array['image/jpeg','image/png','image/webp']);

create function public.mw_valid_graduate_photos(account_id uuid, profile jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  gallery jsonb := coalesce(profile->'gallery_paths','[]'::jsonb);
  cover text := coalesce(profile->>'cover_path','');
  pattern text := '^' || account_id::text || '/[0-9a-f-]{36}[.](jpg|png|webp)$';
begin
  if jsonb_typeof(gallery) <> 'array' then return false; end if;
  return (cover = '' or cover ~ pattern)
    and jsonb_array_length(gallery) <= 6
    and not exists (select from jsonb_array_elements_text(gallery) as item(path)
      where path is null or path !~ pattern or path = cover)
    and (select count(distinct path) from jsonb_array_elements_text(gallery) as item(path)) = jsonb_array_length(gallery);
end;
$$;
revoke all on function public.mw_valid_graduate_photos(uuid,jsonb) from public,anon;
grant execute on function public.mw_valid_graduate_photos(uuid,jsonb) to authenticated;
alter table public.mw_edu_profile_submissions
  add constraint graduate_photo_paths check (public.mw_valid_graduate_photos(user_id,profile));

create policy graduate_photo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'mw-graduate-photos'
    and (select auth.jwt()->>'is_anonymous') is distinct from 'true'
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}[.](jpg|png|webp)$'));

create policy graduate_photo_review on storage.objects for select to authenticated
  using (bucket_id = 'mw-graduate-photos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.mw_is_admin())));

create policy graduate_photo_public on storage.objects for select to anon,authenticated
  using (bucket_id = 'mw-graduate-photos' and exists (
    select 1 from public.mw_edu_directory d where d.profile->>'cover_path' = storage.objects.name
      or (d.profile->'gallery_paths') ? storage.objects.name
  ));

create or replace function public.mw_review_edu_profile(candidate uuid, expected_revision uuid, decision text, feedback text)
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
        'photo',submission.profile->>'photo','website',submission.profile->>'website',
        'cover_path',submission.profile->>'cover_path',
        'gallery_paths',coalesce(submission.profile->'gallery_paths','[]'::jsonb)
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
commit;
