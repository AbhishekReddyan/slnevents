-- =====================================================================
-- PHASE 4: worker access (read-only, no prices), checklists, qty edits, returns
-- =====================================================================

-- Workers may READ orders that are on the road. They can never read:
--   order_item_prices, order_prices, item_prices, sourcing_records (costs), order_events, alerts, profiles of others.
-- They cannot write to any table directly. All worker changes go through the functions below.
create policy orders_worker_read on orders for select to authenticated
  using (app_role() = 'worker' and status in ('confirmed', 'loaded', 'delivered', 'picked_up', 'returned'));

create policy order_items_worker_read on order_items for select to authenticated
  using (
    app_role() = 'worker'
    and exists (select 1 from orders o where o.id = order_items.order_id
                and o.status in ('confirmed', 'loaded', 'delivered', 'picked_up', 'returned'))
  );

-- ---------- loading checklist ----------
create function set_item_loaded(p_order_item uuid, p_loaded boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_status order_status;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select o.status into v_status from order_items oi join orders o on o.id = oi.order_id where oi.id = p_order_item;
  if v_status is null then raise exception 'Line not found'; end if;
  if v_status not in ('confirmed', 'loaded') then raise exception 'The loading checklist is closed for this order'; end if;
  update order_items set loaded = coalesce(p_loaded, false) where id = p_order_item;
end $$;

-- ---------- worker (or owner on the worker page) changes a quantity ----------
-- Logged, alerts the owner when a WORKER does it, and re-checks for shortfalls.
create function worker_set_item_qty(p_order uuid, p_item uuid, p_qty int) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; v_old int; v_oi uuid; v_name text; v_role text := app_role();
  v_actor text; v_msg text;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status not in ('confirmed', 'loaded', 'delivered') then
    raise exception 'Quantities can no longer be changed for this order';
  end if;
  if p_qty is null or p_qty < 0 or p_qty > 100000 then raise exception 'Invalid quantity'; end if;
  select name into v_name from items where id = p_item and active;
  if v_name is null then raise exception 'Unknown item'; end if;

  select id, qty into v_oi, v_old from order_items where order_id = p_order and item_id = p_item;
  v_old := coalesce(v_old, 0);
  if p_qty = v_old then return; end if;

  if p_qty = 0 then
    if (select count(*) from order_items where order_id = p_order) <= 1 then
      raise exception 'An order needs at least one item';
    end if;
    delete from order_items where id = v_oi;
  elsif v_oi is null then
    insert into order_items (order_id, item_id, qty) values (p_order, p_item, p_qty) returning id into v_oi;
    insert into order_item_prices (order_item_id, price_per_day)
    values (v_oi, coalesce((select price_per_day from item_prices where item_id = p_item), 0));
  else
    update order_items
       set qty = p_qty,
           loaded = case when o.status in ('confirmed', 'loaded') then false else loaded end   -- extra units must be loaded too
     where id = v_oi;
  end if;
  update orders set updated_at = now() where id = p_order;

  v_actor := coalesce((select full_name from profiles where id = auth.uid()), 'A worker');
  v_msg := format('%s: %s → %s', v_name, v_old, p_qty);
  perform log_event(p_order, 'qty_changed', 'Quantity changed — ' || v_msg);
  if v_role = 'worker' then
    perform add_alert('worker_edit', p_order, format('%s edited Order #%s (%s): %s', v_actor, o.order_no, o.customer_name, v_msg));
  end if;
  perform scan_shortfalls();   -- raises a shortfall alert if the new quantity exceeds stock
end $$;

-- ---------- return check-in ("Returned to godown") ----------
-- p_lines: [{ "order_item_id": "...", "returned": 10, "damaged": 1, "missing": 0 }, ...]
-- Stock becomes available again only here. Rules:
--   * returned + damaged + missing must equal the quantity sent
--   * damaged units move to "damaged / in repair" (owner can release them later in Inventory)
--   * missing units are removed from total stock
--   * units sourced from a supplier go back to the supplier: they are never added to or
--     removed from your stock. Damaged/missing counts only hit your own stock, up to the
--     number of your own units on the order.
create function check_in_return(p_order uuid, p_lines jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; l record; v_line order_items%rowtype; v_name text;
  v_own int; v_own_dmg int; v_own_miss int; issues text[] := '{}'; v_sup text[] := '{}';
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status <> 'picked_up' then raise exception 'Only orders that have been picked up can be checked in'; end if;
  if jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) <> (select count(*) from order_items where order_id = p_order) then
    raise exception 'Enter the return for every item';
  end if;

  -- release the order's hold on stock first, so later stock changes see the correct picture
  update orders set status = 'returned', updated_at = now() where id = p_order;

  for l in
    select (e->>'order_item_id')::uuid as line_id, (e->>'returned')::int as ret,
           (e->>'damaged')::int as dmg, (e->>'missing')::int as mis
    from jsonb_array_elements(p_lines) e
  loop
    select * into v_line from order_items where id = l.line_id and order_id = p_order;
    if not found then raise exception 'Unknown item line'; end if;
    if l.ret is null or l.dmg is null or l.mis is null or l.ret < 0 or l.dmg < 0 or l.mis < 0 then
      raise exception 'Enter whole numbers (0 or more) for every item';
    end if;
    select name into v_name from items where id = v_line.item_id;
    if l.ret + l.dmg + l.mis <> v_line.qty then
      raise exception '%: returned + damaged + missing must equal % (the quantity sent)', v_name, v_line.qty;
    end if;

    update order_items set returned_qty = l.ret, damaged_qty = l.dmg, missing_qty = l.mis where id = v_line.id;

    v_own      := greatest(v_line.qty - v_line.sourced_qty, 0);
    v_own_dmg  := least(l.dmg, v_own);
    v_own_miss := least(l.mis, v_own - v_own_dmg);
    if v_own_dmg > 0 then
      update items set unavailable_qty = unavailable_qty + v_own_dmg where id = v_line.item_id;
    end if;
    if v_own_miss > 0 then
      update items set total_qty = greatest(total_qty - v_own_miss, 0) where id = v_line.item_id;
    end if;

    if l.dmg + l.mis > 0 then
      issues := issues || format('%s: %s damaged, %s missing', v_name, l.dmg, l.mis);
    end if;
    if (l.dmg + l.mis) > (v_own_dmg + v_own_miss) then
      v_sup := v_sup || format('%s: %s unit(s) belong to a supplier', v_name, (l.dmg + l.mis) - (v_own_dmg + v_own_miss));
    end if;
  end loop;

  perform log_event(p_order, 'return', 'Checked in at godown'
    || case when array_length(issues, 1) > 0 then ' — ' || array_to_string(issues, '; ') else ' — all items returned in good condition' end);

  if array_length(issues, 1) > 0 then
    perform add_alert('return_issue', p_order,
      format('Order #%s returned with problems — %s%s', o.order_no, array_to_string(issues, '; '),
             case when array_length(v_sup, 1) > 0 then ' (' || array_to_string(v_sup, '; ') || ': settle with the supplier)' else '' end));
  end if;
  perform scan_shortfalls();
end $$;

-- ---------- function permissions ----------
revoke execute on function set_item_loaded(uuid, boolean)       from public, anon;
revoke execute on function worker_set_item_qty(uuid, uuid, int) from public, anon;
revoke execute on function check_in_return(uuid, jsonb)         from public, anon;
grant  execute on function set_item_loaded(uuid, boolean)       to authenticated;
grant  execute on function worker_set_item_qty(uuid, uuid, int) to authenticated;
grant  execute on function check_in_return(uuid, jsonb)         to authenticated;
