begin;
alter table public.mw_edu_content add column photo_paths text[] not null default '{}';
alter table public.mw_edu_content add constraint mw_edu_photo_paths_check check(
 coalesce(array_ndims(photo_paths),1)=1 and cardinality(photo_paths)<=case when kind='faculty' then 1 else 10 end
 and array_position(photo_paths,null) is null
 and array_to_string(photo_paths,',') ~ '^([0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)(,[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp))*)?$'
);
alter policy edu_photo_read on storage.objects using (
 bucket_id='mw-edu-photos' and exists(select 1 from public.mw_edu_content c where
 storage.objects.name=any(c.photo_paths) or (cardinality(c.photo_paths)=0 and c.photo_path=storage.objects.name)));
commit;