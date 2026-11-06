-- =====================================================================
-- 007: worker mobile numbers, flower-decoration gallery (images only, no price),
--      repeat orders from the same customer are merged, business name.
-- Run after 006.
-- =====================================================================

-- ---------- business name ----------
alter table settings alter column business_name set default 'SLN Tent House';
update settings set business_name = 'SLN Tent House' where id = 1;

-- ---------- worker mobile number (shown on the Staff page) ----------
alter table profiles add column phone text;
create unique index profiles_phone_idx on profiles (phone) where phone is not null;

-- ---------- decoration gallery ----------
create table decorations (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 120),
  title_kn   text,
  photo_url  text,
  active     boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table order_decorations (
  order_id      uuid not null references orders(id) on delete cascade,
  decoration_id uuid not null references decorations(id) on delete restrict,
  primary key (order_id, decoration_id)
);

-- Decoration price depends on the season, so it is entered per order by the owner.
alter table order_prices add column decoration_charge numeric(12,2) not null default 0 check (decoration_charge >= 0);

alter table decorations       enable row level security;
alter table order_decorations enable row level security;

create policy decorations_read  on decorations for select to authenticated using (is_staff());
create policy decorations_write on decorations for all    to authenticated using (is_owner()) with check (is_owner());

create policy order_decorations_owner on order_decorations for all to authenticated
  using (is_owner()) with check (is_owner());
create policy order_decorations_worker_read on order_decorations for select to authenticated
  using (
    app_role() = 'worker'
    and exists (select 1 from orders o where o.id = order_decorations.order_id
                and o.status in ('confirmed', 'loaded', 'delivered', 'picked_up', 'returned'))
  );

-- customers see only the gallery (no prices exist for it)
create function public_decorations()
returns table (id uuid, title text, title_kn text, photo_url text)
language sql stable security definer set search_path = public as $$
  select d.id, d.title, d.title_kn, d.photo_url
  from decorations d where d.active order by d.sort_order, d.title
$$;
grant execute on function public_decorations() to anon, authenticated;

-- ---------- customer request: now with decorations, and MERGES repeat orders ----------
-- If the same mobile number already has a request or confirmed order (not yet loaded)
-- for exactly the same dates, new items are added to that order instead of creating
-- a second one. Different dates = a new order.
drop function submit_order(text, text, text, text, date, date, jsonb);

