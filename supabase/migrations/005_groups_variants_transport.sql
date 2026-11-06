-- =====================================================================
-- 005: remove categories from use, add sizes/options (groups), icons,
--      display order, and an owner-only TRANSPORT charge on each order.
-- Run after 001-004. Safe to run once.
--
-- How sizes/options work: every size or option is its own stock item
-- ("Annada Patre 25 kg"), so stock, availability and shortfall maths keep
-- working per size. Items that share a group_name are shown together on the
-- customer page, one row per option.
-- =====================================================================

alter table items
  add column group_name    text,                       -- e.g. 'Annada Patre'. Empty = standalone item
  add column variant_label text,                       -- e.g. '25 kg', '20x20', 'Mysorpak'
  add column emoji         text,                       -- icon shown when there is no photo
  add column sort_order    int not null default 0;     -- order on the customer page

alter table order_prices
  add column transport numeric(12,2) not null default 0 check (transport >= 0);

-- ---------- customer catalogue ----------
drop function public_catalog();
create function public_catalog()
returns table (id uuid, name text, group_name text, variant_label text, emoji text,
               photo_url text, price_per_day numeric, sort_order int)
language sql stable security definer set search_path = public as $$
  select i.id, i.name, i.group_name, i.variant_label, i.emoji, i.photo_url,
         case when (select s.show_prices from settings s where s.id = 1) then p.price_per_day else null end,
         i.sort_order
  from items i
  left join item_prices p on p.item_id = i.id
  where i.active
  order by i.sort_order, i.name
$$;
grant execute on function public_catalog() to anon, authenticated;

-- ---------- date view: "category" column now carries the group ----------
create or replace function availability_range(p_start date, p_end date)
returns table (
  item_id uuid, item_name text, category text, day date,
  total int, unavailable int, booked int, pending int, remaining int
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_end < p_start or p_end - p_start > 365 then raise exception 'Bad date range'; end if;
  return query
  select i.id, i.name, i.group_name, d::date,
         i.total_qty, i.unavailable_qty,
         stock_booked(i.id, d::date),
         coalesce((
           select sum(oi.qty) from order_items oi join orders o on o.id = oi.order_id
           where oi.item_id = i.id and o.status = 'pending_approval'
             and d::date between o.start_date and o.end_date
         ), 0)::int,
         i.total_qty - i.unavailable_qty - stock_booked(i.id, d::date)
  from items i
  cross join generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') d
  where i.active
  order by i.sort_order, i.name, d;
end $$;

-- ---------- owner edit: now includes transport ----------
drop function owner_save_order(uuid, text, text, text, text, date, date, numeric, jsonb);

create function owner_save_order(
  p_order uuid, p_name text, p_phone text, p_address text, p_notes text,
  p_start date, p_end date, p_discount numeric, p_lines jsonb, p_transport numeric default 0
) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; v_before jsonb; v_after jsonb; v_oi uuid; r record;
  v_old_discount numeric; v_old_transport numeric; parts text[] := '{}'; v_summary text;
begin
  if not is_owner() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status not in ('pending_approval', 'confirmed', 'loaded', 'delivered') then
    raise exception 'This order can no longer be edited';
  end if;
  if p_end < p_start then raise exception 'End date cannot be before start date'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 or char_length(trim(coalesce(p_phone, ''))) < 5
     or char_length(trim(coalesce(p_address, ''))) = 0 then raise exception 'Customer name, phone and address are required'; end if;
  if jsonb_typeof(p_lines) <> 'array'
     or not exists (select 1 from jsonb_array_elements(p_lines) e where (e->>'qty')::int > 0) then
    raise exception 'An order needs at least one item';
  end if;

  v_before := items_snapshot(p_order);
  select discount, transport into v_old_discount, v_old_transport from order_prices where order_id = p_order;

  delete from order_items
   where order_id = p_order
     and item_id not in (select (e->>'item_id')::uuid from jsonb_array_elements(p_lines) e where (e->>'qty')::int > 0);

  for r in
    select (e->>'item_id')::uuid as item_id, (e->>'qty')::int as qty,
           greatest(coalesce((e->>'price_per_day')::numeric, 0), 0) as price
    from jsonb_array_elements(p_lines) e where (e->>'qty')::int > 0
  loop
    select id into v_oi from order_items where order_id = p_order and item_id = r.item_id;
    if v_oi is null then
      insert into order_items (order_id, item_id, qty) values (p_order, r.item_id, r.qty) returning id into v_oi;
    else
      update order_items set qty = r.qty, loaded = case when qty <> r.qty then false else loaded end where id = v_oi;
    end if;
    insert into order_item_prices (order_item_id, price_per_day) values (v_oi, r.price)
      on conflict (order_item_id) do update set price_per_day = excluded.price_per_day;
  end loop;

  insert into order_prices (order_id, discount, transport)
  values (p_order, greatest(coalesce(p_discount, 0), 0), greatest(coalesce(p_transport, 0), 0))
  on conflict (order_id) do update set discount = excluded.discount, transport = excluded.transport;

  if o.start_date <> p_start or o.end_date <> p_end then
    parts := parts || format('dates %s – %s → %s – %s', o.start_date, o.end_date, p_start, p_end);
  end if;
  if o.customer_name <> trim(p_name) or o.phone <> trim(p_phone) or o.address <> trim(p_address)
     or o.notes is distinct from nullif(trim(coalesce(p_notes, '')), '') then
    parts := parts || 'customer details changed';
  end if;
  if coalesce(v_old_discount, 0) <> greatest(coalesce(p_discount, 0), 0) then
    parts := parts || format('discount %s → %s', coalesce(v_old_discount, 0), greatest(coalesce(p_discount, 0), 0));
  end if;
  if coalesce(v_old_transport, 0) <> greatest(coalesce(p_transport, 0), 0) then
    parts := parts || format('transport %s → %s', coalesce(v_old_transport, 0), greatest(coalesce(p_transport, 0), 0));
  end if;

  update orders set customer_name = trim(p_name), phone = trim(p_phone), address = trim(p_address),
         notes = nullif(trim(coalesce(p_notes, '')), ''), start_date = p_start, end_date = p_end, updated_at = now()
   where id = p_order;

  v_after := items_snapshot(p_order);
  v_summary := array_to_string(parts, '; ');
  if diff_summary(v_before, v_after) <> '' then
    v_summary := trim(both '; ' from v_summary || '; ' || diff_summary(v_before, v_after));
  end if;
  if v_summary <> '' then
    perform log_event(p_order, 'edited', 'Owner edited order: ' || v_summary);
    perform scan_shortfalls();
  end if;
end $$;

revoke execute on function owner_save_order(uuid, text, text, text, text, date, date, numeric, jsonb, numeric) from public, anon;
grant  execute on function owner_save_order(uuid, text, text, text, text, date, date, numeric, jsonb, numeric) to authenticated;
