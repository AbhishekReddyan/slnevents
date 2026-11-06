-- =====================================================================
-- PHASE 3: status changes, owner order editing, shortfall + sourcing,
--          audit log, owner alerts
-- =====================================================================

create table order_events (            -- who did what, when (owner-only)
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  actor_id    uuid,
  actor_name  text,
  actor_role  text,
  action      text not null,           -- created | status | edited | qty_changed | sourcing | return
  summary     text not null,
  created_at  timestamptz not null default now()
);
create index order_events_order_idx on order_events (order_id, created_at);

create table alerts (                  -- owner notifications (owner-only)
  id         uuid primary key default gen_random_uuid(),
  type       text not null,            -- new_order | shortfall | worker_edit | return_issue
  order_id   uuid references orders(id) on delete cascade,
  message    text not null,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index alerts_unread_idx on alerts (created_at desc) where read_at is null;

create table sourcing_records (        -- extra stock arranged from outside suppliers
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders(id) on delete cascade,
  item_id    uuid not null references items(id) on delete restrict,
  supplier   text not null check (char_length(supplier) between 1 and 120),
  qty        int  not null check (qty > 0),
  cost       numeric(12,2) not null default 0 check (cost >= 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index sourcing_order_idx on sourcing_records (order_id);

-- order_items.sourced_qty always equals the sum of sourcing records for that line
create function sync_sourced_qty() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_order uuid := coalesce(new.order_id, old.order_id);
        v_item  uuid := coalesce(new.item_id,  old.item_id);
begin
  update order_items
     set sourced_qty = coalesce((select sum(qty) from sourcing_records where order_id = v_order and item_id = v_item), 0)
   where order_id = v_order and item_id = v_item;
  return null;
end $$;
create trigger sourcing_sync after insert or update or delete on sourcing_records
  for each row execute function sync_sourced_qty();

alter table order_events     enable row level security;
alter table alerts           enable row level security;
alter table sourcing_records enable row level security;
create policy events_owner   on order_events     for all to authenticated using (is_owner()) with check (is_owner());
create policy alerts_owner   on alerts           for all to authenticated using (is_owner()) with check (is_owner());
create policy sourcing_owner on sourcing_records for all to authenticated using (is_owner()) with check (is_owner());

alter publication supabase_realtime add table alerts;

-- ---------- internal helpers ----------
create function log_event(p_order uuid, p_action text, p_summary text) returns void
language sql security definer set search_path = public as $$
  insert into order_events (order_id, actor_id, actor_name, actor_role, action, summary)
  values (p_order, auth.uid(),
          coalesce((select full_name from profiles where id = auth.uid()), 'Customer'),
          coalesce(app_role(), 'customer'), p_action, p_summary)
$$;

create function add_alert(p_type text, p_order uuid, p_message text) returns void
language sql security definer set search_path = public as $$
  insert into alerts (type, order_id, message) values (p_type, p_order, p_message)
$$;

-- ---------- SHORTFALL ----------
-- For each line of an order: how many units cannot be covered from our own stock on
-- the worst day of the order. Works the same for pending and confirmed orders:
--   own_need  = qty - sourced
--   shortage  = clamp(own_need - (remaining WITHOUT this order, worst day), 0, own_need)
create function order_shortfall(p_order uuid)
returns table (item_id uuid, item_name text, qty int, sourced int, shortage int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare o orders%rowtype; buf int;
begin
  select * into o from orders where id = p_order;
  if not found then return; end if;
  select buffer_days into buf from settings where id = 1;
  return query
  select oi.item_id, i.name, oi.qty, oi.sourced_qty,
         least(greatest(oi.qty - oi.sourced_qty, 0),
               greatest(0, greatest(oi.qty - oi.sourced_qty, 0) - m.min_rem))::int
  from order_items oi
  join items i on i.id = oi.item_id
  cross join lateral (
    select min(item_remaining(oi.item_id, d::date, p_order)) as min_rem
    from generate_series(o.start_date::timestamp, (o.end_date + buf)::timestamp, interval '1 day') d
  ) m
  where oi.order_id = p_order;
end $$;

-- Orders that are waiting for approval or confirmed AND short of stock.
create function calc_orders_shortfalls() returns table (order_id uuid, total_shortage int)
language sql stable security definer set search_path = public as $$
  select o.id, sum(s.shortage)::int
  from orders o cross join lateral order_shortfall(o.id) s
  where o.status in ('pending_approval', 'confirmed')
  group by o.id having sum(s.shortage) > 0
$$;

-- Creates (de-duplicated) "needs sourcing" alerts for every short order.
create function scan_shortfalls() returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_msg text; v_no bigint;
begin
  for r in select order_id from calc_orders_shortfalls() loop
    select order_no into v_no from orders where id = r.order_id;
    select string_agg(item_name || ' short by ' || shortage, ', ' order by item_name)
      into v_msg from order_shortfall(r.order_id) where shortage > 0;
    v_msg := 'Order #' || v_no || ' needs sourcing: ' || v_msg;
    if not exists (select 1 from alerts where type = 'shortfall' and order_id = r.order_id
                   and message = v_msg and read_at is null) then
      perform add_alert('shortfall', r.order_id, v_msg);
    end if;
  end loop;
end $$;

-- Re-check whenever the owner changes stock numbers.
create function items_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform scan_shortfalls();
  return null;
end $$;
create trigger items_scan after update of total_qty, unavailable_qty on items
  for each statement execute function items_changed();

-- Owner-facing wrappers
create function orders_shortfalls() returns table (order_id uuid, total_shortage int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query select * from calc_orders_shortfalls();
end $$;

create function get_order_shortfall(p_order uuid)
returns table (item_id uuid, item_name text, qty int, sourced int, shortage int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query select * from order_shortfall(p_order);
end $$;

-- ---------- NEW CUSTOMER REQUEST: now also alerts the owner ----------
create or replace function submit_order(
  p_name text, p_phone text, p_address text, p_notes text,
  p_start date, p_end date, p_items jsonb
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_no bigint; v_oi uuid; r record; v_short text;
begin
  if char_length(trim(coalesce(p_name, ''))) = 0 or char_length(p_name) > 120 then raise exception 'Please enter your name'; end if;
  if char_length(trim(coalesce(p_phone, ''))) < 5 or char_length(p_phone) > 20 then raise exception 'Please enter a valid phone number'; end if;
  if char_length(trim(coalesce(p_address, ''))) = 0 or char_length(p_address) > 500 then raise exception 'Please enter your address'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'Please choose valid event dates'; end if;
  if p_start < shop_today() then raise exception 'The start date cannot be in the past'; end if;
  if p_end - p_start > 60 then raise exception 'Events longer than 60 days: please call us'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Please choose at least one item';
  end if;

  insert into orders (customer_name, phone, address, notes, start_date, end_date)
  values (trim(p_name), trim(p_phone), trim(p_address), nullif(trim(coalesce(p_notes, '')), ''), p_start, p_end)
  returning id, order_no into v_id, v_no;

  for r in
    select (e->>'item_id')::uuid as item_id, sum((e->>'qty')::int) as qty
    from jsonb_array_elements(p_items) e group by 1
  loop
    if r.qty <= 0 or r.qty > 100000 then raise exception 'Invalid quantity'; end if;
    if not exists (select 1 from items where id = r.item_id and active) then raise exception 'An item is no longer available'; end if;
    insert into order_items (order_id, item_id, qty) values (v_id, r.item_id, r.qty) returning id into v_oi;
    insert into order_item_prices (order_item_id, price_per_day)
    values (v_oi, coalesce((select price_per_day from item_prices where item_id = r.item_id), 0));
  end loop;
  insert into order_prices (order_id) values (v_id);

  perform log_event(v_id, 'created', 'Request submitted by customer');
  perform add_alert('new_order', v_id, 'New request #' || v_no || ' from ' || trim(p_name) || ' (' || p_start || ' to ' || p_end || ')');
  perform scan_shortfalls();   -- raises a "needs sourcing" alert if the request exceeds stock
  return v_no;
end $$;

-- ---------- STATUS CHANGES (owner and worker; rules enforced here) ----------
create function transition_ok(p_old order_status, p_new order_status, p_role text) returns boolean
language sql immutable as $$
  select case
    when p_role = 'owner' then (p_old::text, p_new::text) in (
      ('pending_approval','confirmed'), ('pending_approval','declined'), ('pending_approval','cancelled'),
      ('confirmed','loaded'), ('confirmed','cancelled'),
      ('loaded','delivered'), ('loaded','cancelled'),
      ('delivered','picked_up'),
      ('returned','closed'))
    when p_role = 'worker' then (p_old::text, p_new::text) in (
      ('confirmed','loaded'), ('loaded','delivered'), ('delivered','picked_up'))
    else false end
$$;

-- 'returned' is reached only through check_in_return() in migration 004.
create function set_order_status(p_order uuid, p_status order_status, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; v_role text := app_role();
begin
  if v_role not in ('owner', 'worker') then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if not transition_ok(o.status, p_status, v_role) then
    raise exception 'Cannot change status from % to %', o.status, p_status;
  end if;
  if v_role = 'worker' and p_status in ('loaded', 'delivered')
     and exists (select 1 from order_items where order_id = p_order and not loaded) then
    raise exception 'Tick every item on the loading checklist first';
  end if;

  update orders set status = p_status, updated_at = now(),
         decline_reason = case when p_status = 'declined' then nullif(trim(p_reason), '') else decline_reason end
   where id = p_order;
  perform log_event(p_order, 'status', 'Status: ' || o.status || ' → ' || p_status
                    || coalesce(' (' || nullif(trim(p_reason), '') || ')', ''));
  if p_status = 'confirmed' then perform scan_shortfalls(); end if;
end $$;

-- ---------- OWNER EDITS AN ORDER (items, quantities, dates, prices) ----------
create function items_snapshot(p_order uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(i.name, jsonb_build_object('qty', oi.qty, 'price', p.price_per_day)), '{}'::jsonb)
  from order_items oi
  join items i on i.id = oi.item_id
  left join order_item_prices p on p.order_item_id = oi.id
  where oi.order_id = p_order
$$;

create function diff_summary(b jsonb, a jsonb) returns text
language plpgsql immutable as $$
declare k text; parts text[] := '{}';
begin
  for k in select jsonb_object_keys(a) loop
    if not (b ? k) then
      parts := parts || format('added %s × %s', k, a->k->>'qty');
    else
      if (a->k->>'qty') <> (b->k->>'qty') then parts := parts || format('%s qty %s → %s', k, b->k->>'qty', a->k->>'qty'); end if;
      if (a->k->>'price') is distinct from (b->k->>'price') then parts := parts || format('%s price %s → %s', k, b->k->>'price', a->k->>'price'); end if;
    end if;
  end loop;
  for k in select jsonb_object_keys(b) loop
    if not (a ? k) then parts := parts || format('removed %s', k); end if;
  end loop;
  return array_to_string(parts, '; ');
end $$;

create function owner_save_order(
  p_order uuid, p_name text, p_phone text, p_address text, p_notes text,
  p_start date, p_end date, p_discount numeric, p_lines jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; v_before jsonb; v_after jsonb; v_oi uuid; r record;
  v_old_discount numeric; parts text[] := '{}'; v_summary text;
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
  select discount into v_old_discount from order_prices where order_id = p_order;

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

  insert into order_prices (order_id, discount) values (p_order, greatest(coalesce(p_discount, 0), 0))
    on conflict (order_id) do update set discount = excluded.discount;

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

-- ---------- SOURCING ----------
create function add_sourcing(p_order uuid, p_item uuid, p_supplier text, p_qty int, p_cost numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not is_owner() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from order_items where order_id = p_order and item_id = p_item) then
    raise exception 'That item is not on this order';
  end if;
  insert into sourcing_records (order_id, item_id, supplier, qty, cost)
  values (p_order, p_item, trim(p_supplier), p_qty, coalesce(p_cost, 0));
  select name into v_name from items where id = p_item;
  perform log_event(p_order, 'sourcing', format('Sourced %s × %s from %s (cost %s)', p_qty, v_name, trim(p_supplier), coalesce(p_cost, 0)));
end $$;

create function remove_sourcing(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r sourcing_records%rowtype;
begin
  if not is_owner() then raise exception 'Not allowed' using errcode = '42501'; end if;
  delete from sourcing_records where id = p_id returning * into r;
  if found then
    perform log_event(r.order_id, 'sourcing', format('Removed sourcing record: %s × %s from %s', r.qty, (select name from items where id = r.item_id), r.supplier));
    perform scan_shortfalls();
  end if;
end $$;

-- ---------- function permissions ----------
revoke execute on function log_event(uuid, text, text)            from public, anon, authenticated;
revoke execute on function add_alert(text, uuid, text)            from public, anon, authenticated;
revoke execute on function order_shortfall(uuid)                  from public, anon, authenticated;
revoke execute on function calc_orders_shortfalls()               from public, anon, authenticated;
revoke execute on function scan_shortfalls()                      from public, anon, authenticated;
revoke execute on function items_changed()                        from public, anon, authenticated;
revoke execute on function sync_sourced_qty()                     from public, anon, authenticated;
revoke execute on function items_snapshot(uuid)                   from public, anon, authenticated;
revoke execute on function diff_summary(jsonb, jsonb)             from public, anon, authenticated;
revoke execute on function transition_ok(order_status, order_status, text) from public, anon, authenticated;

revoke execute on function orders_shortfalls()                    from public, anon;
revoke execute on function get_order_shortfall(uuid)              from public, anon;
revoke execute on function set_order_status(uuid, order_status, text) from public, anon;
revoke execute on function owner_save_order(uuid, text, text, text, text, date, date, numeric, jsonb) from public, anon;
revoke execute on function add_sourcing(uuid, uuid, text, int, numeric) from public, anon;
revoke execute on function remove_sourcing(uuid)                  from public, anon;
grant execute on function orders_shortfalls()                     to authenticated;
grant execute on function get_order_shortfall(uuid)               to authenticated;
grant execute on function set_order_status(uuid, order_status, text) to authenticated;
grant execute on function owner_save_order(uuid, text, text, text, text, date, date, numeric, jsonb) to authenticated;
grant execute on function add_sourcing(uuid, uuid, text, int, numeric) to authenticated;
grant execute on function remove_sourcing(uuid)                   to authenticated;
-- submit_order keeps its anon + authenticated grant from migration 002.
