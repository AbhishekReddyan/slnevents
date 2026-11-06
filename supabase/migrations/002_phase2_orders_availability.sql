-- =====================================================================
-- PHASE 2: orders, availability maths, public catalog, customer submit
-- =====================================================================

create type order_status as enum (
  'pending_approval', 'confirmed', 'loaded', 'delivered', 'picked_up',
  'returned', 'closed', 'declined', 'cancelled'
);

create table orders (
  id             uuid primary key default gen_random_uuid(),
  order_no       bigint generated always as identity (start with 1001),
  customer_name  text not null check (char_length(customer_name) between 1 and 120),
  phone          text not null check (char_length(phone) between 5 and 20),
  address        text not null check (char_length(address) between 1 and 500),
  notes          text check (char_length(notes) <= 1000),
  start_date     date not null,
  end_date       date not null,
  status         order_status not null default 'pending_approval',
  decline_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint order_dates_ok check (end_date >= start_date)
);
create unique index orders_order_no_idx on orders (order_no);
create index orders_status_idx on orders (status);
create index orders_dates_idx on orders (start_date, end_date);

create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  item_id       uuid not null references items(id) on delete restrict,
  qty           int  not null check (qty > 0),
  sourced_qty   int  not null default 0 check (sourced_qty >= 0),   -- arranged from outside suppliers
  loaded        boolean not null default false,                      -- loading checklist tick
  returned_qty  int,                                                 -- return checklist
  damaged_qty   int,
  missing_qty   int,
  unique (order_id, item_id)
);
create index order_items_item_idx on order_items (item_id);

-- Prices are kept apart from order_items so workers can read lines but never prices.
create table order_item_prices (
  order_item_id uuid primary key references order_items(id) on delete cascade,
  price_per_day numeric(12,2) not null default 0 check (price_per_day >= 0)
);
create table order_prices (
  order_id uuid primary key references orders(id) on delete cascade,
  discount numeric(12,2) not null default 0 check (discount >= 0)
);

-- ---------- date helpers ----------
create function shop_today() returns date
language sql stable as $$
  select (now() at time zone coalesce((select timezone from settings where id = 1), 'Asia/Kolkata'))::date
$$;

-- ---------- AVAILABILITY MATHS ----------
-- Stock a confirmed order holds on a given day:
--   * statuses confirmed / loaded / delivered / picked_up (NOT returned, closed, declined, cancelled, pending)
--   * from start_date to end_date + buffer days
--   * if the goods are still out after that (not checked in), they keep blocking until today
--   * units sourced from outside suppliers are not taken from our stock
create function stock_booked(p_item uuid, p_day date, p_exclude uuid default null) returns int
language sql stable as $$
  select coalesce(sum(greatest(oi.qty - oi.sourced_qty, 0)), 0)::int
  from order_items oi
  join orders o on o.id = oi.order_id
  where oi.item_id = p_item
    and o.status in ('confirmed', 'loaded', 'delivered', 'picked_up')
    and (p_exclude is null or o.id <> p_exclude)
    and p_day between o.start_date
        and greatest(o.end_date + (select buffer_days from settings where id = 1), shop_today())
$$;

-- remaining = total - damaged/in repair - booked (can be negative = shortfall)
create function item_remaining(p_item uuid, p_day date, p_exclude uuid default null) returns int
language sql stable as $$
  select i.total_qty - i.unavailable_qty - stock_booked(i.id, p_day, p_exclude)
  from items i where i.id = p_item
$$;

