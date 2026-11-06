-- =====================================================================
-- 011: customer accounts (mobile number + 4-digit PIN), orders linked to the account,
--      delivery/pickup photos visible to the customer who owns the order.
-- Run once, after 010.
-- All customer functions are callable ONLY by the server (service role). The browser can
-- never call them, and the customers table has row-level security with no policies.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists customers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 1 and 120),
  phone           text not null unique check (phone ~ '^[6-9][0-9]{9}$'),
  pin_hash        text not null,
  failed_attempts int  not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now()
);
alter table customers enable row level security;   -- no policies: nobody but the service role can read it

alter table orders add column if not exists customer_id uuid references customers(id) on delete set null;
create index if not exists orders_customer_idx on orders (customer_id);

-- ---------- register ----------
create or replace function customer_register(p_name text, p_phone text, p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if char_length(trim(coalesce(p_name, ''))) = 0 or char_length(p_name) > 120 then
    return json_build_object('ok', false, 'error', 'Please enter your name.');
  end if;
  if p_phone is null or p_phone !~ '^[6-9][0-9]{9}$' then
    return json_build_object('ok', false, 'error', 'Enter a valid 10-digit mobile number.');
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return json_build_object('ok', false, 'error', 'The PIN must be exactly 4 digits.');
  end if;
  if exists (select 1 from customers where phone = p_phone) then
    return json_build_object('ok', false, 'error', 'This mobile number is already registered. Please log in.');
  end if;
  insert into customers (name, phone, pin_hash)
  values (trim(p_name), p_phone, crypt(p_pin, gen_salt('bf', 8)))
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'name', trim(p_name));
end $$;

-- ---------- login (5 wrong PINs = 15 minute lock, 10 = 24 hours) ----------
-- Failures are RETURNED, not raised, so the failure counter is saved.
create or replace function customer_login(p_phone text, p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare c customers%rowtype; v_fail int; v_lock timestamptz;
begin
  select * into c from customers where phone = p_phone for update;
  if not found then
    perform crypt(coalesce(p_pin, ''), gen_salt('bf', 8));   -- same work whether or not the number exists
    return json_build_object('ok', false, 'error', 'Wrong mobile number or PIN.');
  end if;
  if c.locked_until is not null and c.locked_until > now() then
    return json_build_object('ok', false, 'error',
      format('Too many wrong attempts. Try again in %s minute(s).', greatest(1, ceil(extract(epoch from (c.locked_until - now())) / 60)::int)));
  end if;
  if p_pin ~ '^[0-9]{4}$' and c.pin_hash = crypt(p_pin, c.pin_hash) then
    update customers set failed_attempts = 0, locked_until = null where id = c.id;
    return json_build_object('ok', true, 'id', c.id, 'name', c.name);
  end if;
  v_fail := c.failed_attempts + 1;
  v_lock := case when v_fail >= 10 then now() + interval '24 hours'
                 when v_fail % 5 = 0 then now() + interval '15 minutes' end;
  update customers set failed_attempts = v_fail, locked_until = coalesce(v_lock, locked_until) where id = c.id;
  return json_build_object('ok', false, 'error', 'Wrong mobile number or PIN.');
end $$;

-- ---------- place an order for a logged-in customer ----------
-- Name and phone come from the account. Repeat requests with the same dates merge only into
-- this customer's own order (never into someone else's order that happens to share a number).
create or replace function customer_submit_order(
  p_customer uuid, p_address text, p_notes text,
  p_start date, p_end date, p_items jsonb, p_decorations jsonb default '[]'::jsonb
) returns json
language plpgsql security definer set search_path = public as $$
declare
  c customers%rowtype;
  v_id uuid; v_no bigint; v_oi uuid; r record; v_merged boolean := false;
  v_added text[] := '{}'; v_name text;
