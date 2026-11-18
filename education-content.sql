begin;
create table public.mw_edu_content (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('faculty','dynamic','swedish')),
 title text not null check(char_length(btrim(title)) between 1 and 150),
 subtitle text not null default '' check(char_length(subtitle)<=300),
 body text not null default '' check(char_length(body)<=12000),
 photo_path text check(photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
 published boolean not null default false
);
create unique index mw_edu_one_course on public.mw_edu_content(kind) where kind in ('dynamic','swedish');
alter table public.mw_edu_content enable row level security;
revoke all on public.mw_edu_content from public,anon,authenticated;
grant select on public.mw_edu_content to anon,authenticated;
grant insert,update on public.mw_edu_content to authenticated;
create policy edu_content_public on public.mw_edu_content for select to anon,authenticated using(published);
create policy edu_content_manage on public.mw_edu_content for all to authenticated
using((select public.mw_is_admin()) or exists(select 1 from public.mw_edu_admins a where a.user_id=(select auth.uid())))
with check((select public.mw_is_admin()) or exists(select 1 from public.mw_edu_admins a where a.user_id=(select auth.uid())));
alter table public.mw_edu_events add column link_type text not null default 'none', add column link_target text not null default '',
 add constraint mw_edu_event_link check (
 (link_type='none' and link_target='') or
 (link_type='course' and link_target in ('dynamic','swedish')) or
 (link_type='external' and char_length(link_target)<=2000 and link_target ~ '^https://[^[:space:]]+$'));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('mw-edu-photos','mw-edu-photos',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy edu_photo_read on storage.objects for select to anon,authenticated using (
 bucket_id='mw-edu-photos' and exists(select 1 from public.mw_edu_content c where c.photo_path=storage.objects.name));
create policy edu_photo_insert on storage.objects for insert to authenticated with check (
 bucket_id='mw-edu-photos' and (storage.foldername(name))[1]=(select auth.uid())::text
 and ((select public.mw_is_admin()) or exists(select 1 from public.mw_edu_admins a where a.user_id=(select auth.uid()))));
commit;