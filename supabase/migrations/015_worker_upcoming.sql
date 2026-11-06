-- 015: the worker dashboard also gets confirmed/loaded orders starting in the next 7 days ("Coming up").
-- Run once, after 014. Still returns only safe columns (no prices).
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
         or (o.status in ('confirmed', 'loaded') and o.start_date > v_today and o.start_date <= v_today + 7)
    ), '[]'::json)
  );
end $$;
