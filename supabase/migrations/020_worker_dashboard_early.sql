-- 020: the worker dashboard also shows
--   * orders that are Picked up (waiting for the return check-in) whatever their dates, and
--   * Delivered orders whose customer already marked the event completed (pickup requested early).
-- Run once, after 019. Still returns only safe columns (no prices).
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
               'pickup_requested', o.pickup_requested_at is not null,
               'parent_no', (select p.order_no from orders p where p.id = o.parent_order_id))
             order by o.start_date, o.order_no)
      from orders o
      where (o.status in ('confirmed', 'loaded', 'delivered', 'picked_up') and o.start_date <= v_today)
         or o.status = 'picked_up'
         or (o.status = 'delivered' and o.pickup_requested_at is not null)
         or (o.status in ('returned', 'closed') and o.start_date <= v_today and o.end_date >= v_today)
         or (o.status in ('confirmed', 'loaded') and o.start_date > v_today and o.start_date <= v_today + 7)
    ), '[]'::json)
  );
end $$;
