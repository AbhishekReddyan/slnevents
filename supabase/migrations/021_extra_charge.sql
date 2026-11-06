-- 021: an "extra amount" the owner can add to one customer's bill (with a reason), shown on the customer's bill.
-- Run once, after 020.
alter table order_prices add column if not exists extra_amount numeric(12,2) not null default 0 check (extra_amount >= 0);
alter table order_prices add column if not exists extra_note   text check (char_length(extra_note) <= 200);

-- the customer's bill and approximate bill now include it
create or replace function customer_bill(p_customer uuid, p_order uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'order_no', o.order_no, 'customer_name', o.customer_name, 'phone', o.phone, 'address', o.address,
    'start_date', o.start_date, 'end_date', o.end_date, 'status', o.status,
    'days', (o.end_date - o.start_date) + 1,
    'lines', coalesce((
       select json_agg(json_build_object('name', i.name, 'qty', oi.qty, 'price_per_day', coalesce(p.price_per_day, 0))
                       order by i.sort_order, i.name)
       from order_items oi join items i on i.id = oi.item_id
       left join order_item_prices p on p.order_item_id = oi.id
       where oi.order_id = o.id), '[]'::json),
    'decoration_count', (select count(*) from order_decorations where order_id = o.id),
    'decoration_charge', coalesce(op.decoration_charge, 0),
    'transport', coalesce(op.transport, 0),
    'discount', coalesce(op.discount, 0),
    'extra_amount', coalesce(op.extra_amount, 0),
    'extra_note', op.extra_note
  )
  from orders o left join order_prices op on op.order_id = o.id
  where o.id = p_order and o.customer_id = p_customer
    and (o.pickup_requested_at is not null or o.status::text in ('picked_up', 'returned', 'closed'))
$$;

create or replace function customer_estimate(p_customer uuid, p_order uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'order_no', o.order_no, 'customer_name', o.customer_name, 'phone', o.phone, 'address', o.address,
    'start_date', o.start_date, 'end_date', o.end_date, 'status', o.status,
    'days', (o.end_date - o.start_date) + 1,
    'lines', coalesce((
       select json_agg(json_build_object('name', i.name, 'qty', oi.qty, 'price_per_day', coalesce(p.price_per_day, 0))
                       order by i.sort_order, i.name)
       from order_items oi join items i on i.id = oi.item_id
       left join order_item_prices p on p.order_item_id = oi.id
       where oi.order_id = o.id), '[]'::json),
    'decoration_count', (select count(*) from order_decorations where order_id = o.id),
    'decoration_charge', coalesce(op.decoration_charge, 0),
    'transport', coalesce(op.transport, 0),
    'discount', coalesce(op.discount, 0),
    'extra_amount', coalesce(op.extra_amount, 0),
    'extra_note', op.extra_note
  )
  from orders o left join order_prices op on op.order_id = o.id
  where o.id = p_order and o.customer_id = p_customer
$$;

revoke execute on function customer_bill(uuid, uuid)     from public, anon, authenticated;
revoke execute on function customer_estimate(uuid, uuid) from public, anon, authenticated;
grant  execute on function customer_bill(uuid, uuid)     to service_role;
grant  execute on function customer_estimate(uuid, uuid) to service_role;
