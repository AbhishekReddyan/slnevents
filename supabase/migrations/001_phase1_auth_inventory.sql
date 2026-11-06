-- =====================================================================
-- PHASE 1: roles, settings, categories, items, prices, photo storage
-- Run migrations 001 -> 004 in order in the Supabase SQL Editor.
-- =====================================================================

-- ---------- roles ----------
create type user_role as enum ('owner', 'worker', 'none');

create table settings (
  id               int primary key default 1 check (id = 1),   -- single row
  business_name    text not null default 'My Tent House',
  buffer_days      int  not null default 0 check (buffer_days between 0 and 14),
  show_prices      boolean not null default true,               -- show prices to customers
  timezone         text not null default 'Asia/Kolkata'
);
insert into settings (id) values (1);

create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  role       user_role not null default 'none',
  created_at timestamptz not null default now()
);

-- New auth users get a profile. Role comes ONLY from app_metadata, which
-- cannot be set by the user themselves (only by the service role / dashboard).
-- Anyone who somehow signs up gets role 'none' = zero access.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_app_meta_data->>'role')::user_role, 'none')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function handle_new_user();

-- ---------- role helpers (used by every RLS policy) ----------
create function app_role() returns text
language sql stable security definer set search_path = public as $$
  select role::text from profiles where id = auth.uid()
$$;
create function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_role() = 'owner', false)
$$;
create function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_role() in ('owner', 'worker'), false)
$$;

-- ---------- inventory ----------
create table categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order int not null default 0
);

create table items (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid references categories(id) on delete set null,
  name            text not null check (char_length(name) between 1 and 120),
  photo_url       text,
  total_qty       int not null default 0 check (total_qty >= 0),
  unavailable_qty int not null default 0 check (unavailable_qty >= 0),  -- damaged / in repair
  active          boolean not null default true,                         -- false = removed (kept for order history)
  created_at      timestamptz not null default now()
);
create index items_active_idx on items (active);

-- Prices live in their own table so that workers (who may read `items`)
-- can never read a price. Row-level security cannot hide single columns.
create table item_prices (
  item_id       uuid primary key references items(id) on delete cascade,
  price_per_day numeric(12,2) not null default 0 check (price_per_day >= 0)
);

-- ---------- row level security ----------
alter table settings    enable row level security;
alter table profiles    enable row level security;
alter table categories  enable row level security;
alter table items       enable row level security;
alter table item_prices enable row level security;

-- settings: staff read, owner write
create policy settings_read  on settings for select to authenticated using (is_staff());
create policy settings_write on settings for update to authenticated using (is_owner()) with check (is_owner());

-- profiles: you see yourself, owner sees and manages everyone
create policy profiles_self   on profiles for select to authenticated using (id = auth.uid() or is_owner());
create policy profiles_owner  on profiles for all    to authenticated using (is_owner()) with check (is_owner());

-- categories / items: staff read, owner write
create policy categories_read  on categories for select to authenticated using (is_staff());
create policy categories_write on categories for all    to authenticated using (is_owner()) with check (is_owner());
create policy items_read       on items      for select to authenticated using (is_staff());
create policy items_write      on items      for all    to authenticated using (is_owner()) with check (is_owner());

-- prices: OWNER ONLY
create policy item_prices_owner on item_prices for all to authenticated using (is_owner()) with check (is_owner());

-- ---------- photo storage ----------
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', true)
on conflict (id) do nothing;

create policy "owner uploads photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'item-photos' and public.is_owner());
create policy "owner updates photos" on storage.objects for update to authenticated
  using (bucket_id = 'item-photos' and public.is_owner());
create policy "owner deletes photos" on storage.objects for delete to authenticated
  using (bucket_id = 'item-photos' and public.is_owner());

-- ---------- realtime: owner/worker screens refresh instantly ----------
alter publication supabase_realtime add table items;

-- ---------- function permissions ----------
revoke execute on function handle_new_user() from public, anon, authenticated;
