-- =====================================================================
-- 006: Kannada names for items (customer and worker screens can show Kannada).
-- Run after 005. Then run supabase/seed.sql again: it is safe to re-run and
-- fills in the Kannada names for the items from your slip.
-- =====================================================================

alter table items
  add column name_kn          text,    -- full item name in Kannada
  add column group_name_kn    text,    -- group heading in Kannada
  add column variant_label_kn text;    -- size / option in Kannada

drop function public_catalog();
create function public_catalog()
returns table (id uuid, name text, name_kn text, group_name text, group_name_kn text,
               variant_label text, variant_label_kn text, emoji text,
               photo_url text, price_per_day numeric, sort_order int)
language sql stable security definer set search_path = public as $$
  select i.id, i.name, i.name_kn, i.group_name, i.group_name_kn,
         i.variant_label, i.variant_label_kn, i.emoji, i.photo_url,
         case when (select s.show_prices from settings s where s.id = 1) then p.price_per_day else null end,
         i.sort_order
  from items i
  left join item_prices p on p.item_id = i.id
  where i.active
  order by i.sort_order, i.name
$$;
grant execute on function public_catalog() to anon, authenticated;
