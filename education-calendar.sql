begin;
create table public.mw_edu_admins(user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.mw_edu_admins enable row level security;
revoke all on public.mw_edu_admins from public,anon,authenticated;
grant select on public.mw_edu_admins to authenticated;
create policy edu_admin_self on public.mw_edu_admins for select to authenticated using(user_id=(select auth.uid()));
create table public.mw_edu_events(
 id uuid primary key default gen_random_uuid(),
 title text not null check(char_length(btrim(title)) between 1 and 120),
 starts_on date not null,
 ends_on date not null check(ends_on>=starts_on and ends_on-starts_on<=366),
 time_label text not null default '' check(char_length(time_label)<=100),
 venue text not null default '' check(char_length(venue)<=200),
 details text not null default '' check(char_length(details)<=6000),
 published boolean not null default false
);
create index mw_edu_events_dates on public.mw_edu_events(starts_on,ends_on);
alter table public.mw_edu_events enable row level security;
revoke all on public.mw_edu_events from public,anon,authenticated;
grant select on public.mw_edu_events to anon,authenticated;
grant insert,update on public.mw_edu_events to authenticated;
create policy edu_event_public on public.mw_edu_events for select to anon,authenticated using(published);
create policy edu_event_admin_read on public.mw_edu_events for select to authenticated using((select public.mw_is_admin()) or exists(select 1 from public.mw_edu_admins a where a.user_id=(select auth.uid())));
create policy edu_event_admin_insert on public.mw_edu_events for insert to authenticated with check((select public.mw_is_admin()) or exists(select 1 from public.mw_edu_admins a where a.user_id=(select auth.uid())));
create policy edu_event_admin_update on public.mw_edu_events for update to authenticated using((select public.mw_is_admin()) or exists(select 1 from public.mw_edu_admins a where a.user_id=(select auth.uid()))) with check((select public.mw_is_admin()) or exists(select 1 from public.mw_edu_admins a where a.user_id=(select auth.uid())));
create function public.mw_edu_set_admin(account_email text, enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if auth.uid() is null or not public.mw_is_admin() then raise exception '대표 관리자만 권한을 관리할 수 있습니다.'; end if;
 select id into target from auth.users where lower(email)=lower(btrim(account_email)) and email_confirmed_at is not null;
 if target is null then raise exception '이메일 인증이 완료된 계정을 찾을 수 없습니다.'; end if;
 if enabled then insert into public.mw_edu_admins values(target) on conflict do nothing;
 else delete from public.mw_edu_admins where user_id=target; end if;
end;
$$;
revoke all on function public.mw_edu_set_admin(text,boolean) from public,anon,authenticated;
grant execute on function public.mw_edu_set_admin(text,boolean) to authenticated;
commit;