begin
  select * into c from customers where id = p_customer;
  if not found then raise exception 'Please log in again'; end if;
  if char_length(trim(coalesce(p_address, ''))) = 0 or char_length(p_address) > 500 then raise exception 'Please enter your address'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'Please choose valid event dates'; end if;
  if p_start < shop_today() then raise exception 'The start date cannot be in the past'; end if;
  if p_end - p_start > 60 then raise exception 'Events longer than 60 days: please call us'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100
     or jsonb_typeof(p_decorations) <> 'array' or jsonb_array_length(p_decorations) > 50
     or jsonb_array_length(p_items) + jsonb_array_length(p_decorations) = 0 then
    raise exception 'Please choose at least one item';
  end if;

  select id, order_no into v_id, v_no
    from orders
   where customer_id = c.id and start_date = p_start and end_date = p_end
     and status in ('pending_approval', 'confirmed')
   order by created_at desc limit 1
   for update;

  if v_id is not null then
    v_merged := true;
    if nullif(trim(coalesce(p_notes, '')), '') is not null then
      update orders set notes = left(coalesce(notes || E'\n', '') || trim(p_notes), 1000), updated_at = now() where id = v_id;
    end if;
  else
    insert into orders (customer_id, customer_name, phone, address, notes, start_date, end_date)
    values (c.id, c.name, c.phone, trim(p_address), nullif(trim(coalesce(p_notes, '')), ''), p_start, p_end)
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
      'Customer ' || c.name || ' added items to Order #' || v_no || ': ' || array_to_string(v_added, ', '));
  else
    perform log_event(v_id, 'created', 'Request submitted by customer');
    perform add_alert('new_order', v_id,
      'New request #' || v_no || ' from ' || c.name || ' (' || p_start || ' to ' || p_end || ')');
  end if;
  perform scan_shortfalls();
  return json_build_object('id', v_id, 'order_no', v_no, 'merged', v_merged);
end $$;

-- ---------- the customer's own orders ----------
create or replace function customer_orders(p_customer uuid) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'id', o.id, 'order_no', o.order_no, 'status', o.status,
           'start_date', o.start_date, 'end_date', o.end_date,
           'item_count', (select coalesce(sum(qty), 0) from order_items where order_id = o.id),
           'photo_count', (select count(*) from order_item_photos where order_id = o.id)
         ) order by o.created_at desc), '[]'::json)
  from orders o where o.customer_id = p_customer
$$;

-- ---------- one order with delivery/pickup photos (only if it belongs to the customer) ----------
create or replace function customer_order_detail(p_customer uuid, p_order uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', o.id, 'order_no', o.order_no, 'status', o.status, 'address', o.address,
    'start_date', o.start_date, 'end_date', o.end_date,
    'photos_deleted_at', o.photos_deleted_at,
    'items', coalesce((
       select json_agg(json_build_object(
                'id', oi.id, 'name', i.name, 'name_kn', i.name_kn, 'qty', oi.qty,
                'delivered', oi.delivered_qty, 'pickup', oi.pickup_qty,
                'photos', coalesce((
                   select json_agg(json_build_object('id', p.id, 'kind', p.kind, 'path', p.path, 'created_at', p.created_at)
                                   order by p.created_at)
                   from order_item_photos p where p.order_item_id = oi.id), '[]'::json))
              order by i.sort_order, i.name)
       from order_items oi join items i on i.id = oi.item_id where oi.order_id = o.id), '[]'::json),
    'decoration_photos', coalesce((
       select json_agg(d.photo_url) from order_decorations od join decorations d on d.id = od.decoration_id
        where od.order_id = o.id and d.photo_url is not null), '[]'::json)
  )
  from orders o where o.id = p_order and o.customer_id = p_customer
$$;

-- ---------- permissions: server (service role) only ----------
revoke execute on function customer_register(text, text, text)        from public, anon, authenticated;
revoke execute on function customer_login(text, text)                 from public, anon, authenticated;
revoke execute on function customer_submit_order(uuid, text, text, date, date, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function customer_orders(uuid)                      from public, anon, authenticated;
revoke execute on function customer_order_detail(uuid, uuid)          from public, anon, authenticated;
grant  execute on function customer_register(text, text, text)        to service_role;
grant  execute on function customer_login(text, text)                 to service_role;
grant  execute on function customer_submit_order(uuid, text, text, date, date, jsonb, jsonb) to service_role;
grant  execute on function customer_orders(uuid)                      to service_role;
grant  execute on function customer_order_detail(uuid, uuid)          to service_role;

-- Orders now require an account, so the open (anonymous) request function is closed.
-- (Tracking links and public_order keep working for orders that already exist.)
revoke execute on function submit_order(text, text, text, text, date, date, jsonb, jsonb, uuid[]) from anon, authenticated;
