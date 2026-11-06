-- 018: approximate bill for the customer's own order, available from the moment it is placed.
-- Same data as the final bill (item prices from Inventory x days, decoration and transport if entered),
-- but not limited to after the event. Run once, after 017. Server (service role) only.
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
    'discount', coalesce(op.discount, 0)
  )
  from orders o left join order_prices op on op.order_id = o.id
  where o.id = p_order and o.customer_id = p_customer
$$;

revoke execute on function customer_estimate(uuid, uuid) from public, anon, authenticated;
grant  execute on function customer_estimate(uuid, uuid) to service_role;