create function submit_order(
  p_name text, p_phone text, p_address text, p_notes text,
  p_start date, p_end date, p_items jsonb, p_decorations jsonb default '[]'::jsonb
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_no bigint; v_oi uuid; r record; v_merged boolean := false;
  v_key text; v_added text[] := '{}'; v_name text; v_status order_status;
begin
  if char_length(trim(coalesce(p_name, ''))) = 0 or char_length(p_name) > 120 then raise exception 'Please enter your name'; end if;
  if char_length(trim(coalesce(p_phone, ''))) < 5 or char_length(p_phone) > 20 then raise exception 'Please enter a valid phone number'; end if;
  if char_length(trim(coalesce(p_address, ''))) = 0 or char_length(p_address) > 500 then raise exception 'Please enter your address'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'Please choose valid event dates'; end if;
  if p_start < shop_today() then raise exception 'The start date cannot be in the past'; end if;
  if p_end - p_start > 60 then raise exception 'Events longer than 60 days: please call us'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100
     or jsonb_typeof(p_decorations) <> 'array' or jsonb_array_length(p_decorations) > 50
     or jsonb_array_length(p_items) + jsonb_array_length(p_decorations) = 0 then
    raise exception 'Please choose at least one item';
  end if;

  v_key := right(regexp_replace(p_phone, '\D', '', 'g'), 10);

  select id, order_no, status into v_id, v_no, v_status
    from orders
   where right(regexp_replace(phone, '\D', '', 'g'), 10) = v_key
     and start_date = p_start and end_date = p_end
     and status in ('pending_approval', 'confirmed')
   order by created_at desc limit 1
   for update;

  if v_id is not null then
    v_merged := true;
    if nullif(trim(coalesce(p_notes, '')), '') is not null then
      update orders set notes = left(coalesce(notes || E'\n', '') || trim(p_notes), 1000), updated_at = now() where id = v_id;
    end if;
  else
    insert into orders (customer_name, phone, address, notes, start_date, end_date)
    values (trim(p_name), trim(p_phone), trim(p_address), nullif(trim(coalesce(p_notes, '')), ''), p_start, p_end)
    returning id, order_no into v_id, v_no;
    insert into order_prices (order_id) values (v_id);
  end if;

  for r in
    select (e->>'item_id')::uuid as item_id, sum((e->>'qty')::int) as qty
    from jsonb_array_elements(p_items) e group by 1
  loop
    if r.qty <= 0 or r.qty > 100000 then raise exception 'Invalid quantity'; end if;
    select name into v_name from items where id = r.item_id and active;
    if v_name is null then raise exception 'An item is no longer available'; end if;

    select id into v_oi from order_items where order_id = v_id and item_id = r.item_id;
    if v_oi is null then
      insert into order_items (order_id, item_id, qty) values (v_id, r.item_id, r.qty) returning id into v_oi;
      insert into order_item_prices (order_item_id, price_per_day)
      values (v_oi, coalesce((select price_per_day from item_prices where item_id = r.item_id), 0));
    else
      update order_items set qty = qty + r.qty, loaded = false where id = v_oi;
    end if;
    v_added := v_added || format('%s × %s', r.qty, v_name);
  end loop;

  insert into order_decorations (order_id, decoration_id)
  select v_id, d.id from decorations d
   where d.active and d.id in (select distinct x::uuid from jsonb_array_elements_text(p_decorations) x)
  on conflict do nothing;
  if jsonb_array_length(p_decorations) > 0 then v_added := v_added || (jsonb_array_length(p_decorations) || ' decoration(s)'); end if;

  if v_merged then
    perform log_event(v_id, 'edited', 'Customer added to this order: ' || array_to_string(v_added, ', '));
    perform add_alert('order_updated', v_id,
      'Customer ' || trim(p_name) || ' added items to Order #' || v_no || ': ' || array_to_string(v_added, ', '));
  else
    perform log_event(v_id, 'created', 'Request submitted by customer');
    perform add_alert('new_order', v_id,
      'New request #' || v_no || ' from ' || trim(p_name) || ' (' || p_start || ' to ' || p_end || ')');
  end if;
  perform scan_shortfalls();
  return json_build_object('order_no', v_no, 'merged', v_merged);
end $$;

grant execute on function submit_order(text, text, text, text, date, date, jsonb, jsonb) to anon, authenticated;

-- ---------- owner chooses decorations + decoration charge for an order ----------
create function owner_set_decorations(p_order uuid, p_ids uuid[], p_charge numeric) returns void
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  if not is_owner() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status not in ('pending_approval', 'confirmed', 'loaded', 'delivered') then
    raise exception 'This order can no longer be edited';
  end if;
  delete from order_decorations where order_id = p_order and not (decoration_id = any(coalesce(p_ids, '{}')));
  insert into order_decorations (order_id, decoration_id)
  select p_order, d.id from decorations d where d.id = any(coalesce(p_ids, '{}'))
  on conflict do nothing;
  insert into order_prices (order_id, decoration_charge) values (p_order, greatest(coalesce(p_charge, 0), 0))
  on conflict (order_id) do update set decoration_charge = excluded.decoration_charge;
  update orders set updated_at = now() where id = p_order;
  perform log_event(p_order, 'edited', format('Owner updated decorations (%s selected), decoration charge %s',
                    coalesce(array_length(p_ids, 1), 0), greatest(coalesce(p_charge, 0), 0)));
end $$;

revoke execute on function owner_set_decorations(uuid, uuid[], numeric) from public, anon;
grant  execute on function owner_set_decorations(uuid, uuid[], numeric) to authenticated;