-- Date view for the owner (and workers): one row per item per day.
create function availability_range(p_start date, p_end date)
returns table (
  item_id uuid, item_name text, category text, day date,
  total int, unavailable int, booked int, pending int, remaining int
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_end < p_start or p_end - p_start > 365 then raise exception 'Bad date range'; end if;
  return query
  select i.id, i.name, c.name, d::date,
         i.total_qty, i.unavailable_qty,
         stock_booked(i.id, d::date),
         coalesce((
           select sum(oi.qty) from order_items oi join orders o on o.id = oi.order_id
           where oi.item_id = i.id and o.status = 'pending_approval'
             and d::date between o.start_date and o.end_date
         ), 0)::int,
         i.total_qty - i.unavailable_qty - stock_booked(i.id, d::date)
  from items i
  left join categories c on c.id = i.category_id
  cross join generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') d
  where i.active
  order by c.name nulls last, i.name, d;
end $$;

-- ---------- PUBLIC (no login) ----------
-- Customers never read tables directly. They get exactly these two views of the data.
create function public_info() returns table (business_name text, show_prices boolean, today date)
language sql stable security definer set search_path = public as $$
  select business_name, show_prices, shop_today() from settings where id = 1
$$;

create function public_catalog()
returns table (id uuid, name text, category text, photo_url text, price_per_day numeric)
language sql stable security definer set search_path = public as $$
  select i.id, i.name, coalesce(c.name, 'Other'), i.photo_url,
         case when (select show_prices from settings where id = 1) then p.price_per_day else null end
  from items i
  left join categories c on c.id = i.category_id
  left join item_prices p on p.item_id = i.id
  where i.active
  order by coalesce(c.sort_order, 999), coalesce(c.name, 'Other'), i.name
$$;

-- Customer order request. Never rejects for stock reasons: ordering above stock is allowed.
create function submit_order(
  p_name text, p_phone text, p_address text, p_notes text,
  p_start date, p_end date, p_items jsonb
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_no bigint; v_oi uuid; r record;
begin
  if char_length(trim(coalesce(p_name, ''))) = 0 or char_length(p_name) > 120 then raise exception 'Please enter your name'; end if;
  if char_length(trim(coalesce(p_phone, ''))) < 5 or char_length(p_phone) > 20 then raise exception 'Please enter a valid phone number'; end if;
  if char_length(trim(coalesce(p_address, ''))) = 0 or char_length(p_address) > 500 then raise exception 'Please enter your address'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'Please choose valid event dates'; end if;
  if p_start < shop_today() then raise exception 'The start date cannot be in the past'; end if;
  if p_end - p_start > 60 then raise exception 'Events longer than 60 days: please call us'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Please choose at least one item';
  end if;

  insert into orders (customer_name, phone, address, notes, start_date, end_date)
  values (trim(p_name), trim(p_phone), trim(p_address), nullif(trim(coalesce(p_notes, '')), ''), p_start, p_end)
  returning id, order_no into v_id, v_no;

  for r in
    select (e->>'item_id')::uuid as item_id, sum((e->>'qty')::int) as qty
    from jsonb_array_elements(p_items) e group by 1
  loop
    if r.qty <= 0 or r.qty > 100000 then raise exception 'Invalid quantity'; end if;
    if not exists (select 1 from items where id = r.item_id and active) then raise exception 'An item is no longer available'; end if;
    insert into order_items (order_id, item_id, qty) values (v_id, r.item_id, r.qty) returning id into v_oi;
    insert into order_item_prices (order_item_id, price_per_day)
    values (v_oi, coalesce((select price_per_day from item_prices where item_id = r.item_id), 0));
  end loop;

  insert into order_prices (order_id) values (v_id);
  return v_no;
end $$;

-- ---------- row level security ----------
alter table orders            enable row level security;
alter table order_items       enable row level security;
alter table order_item_prices enable row level security;
alter table order_prices      enable row level security;

create policy orders_owner      on orders            for all to authenticated using (is_owner()) with check (is_owner());
create policy order_items_owner on order_items       for all to authenticated using (is_owner()) with check (is_owner());
create policy oip_owner         on order_item_prices for all to authenticated using (is_owner()) with check (is_owner());
create policy op_owner          on order_prices      for all to authenticated using (is_owner()) with check (is_owner());
-- (workers get read-only access to orders and order_items in migration 004; never to prices)

alter publication supabase_realtime add table orders, order_items;

-- ---------- function permissions ----------
revoke execute on function stock_booked(uuid, date, uuid)    from public, anon, authenticated;
revoke execute on function item_remaining(uuid, date, uuid)  from public, anon, authenticated;
revoke execute on function availability_range(date, date)    from public, anon;
grant  execute on function availability_range(date, date)    to authenticated;
grant  execute on function public_info()                     to anon, authenticated;
grant  execute on function public_catalog()                  to anon, authenticated;
grant  execute on function submit_order(text, text, text, text, date, date, jsonb) to anon, authenticated;
