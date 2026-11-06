-- 009: business logo (owner uploads it in Settings; shown on every page)
-- The image file itself goes in the existing public "item-photos" bucket (owner-only write).

alter table settings add column if not exists logo_url text;

create or replace function public_logo() returns text
language sql stable security definer set search_path = public as $$
  select logo_url from settings where id = 1
$$;
grant execute on function public_logo() to anon, authenticated;
