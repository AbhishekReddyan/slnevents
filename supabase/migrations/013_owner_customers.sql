-- 013: owner can see basic customer details and reset a forgotten PIN. Run once, after 011.
create or replace function owner_customers() returns table (
  id uuid, name text, phone text, created_at timestamptz, order_count bigint, last_order_at timestamptz, locked boolean
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
    select c.id, c.name, c.phone, c.created_at,
           (select count(*) from orders o where o.customer_id = c.id),
           (select max(o.created_at) from orders o where o.customer_id = c.id),
           (c.locked_until is not null and c.locked_until > now())
      from customers c order by c.created_at desc;
end $$;

-- Sets a new 4-digit PIN chosen by the owner and clears any lock. The PIN itself is never readable afterwards.
create or replace function owner_reset_customer_pin(p_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_owner() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'The PIN must be exactly 4 digits'; end if;
  update customers set pin_hash = crypt(p_pin, gen_salt('bf', 8)), failed_attempts = 0, locked_until = null where id = p_id;
  if not found then raise exception 'Customer not found'; end if;
end $$;

revoke execute on function owner_customers()                   from public, anon;
revoke execute on function owner_reset_customer_pin(uuid, text) from public, anon;
grant  execute on function owner_customers()                   to authenticated;
grant  execute on function owner_reset_customer_pin(uuid, text) to authenticated;
