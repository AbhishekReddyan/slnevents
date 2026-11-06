-- 016: customer can mark the event as completed (asks for pickup) and then view the bill.
-- Run once, after 015. Server (service role) only.

-- order detail now also says whether the customer already marked the event completed
create or replace function customer_order_detail(p_customer uuid, p_order uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', o.id, 'order_no', o.order_no, 'status', o.status, 'address', o.address,
    'start_date', o.start_date, 'end_date', o.end_date,
    'photos_deleted_at', o.photos_deleted_at,
    'completed_at', o.pickup_requested_at,
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

-- "Mark event as completed": the same effect as the old tracking-page button (pickup requested + owner alert)
create or replace function customer_complete_event(p_customer uuid, p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order and customer_id = p_customer for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status <> 'delivered' then raise exception 'You can mark the event as completed after your items are delivered'; end if;
  if o.pickup_requested_at is null then
    update orders set pickup_requested_at = now() where id = o.id;
    perform log_event(o.id, 'status', 'Customer marked the event as completed and asked for pickup');
    perform add_alert('pickup_requested', o.id,
      format('Order #%s (%s): customer says the event is over, ready for pickup', o.order_no, o.customer_name));
  end if;
end $$;

-- The bill: only after the customer marked the event completed (or the items were already picked up).
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
    'decoration_charge', coalesce(op.decoration_charge, 0),
    'transport', coalesce(op.transport, 0),
    'discount', coalesce(op.discount, 0)
  )
  from orders o left join order_prices op on op.order_id = o.id
  where o.id = p_order and o.customer_id = p_customer
    and (o.pickup_requested_at is not null or o.status::text in ('picked_up', 'returned', 'closed'))
$$;

revoke execute on function customer_order_detail(uuid, uuid)  from public, anon, authenticated;
revoke execute on function customer_complete_event(uuid, uuid) from public, anon, authenticated;
revoke execute on function customer_bill(uuid, uuid)           from public, anon, authenticated;
grant  execute on function customer_order_detail(uuid, uuid)  to service_role;
grant  execute on function customer_complete_event(uuid, uuid) to service_role;
grant  execute on function customer_bill(uuid, uuid)           to service_role;
