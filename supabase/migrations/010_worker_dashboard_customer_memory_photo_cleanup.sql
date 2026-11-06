-- =====================================================================
-- 010: worker dashboard data, "remember the customer" support, photo auto-delete.
-- Safe to run again. (If you already ran 011, run 011's last line again afterwards: it closes the anonymous order function.)
-- =====================================================================

-- ---------- 1. WORKER DASHBOARD ----------
-- Returns only safe columns (no prices, no money) for orders that matter today.
-- today = shop_today() (shop time zone from the settings table).
-- Closed/returned orders are included only while their event is running, so the
-- "done" counts for today do not drop when the owner closes an order.
create or replace function worker_dashboard() returns json
language plpgsql stable security definer set search_path = public as $$
declare v_today date := shop_today();
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return json_build_object(
    'today', v_today,
    'orders', coalesce((
      select json_agg(json_build_object(
               'id', o.id, 'order_no', o.order_no, 'customer_name', o.customer_name,
               'phone', o.phone, 'address', o.address,
               'start_date', o.start_date, 'end_date', o.end_date, 'status', o.status)
             order by o.start_date, o.order_no)
      from orders o
      where (o.status in ('confirmed', 'loaded', 'delivered', 'picked_up') and o.start_date <= v_today)
         or (o.status in ('returned', 'closed') and o.start_date <= v_today and o.end_date >= v_today)
    ), '[]'::json)
  );
end $$;

revoke execute on function worker_dashboard() from public, anon;
grant  execute on function worker_dashboard() to authenticated;

-- ---------- 2. REMEMBER THE CUSTOMER ----------
-- submit_order gets a 9th argument: the tracking tokens this device already holds.
-- When a request merges into an existing order, the token (and order number) is
-- returned ONLY if the device already holds that order's token. A phone number alone
-- is not proof of identity, so a stranger who types someone else's number and dates
-- gets "your items will be added" but no link to read the order.
-- (An OTP check could later replace this rule: verify the phone, then return the token.)
drop function if exists submit_order(text, text, text, text, date, date, jsonb, jsonb);

drop function if exists submit_order(text, text, text, text, date, date, jsonb, jsonb, uuid[]);

create function submit_order(
  p_name text, p_phone text, p_address text, p_notes text,
  p_start date, p_end date, p_items jsonb, p_decorations jsonb default '[]'::jsonb,
  p_known_tokens uuid[] default '{}'
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_no bigint; v_oi uuid; r record; v_merged boolean := false;
  v_key text; v_added text[] := '{}'; v_name text; v_token uuid; v_show boolean;
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

  select id, order_no, track_token into v_id, v_no, v_token
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
    returning id, order_no, track_token into v_id, v_no, v_token;
    insert into order_prices (order_id) values (v_id);
  end if;

  -- a new order always belongs to the caller; a merged one only if the device holds its token
  v_show := (not v_merged) or (v_token = any(coalesce(p_known_tokens, '{}')));

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
  return json_build_object(
    'merged', v_merged,
    'order_no', case when v_show then v_no end,
    'token',    case when v_show then v_token end
  );
end $$;

grant execute on function submit_order(text, text, text, text, date, date, jsonb, jsonb, uuid[]) to anon, authenticated;

-- ---------- 3. PHOTO AUTO-DELETE ----------
alter table settings add column if not exists photo_retention_days int not null default 2
  check (photo_retention_days between 0 and 365);

alter table orders
  add column if not exists photos_deleted_at timestamptz,
  add column if not exists photos_deleted_by text check (photos_deleted_by in ('auto', 'owner'));

-- First day on which an order's photos may be deleted (the daily cleanup deletes them on or after it).
--   = latest of (event end date, date the last outstanding item was resolved) + retention days + 1
-- so with 2 days retention, an event ending on the 10th loses its photos on the 13th.
-- NULL = not scheduled: items are still outstanding, or the order has not been picked up yet.
create or replace function photo_delete_on(p_order uuid) returns date
language plpgsql stable security definer set search_path = public as $$
declare o orders%rowtype; s settings%rowtype; v_last date;
begin
  -- signed-in users must be the owner; the service role (cleanup job) has no auth.uid()
  if auth.uid() is not null and not is_owner() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into o from orders where id = p_order;
  if not found then return null; end if;
  select * into s from settings where id = 1;
  if o.status::text not in ('picked_up', 'returned', 'closed', 'cancelled') then return null; end if;
  if exists (select 1 from outstanding_items where order_id = p_order and status = 'open') then return null; end if;
  select max((resolved_at at time zone s.timezone)::date) into v_last
    from outstanding_items where order_id = p_order and resolved_at is not null;
  return greatest(o.end_date, coalesce(v_last, o.end_date)) + s.photo_retention_days + 1;
end $$;

revoke execute on function photo_delete_on(uuid) from public, anon;
grant  execute on function photo_delete_on(uuid) to authenticated, service_role;

-- Photos that are due now (at most 2000 per run; the next run continues). Service role only.
create or replace function photo_cleanup_candidates() returns table (order_id uuid, photo_id uuid, path text)
language sql stable security definer set search_path = public as $$
  select p.order_id, p.id, p.path
    from order_item_photos p
   where photo_delete_on(p.order_id) <= shop_today()
   order by p.created_at
   limit 2000
$$;

-- Removes the database rows for photos whose files were already removed from Storage.
-- Safe to run twice: rows that are gone are simply not counted.
create or replace function finish_photo_cleanup(p_order uuid, p_photo_ids uuid[], p_by text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_by not in ('auto', 'owner') then raise exception 'Invalid value'; end if;
  with d as (
    delete from order_item_photos where order_id = p_order and id = any(coalesce(p_photo_ids, '{}')) returning 1
  ) select count(*) into n from d;

  if n > 0 then
    if not exists (select 1 from order_item_photos where order_id = p_order) then
      update orders set photos_deleted_at = now(), photos_deleted_by = p_by where id = p_order;
    end if;
    perform log_event(p_order, 'edited',
      case when p_by = 'auto' then format('Photos deleted automatically (%s)', n)
           else format('Owner deleted the photos (%s)', n) end);
  end if;
  return n;
end $$;

revoke execute on function photo_cleanup_candidates()          from public, anon, authenticated;
revoke execute on function finish_photo_cleanup(uuid, uuid[], text) from public, anon, authenticated;
grant  execute on function photo_cleanup_candidates()          to service_role;
grant  execute on function finish_photo_cleanup(uuid, uuid[], text) to service_role;
