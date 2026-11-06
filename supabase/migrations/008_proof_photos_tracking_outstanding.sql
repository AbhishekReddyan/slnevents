-- =====================================================================
-- 008: photo proof at delivery and pickup, partial delivery, items not returned
--      (returning late / missing), customer tracking link and pickup request.
-- Run after 007.
-- =====================================================================

-- ---------- orders: private tracking link + pickup request ----------
alter table orders
  add column track_token         uuid not null default gen_random_uuid(),
  add column pickup_requested_at timestamptz;
create unique index orders_track_token_idx on orders (track_token);

-- ---------- order lines: how many were delivered / picked up ----------
alter table order_items
  add column delivered_qty int not null default 0 check (delivered_qty >= 0),
  add column pickup_qty    int check (pickup_qty >= 0);

-- orders that already passed these steps before this update
update order_items oi
   set delivered_qty = oi.qty,
       pickup_qty = case when o.status in ('picked_up', 'returned', 'closed') then oi.qty end
  from orders o
 where o.id = oi.order_id and o.status in ('delivered', 'picked_up', 'returned', 'closed');

-- ---------- photos taken by workers ----------
create table order_item_photos (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  order_item_id uuid not null references order_items(id) on delete cascade,
  kind          text not null check (kind in ('delivery', 'pickup')),
  path          text not null,                       -- file in the private 'proof-photos' bucket
  recorded      boolean not null default false,      -- true once a delivery/pickup was saved with it
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index order_item_photos_order_idx on order_item_photos (order_id);

-- ---------- items that did not come back ----------
create table outstanding_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  order_item_id uuid references order_items(id) on delete set null,
  item_id       uuid not null references items(id) on delete restrict,
  qty           int  not null check (qty >= 0),
  held_qty      int  not null default 0,             -- units taken out of available stock while outstanding
  reason        text not null check (reason in ('returning_late', 'missing')),
  note          text,
  status        text not null default 'open' check (status in ('open', 'received', 'lost')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create index outstanding_open_idx on outstanding_items (status) where status = 'open';

alter table order_item_photos enable row level security;
alter table outstanding_items enable row level security;

create policy photos_owner on order_item_photos for all to authenticated using (is_owner()) with check (is_owner());
create policy photos_worker_read on order_item_photos for select to authenticated
  using (app_role() = 'worker' and exists (select 1 from orders o where o.id = order_item_photos.order_id
         and o.status in ('confirmed', 'loaded', 'delivered', 'picked_up', 'returned')));
create policy outstanding_owner on outstanding_items for all to authenticated using (is_owner()) with check (is_owner());
create policy outstanding_staff_read on outstanding_items for select to authenticated using (is_staff());

-- ---------- private photo storage ----------
insert into storage.buckets (id, name, public) values ('proof-photos', 'proof-photos', false)
on conflict (id) do nothing;
create policy "staff upload proof photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'proof-photos' and public.is_staff());
create policy "staff read proof photos" on storage.objects for select to authenticated
  using (bucket_id = 'proof-photos' and public.is_staff());
create policy "owner delete proof photos" on storage.objects for delete to authenticated
  using (bucket_id = 'proof-photos' and public.is_owner());

-- ---------- workers can no longer skip the photo steps ----------
-- Delivered and Picked up now go through record_delivery() / record_pickup().
-- The owner keeps a manual override on the order page.
create or replace function transition_ok(p_old order_status, p_new order_status, p_role text) returns boolean
language sql immutable as $$
  select case
    when p_role = 'owner' then (p_old::text, p_new::text) in (
      ('pending_approval','confirmed'), ('pending_approval','declined'), ('pending_approval','cancelled'),
      ('confirmed','loaded'), ('confirmed','cancelled'),
      ('loaded','delivered'), ('loaded','cancelled'),
      ('delivered','picked_up'),
      ('returned','closed'))
    when p_role = 'worker' then (p_old::text, p_new::text) in (('confirmed','loaded'))
    else false end
$$;

-- ---------- save a photo for one order line ----------
create function add_line_photo(p_order_item uuid, p_kind text, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare v_order uuid; v_status order_status;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_kind not in ('delivery', 'pickup') then raise exception 'Invalid photo type'; end if;
  select oi.order_id, o.status into v_order, v_status
    from order_items oi join orders o on o.id = oi.order_id where oi.id = p_order_item;
  if v_order is null then raise exception 'Item line not found'; end if;
  if p_kind = 'delivery' and v_status not in ('loaded', 'delivered') then
    raise exception 'Delivery photos can only be added to loaded or delivered orders';
  end if;
  if p_kind = 'pickup' and v_status <> 'delivered' then
    raise exception 'Pickup photos can only be added to delivered orders';
  end if;
  if p_path not like (v_order::text || '/%') then raise exception 'Invalid photo path'; end if;
  insert into order_item_photos (order_id, order_item_id, kind, path) values (v_order, p_order_item, p_kind, p_path);
end $$;

-- ---------- DELIVERY: quantity per line + a photo for every line ----------
-- p_lines: [{ "order_item_id": "...", "qty": 50 }, ...]   (qty = delivered now)
create function record_delivery(p_order uuid, p_lines jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; l record; v_line order_items%rowtype; v_name text;
  v_total int := 0; v_done text[] := '{}'; v_pending text;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status not in ('loaded', 'delivered') then
    raise exception 'Mark the order as loaded before delivering it';
  end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'Invalid request'; end if;

  for l in
    select (e->>'order_item_id')::uuid as line_id, coalesce((e->>'qty')::int, 0) as qty
    from jsonb_array_elements(p_lines) e
  loop
    select * into v_line from order_items where id = l.line_id and order_id = p_order;
    if not found then raise exception 'Unknown item line'; end if;
    select name into v_name from items where id = v_line.item_id;
    if l.qty < 0 or l.qty > v_line.qty - v_line.delivered_qty then
      raise exception '%: you can deliver at most % more', v_name, greatest(v_line.qty - v_line.delivered_qty, 0);
    end if;
    if l.qty > 0 then
      if not exists (select 1 from order_item_photos
                      where order_item_id = l.line_id and kind = 'delivery' and not recorded) then
        raise exception 'Take a photo of % before marking it delivered', v_name;
      end if;
      update order_item_photos set recorded = true
       where order_item_id = l.line_id and kind = 'delivery' and not recorded;
      update order_items set delivered_qty = delivered_qty + l.qty where id = l.line_id;
      v_total := v_total + l.qty;
      v_done := v_done || format('%s × %s', l.qty, v_name);
    end if;
  end loop;

  if v_total = 0 then raise exception 'Enter the delivered quantity for at least one item'; end if;
  if o.status = 'loaded' then
    update orders set status = 'delivered', updated_at = now() where id = p_order;
  else
    update orders set updated_at = now() where id = p_order;
  end if;

  select string_agg(format('%s × %s', oi.qty - oi.delivered_qty, i.name), ', ')
    into v_pending
    from order_items oi join items i on i.id = oi.item_id
   where oi.order_id = p_order and oi.qty > oi.delivered_qty;

  perform log_event(p_order, 'delivery', 'Delivered: ' || array_to_string(v_done, ', ')
    || case when v_pending is null then '. Everything delivered.' else '. Still pending: ' || v_pending end);
  perform add_alert('delivery', p_order,
    case when v_pending is null then format('Order #%s: everything delivered', o.order_no)
         else format('Order #%s delivered, still pending: %s', o.order_no, v_pending) end);
end $$;

-- ---------- PICKUP: quantity per line + a photo; shortfalls are tracked ----------
-- p_lines: [{ "order_item_id": "...", "qty": 48, "reason": "returning_late" | "missing", "note": "..." }, ...]
-- Every line of the order must be listed (qty 0 for lines that were never delivered).
create function record_pickup(p_order uuid, p_lines jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; l record; v_line order_items%rowtype; v_name text;
  v_short int; v_out text[] := '{}'; v_summary text[] := '{}';
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status <> 'delivered' then raise exception 'Only delivered orders can be picked up'; end if;
  if jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) <> (select count(*) from order_items where order_id = p_order) then
    raise exception 'Enter the pickup for every item';
  end if;

  for l in
    select (e->>'order_item_id')::uuid as line_id, coalesce((e->>'qty')::int, 0) as qty,
           nullif(e->>'reason', '') as reason, nullif(trim(coalesce(e->>'note', '')), '') as note
    from jsonb_array_elements(p_lines) e
  loop
    select * into v_line from order_items where id = l.line_id and order_id = p_order;
    if not found then raise exception 'Unknown item line'; end if;
    select name into v_name from items where id = v_line.item_id;
    if l.qty < 0 or l.qty > v_line.delivered_qty then
      raise exception '%: picked up cannot be more than the % delivered', v_name, v_line.delivered_qty;
    end if;

    if l.qty > 0 then
      if not exists (select 1 from order_item_photos
                      where order_item_id = l.line_id and kind = 'pickup' and not recorded) then
        raise exception 'Take a photo of % before marking it picked up', v_name;
      end if;
      update order_item_photos set recorded = true
       where order_item_id = l.line_id and kind = 'pickup' and not recorded;
    end if;

    v_short := v_line.delivered_qty - l.qty;
    if v_short > 0 then
      if l.reason is null or l.reason not in ('returning_late', 'missing') then
        raise exception '%: say whether the missing % are returning late or missing', v_name, v_short;
      end if;
      insert into outstanding_items (order_id, order_item_id, item_id, qty, reason, note)
      values (p_order, l.line_id, v_line.item_id, v_short, l.reason, l.note);
      v_out := v_out || format('%s × %s (%s)', v_short, v_name,
                               case l.reason when 'returning_late' then 'returning late' else 'missing' end);
    end if;
    if v_line.delivered_qty > 0 then
      v_summary := v_summary || format('%s × %s', l.qty, v_name);
    end if;
    update order_items set pickup_qty = l.qty where id = l.line_id;
  end loop;

  update orders set status = 'picked_up', updated_at = now() where id = p_order;
  perform log_event(p_order, 'status', 'Picked up: ' || array_to_string(v_summary, ', ')
    || case when array_length(v_out, 1) > 0 then '. Not returned: ' || array_to_string(v_out, ', ') else '' end);
  if array_length(v_out, 1) > 0 then
    perform add_alert('pickup_issue', p_order,
      format('Order #%s picked up, but not everything came back: %s', o.order_no, array_to_string(v_out, ', ')));
  end if;
end $$;

-- ---------- return check-in: now counts what was actually picked up ----------
create or replace function check_in_return(p_order uuid, p_lines jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; l record; v_line order_items%rowtype; v_name text; r record;
  v_exp int; v_own int; v_own_dmg int; v_own_miss int; v_hold int;
  issues text[] := '{}'; v_sup text[] := '{}';
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status <> 'picked_up' then raise exception 'Only orders that have been picked up can be checked in'; end if;
  if jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) <> (select count(*) from order_items where order_id = p_order) then
    raise exception 'Enter the return for every item';
  end if;

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
    v_exp := coalesce(v_line.pickup_qty, v_line.qty);
    if l.ret + l.dmg + l.mis <> v_exp then
      raise exception '%: returned + damaged + missing must equal % (the quantity picked up)', v_name, v_exp;
    end if;

    update order_items set returned_qty = l.ret, damaged_qty = l.dmg, missing_qty = l.mis where id = v_line.id;

    v_own      := greatest(v_exp - v_line.sourced_qty, 0);
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

  -- items the customer has not returned yet stay out of available stock until they are received or written off
  for r in select * from outstanding_items where order_id = p_order and status = 'open' and held_qty = 0 loop
    select * into v_line from order_items where id = r.order_item_id;
    v_hold := least(r.qty, greatest(coalesce(v_line.qty, 0) - coalesce(v_line.sourced_qty, 0), 0));
    if v_hold > 0 then
      update items set unavailable_qty = unavailable_qty + v_hold where id = r.item_id;
      update outstanding_items set held_qty = v_hold where id = r.id;
    end if;
  end loop;

  perform log_event(p_order, 'return', 'Checked in at godown'
    || case when array_length(issues, 1) > 0 then ' — ' || array_to_string(issues, '; ') else ' — all picked-up items returned in good condition' end);

  if array_length(issues, 1) > 0 then
    perform add_alert('return_issue', p_order,
      format('Order #%s returned with problems — %s%s', o.order_no, array_to_string(issues, '; '),
             case when array_length(v_sup, 1) > 0 then ' (' || array_to_string(v_sup, '; ') || ': settle with the supplier)' else '' end));
  end if;
  perform scan_shortfalls();
end $$;

-- ---------- items that were not returned: received later, or written off ----------
create function resolve_outstanding(p_id uuid, p_action text, p_qty int default null) returns void
language plpgsql security definer set search_path = public as $$
declare r outstanding_items%rowtype; v_status order_status; v_name text; v_q int; v_rel int; v_no bigint;
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into r from outstanding_items where id = p_id for update;
  if not found then raise exception 'Record not found'; end if;
  if r.status <> 'open' then raise exception 'This item is already resolved'; end if;
  select status, order_no into v_status, v_no from orders where id = r.order_id;
  if v_status not in ('returned', 'closed') then
    raise exception 'Check this order in at the godown first';
  end if;
  select name into v_name from items where id = r.item_id;

  if p_action = 'received' then
    v_q := coalesce(p_qty, r.qty);
    if v_q <= 0 or v_q > r.qty then raise exception 'Enter a quantity between 1 and %', r.qty; end if;
    v_rel := least(r.held_qty, v_q);
    if v_rel > 0 then
      update items set unavailable_qty = greatest(unavailable_qty - v_rel, 0) where id = r.item_id;
    end if;
    update outstanding_items
       set qty = qty - v_q, held_qty = held_qty - v_rel,
           status = case when qty - v_q = 0 then 'received' else 'open' end,
           resolved_at = case when qty - v_q = 0 then now() else null end
     where id = p_id;
    perform log_event(r.order_id, 'return', format('Received back late: %s × %s', v_q, v_name));
  elsif p_action = 'lost' then
    if not is_owner() then raise exception 'Only the owner can write items off' using errcode = '42501'; end if;
    if r.held_qty > 0 then
      update items set unavailable_qty = greatest(unavailable_qty - r.held_qty, 0),
                       total_qty = greatest(total_qty - r.held_qty, 0)
       where id = r.item_id;
    end if;
    update outstanding_items set status = 'lost', resolved_at = now(), held_qty = 0 where id = p_id;
    perform log_event(r.order_id, 'return', format('Written off as lost: %s × %s', r.qty, v_name));
  else
    raise exception 'Invalid action';
  end if;
  perform scan_shortfalls();
end $$;

-- ---------- customer: private tracking link ----------
create function public_order(p_token uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'order_no', o.order_no, 'customer_name', o.customer_name, 'status', o.status,
    'start_date', o.start_date, 'end_date', o.end_date,
    'pickup_requested', o.pickup_requested_at is not null,
    'items', coalesce((
       select json_agg(json_build_object('name', i.name, 'name_kn', i.name_kn, 'qty', oi.qty,
                                         'delivered', oi.delivered_qty, 'pickup', oi.pickup_qty)
                       order by i.sort_order, i.name)
       from order_items oi join items i on i.id = oi.item_id where oi.order_id = o.id), '[]'::json),
    'decorations', coalesce((
       select json_agg(json_build_object('title', d.title, 'title_kn', d.title_kn))
       from order_decorations od join decorations d on d.id = od.decoration_id where od.order_id = o.id), '[]'::json)
  )
  from orders o where o.track_token = p_token
$$;

-- optional: the customer says the event is over and the items can be collected
create function request_pickup(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  select * into o from orders where track_token = p_token for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status <> 'delivered' then raise exception 'You can ask for pickup after your items are delivered'; end if;
  if o.pickup_requested_at is null then
    update orders set pickup_requested_at = now() where id = o.id;
    perform log_event(o.id, 'status', 'Customer says the event is over and asked for pickup');
    perform add_alert('pickup_requested', o.id,
      format('Order #%s (%s): customer says the event is over, ready for pickup', o.order_no, o.customer_name));
  end if;
end $$;

grant execute on function public_order(uuid)    to anon, authenticated;
grant execute on function request_pickup(uuid)  to anon, authenticated;

-- ---------- customer request now also returns the private tracking token ----------
create or replace function submit_order(
  p_name text, p_phone text, p_address text, p_notes text,
  p_start date, p_end date, p_items jsonb, p_decorations jsonb default '[]'::jsonb
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_no bigint; v_oi uuid; r record; v_merged boolean := false;
  v_key text; v_added text[] := '{}'; v_name text; v_token uuid;
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
  return json_build_object('order_no', v_no, 'merged', v_merged, 'token', v_token);
end $$;

-- ---------- function permissions ----------
revoke execute on function add_line_photo(uuid, text, text)       from public, anon;
revoke execute on function record_delivery(uuid, jsonb)           from public, anon;
revoke execute on function record_pickup(uuid, jsonb)             from public, anon;
revoke execute on function resolve_outstanding(uuid, text, int)   from public, anon;
grant  execute on function add_line_photo(uuid, text, text)       to authenticated;
grant  execute on function record_delivery(uuid, jsonb)          to authenticated;
grant  execute on function record_pickup(uuid, jsonb)            to authenticated;
grant  execute on function resolve_outstanding(uuid, text, int)  to authenticated;
