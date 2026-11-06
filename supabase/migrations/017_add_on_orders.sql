-- 017: add-on (sub) orders. When a customer sends another request for the same dates while their
-- earlier order is already in progress (loaded, delivered or picked up), it becomes an ADD-ON order
-- stacked under the first one instead of an unrelated new order. (While the first order is still
-- pending or confirmed, new items are still merged into it, as before.)
-- Run once, after 016.
alter table orders add column if not exists parent_order_id uuid references orders(id) on delete set null;
create index if not exists orders_parent_idx on orders (parent_order_id);

create or replace function customer_submit_order(
  p_customer uuid, p_address text, p_notes text,
  p_start date, p_end date, p_items jsonb, p_decorations jsonb default '[]'::jsonb
) returns json
language plpgsql security definer set search_path = public as $$
declare
  c customers%rowtype;
  v_id uuid; v_no bigint; v_oi uuid; r record; v_merged boolean := false;
  v_added text[] := '{}'; v_name text; v_parent uuid; v_parent_no bigint;
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

  -- 1. same dates and still pending/confirmed: add the items to that order
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
    -- 2. same dates but the first order is already in progress: this becomes an add-on order under it
    select coalesce(o.parent_order_id, o.id) into v_parent
      from orders o
     where o.customer_id = c.id and o.start_date = p_start and o.end_date = p_end
       and o.status in ('loaded', 'delivered', 'picked_up')
     order by o.parent_order_id nulls first, o.created_at limit 1;
    if v_parent is not null then select order_no into v_parent_no from orders where id = v_parent; end if;

    insert into orders (customer_id, customer_name, phone, address, notes, start_date, end_date, parent_order_id)
    values (c.id, c.name, c.phone, trim(p_address), nullif(trim(coalesce(p_notes, '')), ''), p_start, p_end, v_parent)
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
  elsif v_parent is not null then
    perform log_event(v_id, 'created', 'Add-on request to Order #' || v_parent_no || ' submitted by customer');
    perform add_alert('new_order', v_id,
      'Add-on #' || v_no || ' to Order #' || v_parent_no || ' from ' || c.name || ': ' || array_to_string(v_added, ', '));
  else
    perform log_event(v_id, 'created', 'Request submitted by customer');
    perform add_alert('new_order', v_id,
      'New request #' || v_no || ' from ' || c.name || ' (' || p_start || ' to ' || p_end || ')');
  end if;
  perform scan_shortfalls();
  return json_build_object('id', v_id, 'order_no', v_no, 'merged', v_merged, 'add_on_to', v_parent_no);
end $$;

-- customer's list: includes the parent so add-ons can be stacked under the first order
create or replace function customer_orders(p_customer uuid) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'id', o.id, 'order_no', o.order_no, 'status', o.status,
           'start_date', o.start_date, 'end_date', o.end_date, 'parent_order_id', o.parent_order_id,
           'item_count', (select coalesce(sum(qty), 0) from order_items where order_id = o.id),
           'photo_count', (select count(*) from order_item_photos where order_id = o.id)
         ) order by o.created_at desc), '[]'::json)
  from orders o where o.customer_id = p_customer
$$;

-- worker dashboard: also says which order an add-on belongs to (no prices)
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
               'start_date', o.start_date, 'end_date', o.end_date, 'status', o.status,
               'parent_no', (select p.order_no from orders p where p.id = o.parent_order_id))
             order by o.start_date, o.order_no)
      from orders o
      where (o.status in ('confirmed', 'loaded', 'delivered', 'picked_up') and o.start_date <= v_today)
         or (o.status in ('returned', 'closed') and o.start_date <= v_today and o.end_date >= v_today)
         or (o.status in ('confirmed', 'loaded') and o.start_date > v_today and o.start_date <= v_today + 7)
    ), '[]'::json)
  );
end $$;

revoke execute on function customer_submit_order(uuid, text, text, date, date, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function customer_orders(uuid) from public, anon, authenticated;
grant  execute on function customer_submit_order(uuid, text, text, date, date, jsonb, jsonb) to service_role;
grant  execute on function customer_orders(uuid) to service_role;
